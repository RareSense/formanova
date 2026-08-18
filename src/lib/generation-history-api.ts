/**
 * Generation History API
 * Fetches workflow history from the backend using relative /api paths.
 * Uses authenticatedFetch for JWT Bearer auth.
 */

import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { azureUriToUrl } from '@/lib/azure-utils';
import { parseRingCadResult } from '@/lib/ring-cad-nurbs-api';
const __DEV__ = import.meta.env.DEV;

// ─── Types ──────────────────────────────────────────────────────────

export type SourceType = 'photo' | 'product_shot' | 'cad_render' | 'text_to_cad' | 'image_to_cad' | 'unknown';

export interface WorkflowSummary {
  workflow_id: string;
  name: string;
  status: string;
  created_at: string;
  finished_at: string | null;
  source_type: SourceType;
  /** Optional thumbnail extracted from workflow details (populated client-side) */
  thumbnail_url?: string;
  /** All angle screenshots for Text-to-CAD workflows (populated client-side) */
  screenshots?: { angle: string; url: string }[];
  /** GLB download URL (populated client-side from workflow details) */
  glb_url?: string | null;
  /** GLB file name extracted from the azure URI */
  glb_filename?: string | null;
  /** Machinable Rhino file returned by ring_cad_nurbs_v1 */
  threedm_url?: string | null;
  /** AI model tier used (e.g. 'gemini', 'claude-sonnet', 'claude-opus') — populated client-side */
  ai_model?: string | null;
  /** Mode from workflow input (e.g. 'lite', 'standard', 'premium') — available in list response */
  mode?: string | null;
  /** Total credits spent on this generation — populated from /credits/audit endpoint */
  credits_spent?: number | null;
  /** UUID of the vault asset produced by this run, or null for failed/pre-vault runs */
  output_asset_id?: string | null;
  /** User-friendly name from the vault asset (e.g. "Photoshoot 3") — populated during enrichment */
  output_asset_name?: string | null;
}

export interface WorkflowStep {
  tool: string;
  version: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  deterministic: boolean;
  took_ms: number;
  at: string;
  /** New API fields */
  node_instance_id?: string;
  is_success?: boolean;
  output_data?: Record<string, unknown>;
  attempt_seq?: number;
  created_at?: string;
}

export interface WorkflowDetail {
  summary: {
    id: string;
    name: string;
    status: string;
    created_at: string;
    finished_at: string | null;
  };
  steps: WorkflowStep[];
}

function extractOutputAssetId(workflow: any): string | null {
  return (
    workflow.output_asset_id ??
    workflow.output_asset?.id ??
    workflow.output_asset?.asset_id ??
    workflow.result?.output_asset_id ??
    workflow.result?.output_asset?.id ??
    null
  );
}

function extractOutputAssetName(workflow: any): string | null {
  return (
    workflow.output_asset_name ??
    workflow.asset_name ??
    workflow.display_name ??
    workflow.output_asset?.name ??
    workflow.output_asset?.display_name ??
    workflow.result?.output_asset_name ??
    workflow.result?.asset_name ??
    workflow.result?.output_asset?.name ??
    workflow.result?.output_asset?.display_name ??
    null
  );
}

// ─── API Functions ──────────────────────────────────────────────────

/**
 * List the authenticated user's workflows.
 * Backend: GET /history/workflows/me?limit=N&offset=M
 */
export async function listMyWorkflows(
  limit = 100,
  offset = 0,
): Promise<WorkflowSummary[]> {
  const res = await authenticatedFetch(
    `/history/workflows/me?limit=${limit}&offset=${offset}`,
  );

  if (!res.ok) {
    const text = await res.text();
    console.error('[HistoryAPI] list failed:', res.status, text.substring(0, 200));
    throw new Error(`Failed to list workflows: ${res.status}`);
  }

  const contentType = res.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    const text = await res.text();
    console.error('[HistoryAPI] Expected JSON, got:', contentType, text.substring(0, 200));
    throw new Error(`API returned non-JSON response (${contentType}). The endpoint may not exist yet.`);
  }

  const data = await res.json();

  // Normalize — backend may return array or { workflows: [...] }
  const raw: any[] = Array.isArray(data) ? data : (data.workflows ?? []);

  const mapped = raw.map((w: any) => {
    const name = w.name ?? '';
    const referenceImageCount = typeof w.input?.reference_image_count === 'number'
      ? w.input.reference_image_count
      : Array.isArray(w.input?.reference_images)
        ? w.input.reference_images.length
        : null;
    // The consolidated ring workflow serves both text and image inputs, so its
    // actual input count is the only reliable discriminator when the backend
    // still returns source_type="unknown".
    const sourceType = resolveSourceType(w.source_type, name, referenceImageCount);
    if (sourceType === 'unknown' && __DEV__) {
      console.warn('[HistoryAPI] unknown source_type for workflow:', { id: w.workflow_id ?? w.id, name, status: w.status, backend_source_type: w.source_type });
    }
    return {
      workflow_id: w.workflow_id ?? w.id,
      name,
      status: w.status ?? 'unknown',
      created_at: w.created_at ?? w.started_at ?? '',
      finished_at: w.finished_at ?? null,
      source_type: sourceType,
      mode: w.input?.mode ?? null,
      output_asset_id: extractOutputAssetId(w),
      output_asset_name: extractOutputAssetName(w),
    };
  });
  if (__DEV__) {
    console.log('[HistoryAPI] source_type breakdown:', {
      photo: mapped.filter(w => w.source_type === 'photo').length,
      product_shot: mapped.filter(w => w.source_type === 'product_shot').length,
      text_to_cad: mapped.filter(w => w.source_type === 'text_to_cad').length,
      cad_render: mapped.filter(w => w.source_type === 'cad_render').length,
      image_to_cad: mapped.filter(w => w.source_type === 'image_to_cad').length,
      unknown: mapped.filter(w => w.source_type === 'unknown').length,
    });
  }
  return mapped;
}

/**
 * Get full details for a single workflow.
 * Backend: GET /history/workflow/{id}/details
 */
export async function getWorkflowDetails(
  workflowId: string,
): Promise<WorkflowDetail> {
  const res = await authenticatedFetch(
    `/history/workflow/${workflowId}/details`,
  );

  if (!res.ok) {
    const text = await res.text();
    console.error('[HistoryAPI] detail failed:', res.status, text.substring(0, 200));
    throw new Error(`Failed to fetch workflow: ${res.status}`);
  }

  const contentType = res.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    const text = await res.text();
    console.error('[HistoryAPI] Expected JSON, got:', contentType, text.substring(0, 200));
    throw new Error(`API returned non-JSON response`);
  }

  const raw = await res.json();

  // Dev-only detailed logging
  if (__DEV__) {
    console.debug('[HistoryAPI] detail raw response keys:', Object.keys(raw ?? {}));
    const stepsSource = raw?.data?.steps ?? raw?.workflow?.steps ?? raw?.result?.steps ?? raw?.steps ?? raw?.workflow_steps ?? [];
    console.debug('[HistoryAPI] steps count:', stepsSource.length);
  }

  // Normalize: backend may wrap response in different shapes
  const payload = raw?.data ?? raw?.workflow ?? raw?.result ?? raw;
  return {
    summary: payload?.summary ?? {
      id: payload?.workflow_id ?? payload?.id ?? workflowId,
      name: payload?.name ?? '',
      status: payload?.status ?? 'unknown',
      created_at: payload?.created_at ?? '',
      finished_at: payload?.finished_at ?? null,
    },
    steps: (payload?.steps ?? payload?.workflow_steps ?? []).map((s: any) => ({
      ...s,
      // Normalize output_data → output so extraction helpers always find it
      output: s.output ?? s.output_data ?? {},
    })),
  };
}

// ─── CAD Result (sink-based fallback) ───────────────────────────────

/**
 * Fetch the final result for a CAD workflow using the /result endpoint.
 *
 * ring_cad_nurbs_v1 returns a flat object (threedm_artifact/glb_artifact at
 * the top level) — that shape is tried first via parseRingCadResult. Older
 * CAD workflows (ring_generate_v1, ring_edit_v1) return the nested
 * node_results shape below and never carry a .3dm, so threedm_url is null
 * for those. Both paths route through azureUriToUrl so every returned URL is
 * this app's same-origin, auth-gated artifact proxy rather than a raw
 * azure:// reference or an unauthenticated cross-origin host.
 *
 * Legacy sink-based fallback rule:
 *   success_final → glb_artifact (final output, preferred) → original_glb_artifact (intermediate)
 *   success_original_glb → original_glb_artifact
 *   failed_final → null (no fallback)
 */
export async function fetchCadResult(
  workflowId: string,
): Promise<{ glb_url: string | null; threedm_url: string | null; azure_source: string | null }> {
  function extractArtifactUri(results: Record<string, unknown>, nodeKey: string, artifactKey: string): string | null {
    const node = results[nodeKey];
    if (!node) return null;
    const arr = Array.isArray(node) ? node : [node];
    for (const entry of arr) {
      const rec = entry as Record<string, unknown> | null;
      if (!rec) continue;
      const artifact = rec[artifactKey] as Record<string, unknown> | undefined;
      if (artifact && typeof artifact.uri === 'string') return artifact.uri;
    }
    return null;
  }

  const resolveUrl = (uri: string | null): string | null => (uri ? (azureUriToUrl(uri) || uri) : null);

  try {
    const res = await authenticatedFetch(
      `/api/result/${workflowId}`,
    );
    if (!res.ok) return { glb_url: null, threedm_url: null, azure_source: null };

    const data = await res.json() as Record<string, unknown>;

    // 0. ring_cad_nurbs_v1's flat (or sink-node-keyed) result shape, tried
    // first — but only when the response isn't one of the older workflows'
    // known sink shapes. parseRingCadResult's deep search would otherwise
    // find artifacts nested inside success_final/build_retry/etc and bypass
    // the legacy precedence rules (success_final > success_original_glb >
    // failed_final's build_initial-only rule > build_retry) below.
    const LEGACY_SINK_KEYS = ['success_final', 'success_original_glb', 'failed_final', 'build_retry', 'build_initial'];
    const isLegacyShape = LEGACY_SINK_KEYS.some((key) => key in data);
    if (!isLegacyShape) {
      try {
        const flat = parseRingCadResult(data);
        return {
          glb_url: flat.glbArtifact?.url ?? null,
          threedm_url: flat.threedmArtifact?.url ?? null,
          azure_source: flat.sourceStage,
        };
      } catch {
        // Not a ring_cad_nurbs_v1 result — fall through to the legacy nested shape.
      }
    }

    // 1. success_final: prefer glb_artifact (final output), fallback original_glb_artifact
    const finalUri = extractArtifactUri(data, 'success_final', 'glb_artifact')
      || extractArtifactUri(data, 'success_final', 'original_glb_artifact');
    if (finalUri) {
      return { glb_url: resolveUrl(finalUri), threedm_url: null, azure_source: 'success_final' };
    }

    // 2. success_original_glb: use original_glb_artifact only
    const originalUri = extractArtifactUri(data, 'success_original_glb', 'original_glb_artifact');
    if (originalUri) {
      return { glb_url: resolveUrl(originalUri), threedm_url: null, azure_source: 'success_original_glb' };
    }

    // 3. failed_final: only build_initial is allowed as fallback
    const failedArr = data['failed_final'];
    if (Array.isArray(failedArr) && failedArr.length > 0) {
      const failedInitialUri = extractArtifactUri(data, 'build_initial', 'glb_artifact')
        || extractArtifactUri(data, 'build_initial', 'original_glb_artifact');
      if (failedInitialUri) {
        return { glb_url: resolveUrl(failedInitialUri), threedm_url: null, azure_source: 'build_initial' };
      }
      return { glb_url: null, threedm_url: null, azure_source: 'failed_final' };
    }

    // 4. ring_edit_v1 currently returns build nodes rather than success sinks.
    const buildUri = extractArtifactUri(data, 'build_retry', 'glb_artifact')
      || extractArtifactUri(data, 'build_retry', 'original_glb_artifact')
      || extractArtifactUri(data, 'build_initial', 'glb_artifact')
      || extractArtifactUri(data, 'build_initial', 'original_glb_artifact');
    if (buildUri) {
      return { glb_url: resolveUrl(buildUri), threedm_url: null, azure_source: 'build_retry' };
    }

    return { glb_url: null, threedm_url: null, azure_source: null };
  } catch (e) {
    if (__DEV__) console.warn('[HistoryAPI] fetchCadResult error:', workflowId, e);
    return { glb_url: null, threedm_url: null, azure_source: null };
  }
}

// ─── Credit Audit ───────────────────────────────────────────────────

/**
 * Fetch the credit audit for a workflow.
 * Backend: GET /credits/audit/{workflow_id}
 * Uses JWT Bearer auth (no X-API-Key needed from client).
 * Returns total credits spent for this workflow.
 */
export async function fetchWorkflowCreditAudit(
  workflowId: string,
): Promise<number | null> {
  try {
    const res = await authenticatedFetch(
      `/api/credits/audit/${workflowId}`,
    );

    if (!res.ok) {
      if (__DEV__) console.warn('[HistoryAPI] credit audit failed:', res.status, workflowId);
      return null;
    }

    const data = await res.json();
    const credits = extractWorkflowCredits(data);
    if (credits !== null) return credits;

    if (__DEV__) console.warn('[HistoryAPI] credit audit: could not extract cost from response', workflowId, Object.keys(data));
    return null;
  } catch (e) {
    if (__DEV__) console.warn('[HistoryAPI] credit audit error:', workflowId, e);
    return null;
  }
}

function numericCredits(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

/** Normalizes every currently shipped credit-audit response shape. */
export function extractWorkflowCredits(payload: unknown): number | null {
  if (Array.isArray(payload)) {
    let found = false;
    const total = payload.reduce((sum, item) => {
      const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      const value = numericCredits(record.cost ?? record.amount ?? record.credits);
      if (value === null) return sum;
      found = true;
      return sum + value;
    }, 0);
    return found ? total : null;
  }

  if (!payload || typeof payload !== 'object') return null;
  const data = payload as Record<string, any>;
  const wrappers = [data, data.data, data.result, data.financials].filter(
    (value): value is Record<string, any> => Boolean(value && typeof value === 'object' && !Array.isArray(value)),
  );

  for (const record of wrappers) {
    for (const key of ['actual_user_billed', 'total_charged', 'total_cost', 'total', 'credits_spent']) {
      const value = numericCredits(record[key]);
      if (value !== null) return value;
    }
  }

  for (const record of wrappers) {
    const items = record.line_items ?? record.items ?? record.audit;
    if (Array.isArray(items)) {
      const total = extractWorkflowCredits(items);
      if (total !== null) return total;
    }
  }

  return null;
}

// ─── Helpers ────────────────────────────────────────────────────────

/** Infer the source type from the workflow name */
export function inferSourceType(name: string): SourceType {
  const lower = name.toLowerCase();

  // Text-to-CAD workflows (ring_full_pipeline, ring_generate, text_to_cad, etc.)
  if (
    lower.includes('ring_full_pipeline') ||
    lower.includes('ring_generate') ||
    lower.includes('text_to_cad') ||
    lower.includes('text-to-cad') ||
    lower.includes('ring-generate') ||
    (lower.includes('ring') && lower.includes('pipeline')) ||
    (lower.includes('ring') && lower.includes('generate'))
  )
    return 'text_to_cad';

  // Image-to-3D workflows. ring_cad_nurbs_v1 names neither 'sketch' nor 'image'
  // but does contain 'cad', so it must be matched before the cad_render check
  // or it lands in the wrong history section.
  if (lower.includes('ring_cad_nurbs') || lower.includes('ring-cad-nurbs')) return 'image_to_cad';

  // Sketch-to-CAD workflows
  if (lower.includes('sketch')) return 'image_to_cad';

  // CAD render workflows
  if (lower.includes('cad') || lower.includes('render')) return 'cad_render';

  // Product shot workflows
  if (lower.includes('product_shot') || lower.includes('product-shot'))
    return 'product_shot';

  // Post-generation upscales surface as their own photo entries in history.
  if (lower.includes('upscale')) return 'photo';

  // Photo workflows (jewelry photoshoot, masking, flux gen, etc.). Includes
  // model_shot so High Effort model runs and their fixes classify here even when
  // the backend source_type is unrecognized: the generate name carries 'photo'/
  // 'jewelry', but 'fix_model_shot_higher_tier' has neither, so match model_shot.
  if (
    lower.includes('photo') ||
    lower.includes('model_shot') ||
    lower.includes('model-shot') ||
    lower.includes('masking') ||
    lower.includes('flux') ||
    lower.includes('necklace') ||
    lower.includes('earring') ||
    lower.includes('bracelet') ||
    lower.includes('watch') ||
    lower.includes('jewelry') ||
    lower.includes('agentic')
  )
    return 'photo';

  return 'unknown';
}

/**
 * Backend `source_type` enum -> the app's coarser SourceType bucket.
 * The backend distinguishes generate vs fix vs upscale within a family; the UI only
 * cares about the family bucket, so fixes and upscales
 * collapse into their generate family. Unrecognized/future values are intentionally
 * absent here so they fall through to unknown (or the name-parse fallback).
 */
const BACKEND_SOURCE_TYPE_MAP: Record<string, SourceType> = {
  model_shot: 'photo',
  model_fix: 'photo',
  upscale: 'photo',
  product_shot: 'product_shot',
  product_fix: 'product_shot',
  text_to_cad: 'text_to_cad',
  image_to_cad: 'image_to_cad',
  // Backward-compatible API aliases. They are normalized at this boundary and
  // never become the application's canonical source type.
  cad_text: 'text_to_cad',
  cad_sketch: 'image_to_cad',
  cad_render: 'cad_render',
};

/**
 * Resolve a workflow's SourceType, preferring the backend `source_type` field (Step 6
 * of the tool/workflow consolidation) over parsing the workflow name. The name-based
 * inferSourceType is kept ONLY as a fallback for items where the field is absent
 * (older API responses) or the backend itself returned `unknown`/an unrecognized value.
 * This is strictly >= the old name-only behavior: a good backend value wins, otherwise
 * we do exactly what we did before, so nothing that classified before can regress.
 */
export function resolveSourceType(
  rawSourceType: unknown,
  workflowName: string,
  referenceImageCount: number | null = null,
): SourceType {
  const normalizedName = (workflowName ?? '').toLowerCase();
  // High Effort ("higher_tier") runs are classified by their workflow name, which
  // is unambiguous (jewelry_photoshoots_generator_higher_tier -> photo,
  // Product_shot_pipeline_higher_tier -> product_shot, likewise the fixes). Name
  // wins here so these always land in their shot-type section like the normal
  // flows, even if the backend source_type is missing OR mislabeled.
  if (normalizedName.includes('higher_tier')) {
    return inferSourceType(workflowName);
  }
  if (typeof rawSourceType === 'string') {
    const mapped = BACKEND_SOURCE_TYPE_MAP[rawSourceType];
    if (mapped) return mapped;
  }
  // Compatibility fallback for the consolidated CAD workflow while older
  // backend rows still return source_type="unknown". A recognized backend
  // source_type above always remains authoritative.
  if (
    (normalizedName.includes('ring_cad_nurbs') || normalizedName.includes('ring-cad-nurbs')) &&
    referenceImageCount !== null
  ) {
    return referenceImageCount === 0 ? 'text_to_cad' : 'image_to_cad';
  }
  return inferSourceType(workflowName);
}
