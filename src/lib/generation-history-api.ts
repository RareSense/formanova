/**
 * Generation History API
 * Fetches workflow history from the backend using relative /api paths.
 * Uses authenticatedFetch for JWT Bearer auth.
 */

import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { azureUriToUrl } from '@/lib/azure-utils';
import { fetchCadResult } from '@/lib/cad-result-api';
const __DEV__ = import.meta.env.DEV;

// Re-exported so existing imports (WorkflowCard.tsx, useImageToCADWorkflow.ts,
// CadWorkflowModal.tsx, etc.) keep working — the fetch/parse logic itself now
// lives in cad-result-api.ts (split out to stay under AI_RULES.md's file-size
// guideline).
export { fetchCadResult };

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
  /** Text-to-CAD design brief the user typed for this run, if any. Empty/absent for image_to_cad. */
  prompt?: string | null;
  /** Reference images the user uploaded for this run, resolved to same-origin artifact-proxy URLs. Empty for text_to_cad. */
  reference_image_urls?: string[];
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
    // reference_image_artifacts is the real field name the backend sends
    // (denormalise_payload output — confirmed against
    // temporal-agentic-pipeline's tests/unit/test_workflow_helpers.py).
    // reference_images never matched real data; kept as a defensive fallback
    // only in case an older/alternate response shape used that name instead.
    const referenceImageArtifacts: Array<{ uri?: string }> = Array.isArray(w.input?.reference_image_artifacts)
      ? w.input.reference_image_artifacts
      : Array.isArray(w.input?.reference_images)
        ? w.input.reference_images
        : [];
    const referenceImageCount = typeof w.input?.reference_image_count === 'number'
      ? w.input.reference_image_count
      : referenceImageArtifacts.length || null;
    // The consolidated ring workflow serves both text and image inputs, so its
    // actual input count is the only reliable discriminator when the backend
    // still returns source_type="unknown".
    const sourceType = resolveSourceType(w.source_type, name, referenceImageCount);
    const summaryCredits = [w.credits_spent, w.actual_user_billed, w.actual_cost]
      .map(numericCredits)
      .find((value): value is number => value !== null);
    if (sourceType === 'unknown' && __DEV__) {
      console.warn('[HistoryAPI] unknown source_type for workflow:', { id: w.workflow_id ?? w.id, name, status: w.status, backend_source_type: w.source_type });
    }
    const prompt = typeof w.input?.user_description === 'string' && w.input.user_description.trim()
      ? w.input.user_description.trim()
      : null;
    const referenceImageUrls = referenceImageArtifacts
      .map((artifact) => azureUriToUrl(artifact?.uri))
      .filter((url): url is string => Boolean(url));
    return {
      workflow_id: w.workflow_id ?? w.id,
      name,
      status: w.status ?? 'unknown',
      created_at: w.created_at ?? w.started_at ?? '',
      finished_at: w.finished_at ?? null,
      source_type: sourceType,
      // Prefer the backend's already-computed workflow charge. The separate
      // audit request remains the fallback when this summary omits billing.
      credits_spent: summaryCredits,
      mode: w.input?.mode ?? null,
      output_asset_id: extractOutputAssetId(w),
      output_asset_name: extractOutputAssetName(w),
      prompt,
      reference_image_urls: referenceImageUrls,
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
  // Backend now resolves text_to_cad/image_to_cad server-side for the
  // consolidated CAD workflow (temporal-agentic-pipeline PR #52, confirmed
  // deployed) and always wins above when it returns a recognized value.
  // This only fires for backend's own deliberate "unknown" (payload missing,
  // >5 images, or 0 images with no description) — picks a sensible bucket
  // from the count instead of leaving the workflow in an Unknown section.
  if (
    (normalizedName.includes('ring_cad_nurbs') || normalizedName.includes('ring-cad-nurbs')) &&
    referenceImageCount !== null
  ) {
    return referenceImageCount === 0 ? 'text_to_cad' : 'image_to_cad';
  }
  return inferSourceType(workflowName);
}
