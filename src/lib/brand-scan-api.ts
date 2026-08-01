import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { pollWorkflow } from '@/lib/poll-workflow';

export interface BrandScanInsights {
  identity: string;
  palette: string[];
  productFocus: string;
  visualStyle: string[];
  targetMarkets: string[];
  audience: string;
  basedIn: string;
  socialLinks: string[];
  otherInfo: string;
}

export const EMPTY_BRAND_SCAN_INSIGHTS: BrandScanInsights = {
  identity: '',
  palette: [],
  productFocus: '',
  visualStyle: [],
  targetMarkets: [],
  audience: '',
  basedIn: '',
  socialLinks: [],
  otherInfo: '',
};

export interface BrandScanResult {
  status: string;
  readinessLevel: string | null;
  errorCode: string | null;
  requestedUrl: string | null;
  insights: BrandScanInsights;
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function textValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const record = asRecord(value);
  if (!record) return '';
  for (const key of ['summary', 'description', 'value', 'hex', 'url', 'label', 'name']) {
    const text = textValue(record[key]);
    if (text) return text;
  }
  return '';
}

function listValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(textValue).filter(Boolean);
  }
  const record = asRecord(value);
  if (record) {
    return Object.values(record).flatMap(listValue).filter(Boolean);
  }
  const text = textValue(value);
  if (!text) return [];
  return text.split(/[,;|]/).map((item) => item.trim()).filter(Boolean);
}

function firstValue(records: JsonRecord[], aliases: string[]): unknown {
  for (const record of records) {
    for (const alias of aliases) {
      if (record[alias] !== undefined && record[alias] !== null) return record[alias];
    }
  }
  return undefined;
}

function collectCandidateRecords(scan: JsonRecord): JsonRecord[] {
  const records: JsonRecord[] = [scan];
  const queue: unknown[] = [
    scan.intelligence,
    scan.actual,
    scan.profile,
    scan.brand_profile,
    scan.current_brand_interpretation,
  ];
  const visited = new Set<JsonRecord>(records);

  while (queue.length > 0) {
    const record = asRecord(queue.shift());
    if (!record || visited.has(record)) continue;
    visited.add(record);
    records.push(record);
    for (const key of ['actual', 'profile', 'brand_profile', 'current_brand_interpretation', 'visual_identity', 'brand_identity']) {
      queue.push(record[key]);
    }
  }

  return records;
}

function unwrapScanResponse(value: unknown): JsonRecord {
  const result = asRecord(value);
  if (!result) throw new Error('Brand scan returned an invalid result.');
  const nodes = result.scan_storefront;
  if (Array.isArray(nodes)) {
    const first = asRecord(nodes[0]);
    if (first) return first;
  }
  const direct = asRecord(nodes);
  return direct ?? result;
}

/**
 * Parses the scanner's best-effort intelligence payload. The backend handoff
 * intentionally leaves the inner ScanResponse shape open, so aliases are
 * accepted here and the raw payload never leaks into rendering components.
 */
export function parseBrandScanResult(value: unknown): BrandScanResult {
  const scan = unwrapScanResponse(value);
  const records = collectCandidateRecords(scan);
  const identity = textValue(firstValue(records, [
    'brand_summary', 'summary', 'identity', 'brand_identity', 'positioning', 'aesthetic',
  ]));
  const visualStyle = listValue(firstValue(records, [
    'visual_style', 'visual_styles', 'style_tags', 'aesthetic_tags', 'photography_style', 'aesthetic',
  ]));

  return {
    status: textValue(scan.status) || 'completed',
    readinessLevel: textValue(scan.readiness_level) || null,
    errorCode: textValue(scan.error_code) || null,
    requestedUrl: textValue(scan.requested_url) || null,
    insights: {
      identity,
      palette: listValue(firstValue(records, [
        'palette', 'color_palette', 'colour_palette', 'colors', 'colours', 'logo_colors',
      ])),
      productFocus: listValue(firstValue(records, [
        'product_focus', 'product_categories', 'products', 'catalog_focus', 'category',
      ])).join(', '),
      visualStyle,
      targetMarkets: listValue(firstValue(records, [
        'target_markets', 'markets', 'primary_markets', 'geographies',
      ])),
      audience: textValue(firstValue(records, [
        'audience', 'target_audience', 'customer_profile', 'ideal_customer',
      ])),
      basedIn: textValue(firstValue(records, [
        'based_in', 'location', 'brand_location', 'headquarters',
      ])),
      socialLinks: listValue(firstValue(records, [
        'social_links', 'socials', 'social_urls',
      ])),
      otherInfo: textValue(firstValue(records, [
        'other_info', 'other_details', 'additional_details', 'notable_details',
      ])),
    },
  };
}

export function resolveBrandScanState(value: unknown): string {
  const data = asRecord(value);
  const runtime = asRecord(data?.runtime);
  const progress = asRecord(data?.progress);
  const raw = textValue(runtime?.state)
    || textValue(progress?.state)
    || textValue(data?.state)
    || textValue(data?.status)
    || 'running';
  const normalized = raw.toLowerCase();
  if (normalized === 'complete' || normalized === 'succeeded' || normalized === 'success') return 'completed';
  if (normalized === 'error' || normalized === 'errored') return 'failed';
  return normalized;
}

async function responseMessage(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  if (typeof body?.detail === 'string') return body.detail;
  if (typeof body?.error === 'string') return body.error;
  if (typeof body?.message === 'string') return body.message;
  return fallback;
}

/**
 * Brand-scan workflow contract:
 * - start: POST /api/brand/scan
 * - status: GET /api/status/{workflow_id}, every 2s
 * - result: GET /api/result/{workflow_id}, only after terminal status
 * - timeout: 450s (scanner node timeout is 420s)
 * - terminal states: completed, failed, budget_exhausted
 * - transient status 404 budget: 10; other status-error budget: 5
 * - cancellation: caller-owned AbortSignal, normally aborted on unmount/retry
 * - result parser: parseBrandScanResult above
 */
export async function runBrandScan(
  storefrontUrl: string,
  options: {
    signal?: AbortSignal;
    onStatus?: (status: unknown) => void;
  } = {},
): Promise<BrandScanResult | null> {
  const startResponse = await authenticatedFetch('/api/brand/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storefront_url: storefrontUrl }),
    signal: options.signal,
  });
  if (!startResponse.ok) {
    throw new Error(await responseMessage(startResponse, `Could not start the brand scan (${startResponse.status}).`));
  }

  const startData = await startResponse.json();
  const workflowId = textValue(startData?.workflow_id);
  if (!workflowId) throw new Error('Brand scan did not return a workflow ID.');

  const encodedId = encodeURIComponent(workflowId);
  const outcome = await pollWorkflow<BrandScanResult>({
    fetchStatus: () => authenticatedFetch(`/api/status/${encodedId}`, { signal: options.signal }),
    fetchResult: () => authenticatedFetch(`/api/result/${encodedId}`, { signal: options.signal }),
    resolveState: resolveBrandScanState,
    parseResult: parseBrandScanResult,
    intervalMs: 2_000,
    timeoutMs: 450_000,
    max404s: 10,
    maxPollErrors: 5,
    maxResultRetries: 8,
    resultRetryDelayMs: 1_000,
    signal: options.signal,
    onStatusData: options.onStatus,
  });

  return outcome.status === 'completed' ? outcome.result : null;
}
