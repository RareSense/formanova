import { AuthExpiredError, authenticatedFetch } from '@/lib/authenticated-fetch';
import { pollWorkflow } from '@/lib/poll-workflow';
import { colorListValue } from '@/lib/brand-colors';
import {
  createBrandScanProgressTimeline,
  EMPTY_BRAND_SCAN_PROGRESS,
  mergeBrandScanProgress,
  type BrandScanProgress,
} from '@/lib/brand-scan-progress';

export {
  EMPTY_BRAND_SCAN_PROGRESS,
  mergeBrandScanProgress,
} from '@/lib/brand-scan-progress';
export type { BrandScanPhase, BrandScanProgress } from '@/lib/brand-scan-progress';

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
  errorMessage: string | null;
  requestedUrl: string | null;
  confirmedAt?: string | null;
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
  for (const key of ['summary', 'description', 'message', 'detail', 'error', 'value', 'hex', 'url', 'label', 'name']) {
    const text = textValue(record[key]);
    if (text) return text;
  }
  return '';
}

function listValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueValues(value.map(textValue).filter(Boolean));
  }
  const record = asRecord(value);
  if (record) {
    if (record.values !== undefined) return listValue(record.values);
    if (record.value !== undefined) return listValue(record.value);
    return uniqueValues(Object.values(record).flatMap(listValue).filter(Boolean));
  }
  const text = textValue(value);
  if (!text) return [];
  return uniqueValues(text.split(/[,;|]/).map((item) => item.trim()).filter(Boolean));
}

function uniqueValues(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function firstValue(records: JsonRecord[], aliases: string[]): unknown {
  for (const record of records) {
    for (const alias of aliases) {
      if (record[alias] !== undefined && record[alias] !== null) return record[alias];
    }
  }
  return undefined;
}

function valuesFor(records: JsonRecord[], aliases: string[]): unknown[] {
  return records.flatMap((record) => aliases
    .filter((alias) => record[alias] !== undefined && record[alias] !== null)
    .map((alias) => record[alias]));
}

function humanLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function evidenceSocialLinks(evidence: JsonRecord): string[] {
  const identityLinks = asRecord(evidence.identity_links);
  const observations = Array.isArray(identityLinks?.observations) ? identityLinks.observations : [];
  return uniqueValues(observations.flatMap((observation) => {
    const record = asRecord(observation);
    if (!record) return [];
    const preferredUrl = textValue(record.normalized_url) || textValue(record.original_url);
    return preferredUrl ? [preferredUrl] : [];
  }));
}

function evidenceVisualStyles(evidence: JsonRecord): string[] {
  const images = Array.isArray(evidence.images) ? evidence.images : [];
  return uniqueValues(images.map((image) => {
    const role = textValue(asRecord(image)?.visual_role);
    return role ? humanLabel(role) : '';
  }).filter(Boolean));
}

function homepageDescription(evidence: JsonRecord): string {
  const pages = Array.isArray(evidence.pages) ? evidence.pages : [];
  const homepage = pages.map(asRecord).find((page) => textValue(page?.page_type) === 'home');
  return textValue(homepage?.description);
}

function channelSummary(value: unknown): string {
  const channels = asRecord(value);
  if (!channels) return '';
  return Object.entries(channels).map(([channel, details]) => {
    const record = asRecord(details);
    if (!record) return `${humanLabel(channel)}: ${textValue(details)}`;
    const facts = Object.entries(record)
      .map(([key, fact]) => `${humanLabel(key)}: ${textValue(fact)}`)
      .filter((fact) => !fact.endsWith(': '));
    return facts.length > 0 ? `${humanLabel(channel)} — ${facts.join('; ')}` : '';
  }).filter(Boolean).join('\n');
}

function supplementalInfo(records: JsonRecord[], scan: JsonRecord, evidence: JsonRecord): string {
  const identity = asRecord(firstValue(records, ['brand_identity', 'visual_identity']));
  const readiness = asRecord(evidence.intelligence_readiness);
  const coverage = asRecord(evidence.coverage);
  const genderFocus = listValue(firstValue(records, ['gender_focus']));
  const audienceCues = listValue(firstValue(records, ['apparent_ethnicities']));
  const pricePositioning = textValue(firstValue(records, ['price_positioning']));
  const fonts = listValue(identity?.fonts);
  const materials = listValue(evidence.discovered_material_terms);
  const categories = listValue(evidence.discovered_categories);
  const readinessReasons = listValue(readiness?.reasons);
  const sources = listValue(firstValue([scan, ...records], ['sources']));
  const confidenceValue = firstValue(records, ['confidence']);
  const confidence = typeof confidenceValue === 'number'
    ? `${Math.round(confidenceValue <= 1 ? confidenceValue * 100 : confidenceValue)}%`
    : textValue(confidenceValue);
  const model = asRecord(firstValue(records, ['model_demographics', 'model_profile']));
  const visualDirection = asRecord(firstValue(records, ['visual_direction']));
  const ownership = asRecord(firstValue(records, ['aesthetic_ownership']));
  const detailLine = (label: string, value: unknown): string => {
    const details = listValue(value);
    return details.length > 0 ? `${label}: ${details.join(', ')}` : '';
  };

  return uniqueValues([
    textValue(firstValue(records, ['other_info', 'other_details', 'additional_details', 'notable_details'])),
    genderFocus.length > 0 ? `Gender focus: ${genderFocus.join(', ')}` : '',
    audienceCues.length > 0 ? `Apparent audience cues: ${audienceCues.join(', ')}` : '',
    pricePositioning ? `Price positioning: ${pricePositioning}` : '',
    textValue(firstValue(records, ['seller_model']))
      ? `Seller model: ${humanLabel(textValue(firstValue(records, ['seller_model'])))}`
      : '',
    textValue(firstValue(records, ['niche'])) ? `Niche: ${textValue(firstValue(records, ['niche']))}` : '',
    detailLine('Brand voice', firstValue(records, ['voice'])),
    detailLine('Photography language', firstValue(records, ['photography'])),
    detailLine('Shot types', firstValue(records, ['shot_types_present', 'product_shot_types'])),
    detailLine('Product shot style', firstValue(records, ['product_shot_style'])),
    detailLine('Product shot mood', firstValue(records, ['product_shot_vibe'])),
    model ? detailLine('Model presentation', [
      model.gender_presentation,
      model.ethnicity_presentation,
      model.age_group_presentation,
    ].map(textValue).filter(Boolean).map(humanLabel)) : '',
    detailLine('Model styling', firstValue(records, ['model_styling_and_presentation'])),
    detailLine('Model shot mood', firstValue(records, ['model_shot_vibe'])),
    detailLine('Campaign and ad style', firstValue(records, ['campaign_or_ad_style'])),
    detailLine('Preserve', visualDirection?.preserve),
    detailLine('Explore', visualDirection?.explore),
    detailLine('Avoid', visualDirection?.avoid),
    detailLine('Merchant controlled aesthetic', ownership?.merchant_controlled),
    detailLine('Assortment curation', ownership?.assortment_curation),
    detailLine('Contradictions to confirm', firstValue(records, ['contradictions'])),
    detailLine('Still missing', firstValue(records, ['missing_information'])),
    detailLine('Useful confirmation questions', firstValue(records, ['merchant_confirmation_questions'])),
    materials.length > 0 ? `Materials found: ${materials.join(', ')}` : '',
    categories.length > 0 ? `Categories found: ${categories.join(', ')}` : '',
    fonts.length > 0 ? `Brand fonts: ${fonts.join(', ')}` : '',
    confidence ? `Confidence: ${confidence}` : '',
    textValue(readiness?.level) ? `Scan readiness: ${humanLabel(textValue(readiness?.level))}` : '',
    readinessReasons.length > 0 ? `Scan limitations: ${readinessReasons.join(' ')}` : '',
    typeof coverage?.products === 'number' ? `Coverage: ${coverage.products} products, ${textValue(coverage.collections) || '0'} collections, ${textValue(coverage.representative_images) || '0'} representative images` : '',
    sources.length > 0 ? `Sources analyzed: ${sources.join(', ')}` : '',
    channelSummary(firstValue(records, ['channels'])),
  ].filter(Boolean)).join('\n');
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
    if (nodes.length === 0) {
      return { status: 'partial', readiness_level: 'non_storefront' };
    }
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
  const rootActual = asRecord(scan.actual);
  const evidence = asRecord(scan.evidence) ?? asRecord(rootActual?.evidence) ?? {};
  const readiness = asRecord(evidence.intelligence_readiness);
  const marketScope = asRecord(evidence.market_scope);
  const records = collectCandidateRecords(scan);
  const identity = textValue(firstValue(records, [
    'brand_summary', 'summary', 'identity', 'positioning',
  ])) || homepageDescription(evidence);
  const visualStyle = uniqueValues(valuesFor(records, [
    'visual_style', 'visual_styles', 'style_tags', 'aesthetic_tags', 'aesthetic', 'photography_style',
  ]).flatMap(listValue).concat(evidenceVisualStyles(evidence)));
  const interpretedPalette = uniqueValues(valuesFor(records, [
    'palette', 'color_palette', 'colour_palette', 'colors', 'colours', 'logo_colors',
  ]).flatMap(colorListValue));
  const measuredSitePalette = colorListValue(evidence.measured_site_palette);
  const measuredPhotoPalette = colorListValue(evidence.measured_photo_palette);
  const palette = interpretedPalette.length > 0
    ? interpretedPalette
    : measuredSitePalette.length > 0 ? measuredSitePalette : measuredPhotoPalette;
  const productFocus = uniqueValues(valuesFor(records, [
    'product_focus', 'product_categories', 'products', 'catalog_focus', 'category',
  ]).flatMap(listValue).concat(listValue(evidence.discovered_categories)));
  const targetMarkets = uniqueValues(valuesFor(records, [
    'target_markets', 'markets', 'primary_markets', 'geographies',
  ]).flatMap(listValue).concat(listValue(marketScope?.selected_markets)));
  const socialLinks = uniqueValues(valuesFor(records, [
    'social_links', 'socials', 'social_urls',
  ]).flatMap(listValue).concat(evidenceSocialLinks(evidence)));

  return {
    status: textValue(scan.status) || 'completed',
    readinessLevel: textValue(scan.readiness_level) || textValue(readiness?.level) || null,
    errorCode: textValue(scan.error_code) || null,
    errorMessage: textValue(scan.error) || textValue(scan.message) || textValue(scan.detail) || null,
    requestedUrl: textValue(scan.requested_url) || textValue(evidence.canonical_url) || null,
    insights: {
      identity,
      palette,
      productFocus: productFocus.join(', '),
      visualStyle,
      targetMarkets,
      audience: uniqueValues(valuesFor(records, [
        'audience', 'target_audience', 'likely_audience', 'customer_profile', 'ideal_customer',
      ]).flatMap(listValue)).join(', '),
      basedIn: textValue(firstValue(records, [
        'based_in', 'location', 'brand_location', 'headquarters',
      ])),
      socialLinks,
      otherInfo: supplementalInfo(records, scan, evidence),
    },
  };
}

function failedBrandScanResult(statusData: unknown, fallback: unknown): BrandScanResult {
  const data = asRecord(statusData) ?? {};
  const runtime = asRecord(data.runtime) ?? {};
  const records = [data, runtime];
  const state = resolveBrandScanState(statusData);
  const fallbackMessage = fallback instanceof Error ? fallback.message : '';

  return {
    status: state === 'budget_exhausted' ? state : 'failed',
    readinessLevel: null,
    errorCode: textValue(firstValue(records, ['error_code', 'code'])) || null,
    errorMessage: textValue(firstValue(records, ['error', 'message', 'detail'])) || fallbackMessage || null,
    requestedUrl: textValue(firstValue(records, ['requested_url'])) || null,
    insights: EMPTY_BRAND_SCAN_INSIGHTS,
  };
}

export function resolveBrandScanState(value: unknown): string {
  const data = asRecord(value);
  const runtime = asRecord(data?.runtime);
  const progress = asRecord(data?.progress);
  const phaseState = textValue(data?.phase_state).toLowerCase();
  const raw = (phaseState && phaseState !== 'unknown' ? phaseState : '')
    || textValue(runtime?.state)
    || textValue(progress?.state)
    || textValue(data?.state)
    || textValue(data?.status)
    || 'running';
  const normalized = raw.toLowerCase();
  if (normalized === 'complete' || normalized === 'succeeded' || normalized === 'success') return 'completed';
  if (normalized === 'error' || normalized === 'errored') return 'failed';
  if (['timed_out', 'timeout', 'cancelled', 'canceled', 'terminated'].includes(normalized)) return 'failed';
  return normalized;
}

async function responseMessage(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  if (typeof body?.detail === 'string') return body.detail;
  if (typeof body?.error === 'string') return body.error;
  if (typeof body?.message === 'string') return body.message;
  if (typeof body?.storefront_url === 'string') return body.storefront_url;
  return fallback;
}

async function fetchRecentBrandScanResult(signal?: AbortSignal): Promise<BrandScanResult> {
  const response = await authenticatedFetch('/api/user/profile', { signal });
  if (!response.ok) {
    throw new Error(await responseMessage(response, 'Could not load your saved brand scan.'));
  }
  const profile = asRecord(await response.json()) ?? {};
  const actual = asRecord(profile.actual) ?? {};
  const confirmedAt = textValue(profile.confirmed_at) || null;
  if (Object.keys(actual).length === 0) {
    return {
      status: 'partial',
      readinessLevel: null,
      errorCode: 'saved_profile_missing',
      errorMessage: 'The saved scan is unavailable. Rescan the storefront to refresh it.',
      requestedUrl: textValue(profile.storefront_url) || null,
      confirmedAt,
      insights: EMPTY_BRAND_SCAN_INSIGHTS,
    };
  }

  return {
    ...parseBrandScanResult({
      status: 'completed',
      requested_url: profile.storefront_url,
      actual,
    }),
    confirmedAt,
  };
}

/**
 * Brand-scan workflow contract:
 * - start: POST /api/brand/scan
 * - status: GET /api/status/{workflow_id} plus /phases, every 1s
 * - result: GET /api/result/{workflow_id}, only after terminal status
 * - timeout: 450s (scanner node timeout is 420s)
 * - terminal states: completed; failed/budget_exhausted/timed_out/cancelled/terminated fail
 * - status 404 policy: use /phases while available; otherwise fail immediately
 * - cancellation: caller-owned AbortSignal, normally aborted on unmount/retry
 * - result parser: parseBrandScanResult above
 */
export async function runBrandScan(
  storefrontUrl: string,
  options: {
    signal?: AbortSignal;
    force?: boolean;
    onStatus?: (status: unknown) => void;
    onProgress?: (progress: BrandScanProgress) => void;
  } = {},
): Promise<BrandScanResult | null> {
  const startBody: { storefront_url: string; force?: boolean } = { storefront_url: storefrontUrl };
  if (options.force) startBody.force = true;
  const startResponse = await authenticatedFetch('/api/brand/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(startBody),
    signal: options.signal,
  });
  if (!startResponse.ok) {
    if (startResponse.status === 409) {
      throw new Error('Brand scan is temporarily unavailable. Please try again later.');
    }
    throw new Error(await responseMessage(startResponse, `Could not start the brand scan (${startResponse.status}).`));
  }

  const startData = await startResponse.json();
  const workflowId = textValue(startData?.workflow_id);
  if (!workflowId) throw new Error('Brand scan did not return a workflow ID.');
  if (textValue(startData?.deduplicated).toLowerCase() === 'recent') {
    return fetchRecentBrandScanResult(options.signal);
  }

  const encodedId = encodeURIComponent(workflowId);
  let lastStatusData: unknown;
  const progressTimeline = options.onProgress
    ? createBrandScanProgressTimeline(options.onProgress)
    : null;

  const fetchStatusWithProgress = async (): Promise<Response> => {
    const [statusAttempt, phaseAttempt] = await Promise.allSettled([
      authenticatedFetch(`/api/status/${encodedId}`, { signal: options.signal }),
      authenticatedFetch(`/api/status/${encodedId}/phases`, { signal: options.signal }),
    ]);
    const attempts = [statusAttempt, phaseAttempt];
    for (const attempt of attempts) {
      if (attempt.status !== 'rejected') continue;
      const error = attempt.reason;
      if (error instanceof AuthExpiredError || (error instanceof Error && error.name === 'AbortError')) throw error;
    }
    const rejected = attempts.find((attempt) => attempt.status === 'rejected');

    const statusResponse = statusAttempt.status === 'fulfilled' ? statusAttempt.value : null;
    const phaseResponse = phaseAttempt.status === 'fulfilled' ? phaseAttempt.value : null;
    const phaseData = phaseResponse?.ok ? await phaseResponse.json() : null;

    if (!statusResponse?.ok && !phaseResponse?.ok) {
      if (statusResponse) return statusResponse;
      if (phaseResponse) return phaseResponse;
      throw rejected?.status === 'rejected' ? rejected.reason : new Error('Brand scan status is unavailable.');
    }

    const statusData = statusResponse?.ok ? await statusResponse.json() : {};
    const phaseRecord = asRecord(phaseData);

    return new Response(JSON.stringify({
      ...(asRecord(statusData) ?? {}),
      phase_state: textValue(phaseRecord?.state),
      scan_progress_events: phaseData,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const outcome = await pollWorkflow<BrandScanResult>({
      fetchStatus: fetchStatusWithProgress,
      fetchResult: () => authenticatedFetch(`/api/result/${encodedId}`, { signal: options.signal }),
      resolveState: resolveBrandScanState,
      parseResult: parseBrandScanResult,
      intervalMs: 1_000,
      timeoutMs: 450_000,
      max404s: 1,
      maxPollErrors: 5,
      maxResultRetries: 8,
      resultRetryDelayMs: 1_000,
      signal: options.signal,
      onStatusData: (statusData) => {
        lastStatusData = statusData;
        options.onStatus?.(statusData);
        progressTimeline?.ingest(statusData);
      },
    });

    return outcome.status === 'completed' ? outcome.result : null;
  } catch (error) {
    const terminalState = resolveBrandScanState(lastStatusData);
    if (terminalState === 'failed' || terminalState === 'budget_exhausted') {
      return failedBrandScanResult(lastStatusData, error);
    }
    throw error;
  } finally {
    progressTimeline?.stop();
  }
}
