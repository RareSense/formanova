/**
 * Generation History API
 * Fetches workflow history from the backend using relative /api paths.
 * Uses authenticatedFetch for JWT Bearer auth.
 */

import { authenticatedFetch } from '@/lib/authenticated-fetch';
const __DEV__ = import.meta.env.DEV;

// ─── Types ──────────────────────────────────────────────────────────

export type SourceType = 'photo' | 'product_shot' | 'cad_render' | 'cad_text' | 'cad_sketch' | 'unknown';

export interface WorkflowSummary {
  workflow_id: string;
  name: string;
  status: string;
  created_at: string;
  finished_at: string | null;
  source_type: SourceType;
  /** Optional thumbnail extracted from workflow details (populated client-side) */
  thumbnail_url?: string;
  /** All angle screenshots for cad_text workflows (populated client-side) */
  screenshots?: { angle: string; url: string }[];
  /** GLB download URL (populated client-side from workflow details) */
  glb_url?: string | null;
  /** GLB file name extracted from the azure URI */
  glb_filename?: string | null;
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
    // Prefer the backend source_type; fall back to name parsing only when absent/unknown.
    const sourceType = resolveSourceType(w.source_type, name);
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
      cad_text: mapped.filter(w => w.source_type === 'cad_text').length,
      cad_render: mapped.filter(w => w.source_type === 'cad_render').length,
      cad_sketch: mapped.filter(w => w.source_type === 'cad_sketch').length,
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
 * Applies the deterministic sink-based fallback rule:
 *   success_final → glb_artifact (final output, preferred) → original_glb_artifact (intermediate)
 *   success_original_glb → original_glb_artifact
 *   failed_final → null (no fallback)
 */
export async function fetchCadResult(
  workflowId: string,
): Promise<{ glb_url: string | null; azure_source: string | null }> {
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

  try {
    const res = await authenticatedFetch(
      `/api/result/${workflowId}`,
    );
    if (!res.ok) return { glb_url: null, azure_source: null };

    const data = await res.json();

    // 1. success_final: prefer glb_artifact (final output), fallback original_glb_artifact
    const finalUri = extractArtifactUri(data, 'success_final', 'glb_artifact')
      || extractArtifactUri(data, 'success_final', 'original_glb_artifact');
    if (finalUri) {
      return { glb_url: finalUri, azure_source: 'success_final' };
    }

    // 2. success_original_glb: use original_glb_artifact only
    const originalUri = extractArtifactUri(data, 'success_original_glb', 'original_glb_artifact');
    if (originalUri) {
      return { glb_url: originalUri, azure_source: 'success_original_glb' };
    }

    // 3. failed_final: only build_initial is allowed as fallback
    const failedArr = data['failed_final'];
    if (Array.isArray(failedArr) && failedArr.length > 0) {
      const failedInitialUri = extractArtifactUri(data, 'build_initial', 'glb_artifact')
        || extractArtifactUri(data, 'build_initial', 'original_glb_artifact');
      if (failedInitialUri) {
        return { glb_url: failedInitialUri, azure_source: 'build_initial' };
      }
      return { glb_url: null, azure_source: 'failed_final' };
    }

    // 4. ring_edit_v1 currently returns build nodes rather than success sinks.
    const buildUri = extractArtifactUri(data, 'build_retry', 'glb_artifact')
      || extractArtifactUri(data, 'build_retry', 'original_glb_artifact')
      || extractArtifactUri(data, 'build_initial', 'glb_artifact')
      || extractArtifactUri(data, 'build_initial', 'original_glb_artifact');
    if (buildUri) {
      return { glb_url: buildUri, azure_source: 'build_retry' };
    }

    return { glb_url: null, azure_source: null };
  } catch (e) {
    if (__DEV__) console.warn('[HistoryAPI] fetchCadResult error:', workflowId, e);
    return { glb_url: null, azure_source: null };
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

    // 1. Top-level actual_user_billed (final amount deducted from wallet)
    if (typeof data.actual_user_billed === 'number') return data.actual_user_billed;

    // 2. Nested under financials
    if (typeof data.financials?.actual_user_billed === 'number') return data.financials.actual_user_billed;

    // 3. Fallback to other common field names
    const total = data.total_charged ?? data.total_cost ?? data.total ?? data.credits_spent ?? null;
    if (typeof total === 'number') return total;

    // 4. Sum line_items costs
    if (Array.isArray(data.line_items)) {
      const sum = data.line_items.reduce((acc: number, item: any) => acc + (item.cost ?? item.amount ?? item.credits ?? 0), 0);
      if (sum > 0) return sum;
    }

    if (__DEV__) console.warn('[HistoryAPI] credit audit: could not extract cost from response', workflowId, Object.keys(data));
    return null;
  } catch (e) {
    if (__DEV__) console.warn('[HistoryAPI] credit audit error:', workflowId, e);
    return null;
  }
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
    return 'cad_text';

  // Sketch-to-CAD workflows
  if (lower.includes('sketch')) return 'cad_sketch';

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
 * cares about the family bucket (photo / product_shot / cad_*), so fixes and upscales
 * collapse into their generate family. Unrecognized/future values are intentionally
 * absent here so they fall through to unknown (or the name-parse fallback).
 */
const BACKEND_SOURCE_TYPE_MAP: Record<string, SourceType> = {
  model_shot: 'photo',
  model_fix: 'photo',
  upscale: 'photo',
  product_shot: 'product_shot',
  product_fix: 'product_shot',
  cad_text: 'cad_text',
  cad_sketch: 'cad_sketch',
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
export function resolveSourceType(rawSourceType: unknown, workflowName: string): SourceType {
  // High Effort ("higher_tier") runs are classified by their workflow name, which
  // is unambiguous (jewelry_photoshoots_generator_higher_tier -> photo,
  // Product_shot_pipeline_higher_tier -> product_shot, likewise the fixes). Name
  // wins here so these always land in their shot-type section like the normal
  // flows, even if the backend source_type is missing OR mislabeled.
  if ((workflowName ?? '').toLowerCase().includes('higher_tier')) {
    return inferSourceType(workflowName);
  }
  if (typeof rawSourceType === 'string') {
    const mapped = BACKEND_SOURCE_TYPE_MAP[rawSourceType];
    if (mapped) return mapped;
  }
  return inferSourceType(workflowName);
}
