/**
 * Photoshoot Generation API
 * POST /run/state/jewelry_photoshoots_generator
 *
 * All protected calls go through authenticatedFetch so 401 responses
 * trigger centralized session cleanup and redirect to /login.
 */

import { authenticatedFetch } from '@/lib/authenticated-fetch';

const API_BASE = '/api';

export type EffortTier = 'low' | 'high';

/**
 * Canonical data-driven workflow names — one per family (Step 5 of the tool/workflow
 * consolidation). Resolution is no longer encoded in the low-effort name; it travels
 * as data: `image_size` in the payload for generate/PDP, and `source_asset_id`
 * (fallback `image_size`) for fix. High-effort names are resolved by workflowFor below.
 *
 * Single source of truth for CLAUDE.md invariant #4: useStudioGeneration and
 * UnifiedStudio import from here instead of keeping their own literal tables.
 */
export const WORKFLOW_NAMES = {
  modelShot: 'jewelry_photoshoots_generator',
  productShot: 'Product_shot_pipeline',
  modelFix: 'fix_model_shot',
  productFix: 'fix_product_shot',
} as const;

/** Base generate workflow name for a shot type (no resolution suffix). */
export function generateWorkflowFor(isProductShot: boolean): string {
  return isProductShot ? WORKFLOW_NAMES.productShot : WORKFLOW_NAMES.modelShot;
}

/** Base fix workflow name for a shot type (no resolution suffix). */
export function fixWorkflowFor(isProductShot: boolean): string {
  return isProductShot ? WORKFLOW_NAMES.productFix : WORKFLOW_NAMES.modelFix;
}

// High-effort ("higher tier") generate workflow names. Effort is chosen purely by
// which workflow_name we POST — the payload shape is identical to low effort
// (resolution still travels as `image_size`). On-model splits 1K/2K vs 4K because the
// polish step caps at 2K, so 4K needs an extra upscale node; PDP's generate service
// natively covers all three tiers, so PDP is a single name. Up to 3 jewelry images are
// accepted on the high path. See Pricing Restructure handoff (2026-07-06).
const MODEL_SHOT_GENERATE_HIGH = 'jewelry_photoshoots_generator_higher_tier';
const MODEL_SHOT_GENERATE_HIGH_4K = 'jewelry_photoshoots_generator_higher_tier_4k';
const PRODUCT_SHOT_GENERATE_HIGH = 'Product_shot_pipeline_higher_tier';

/**
 * Canonical generate workflow-name resolver. Single source of truth referenced by
 * CLAUDE.md invariant #4 — useStudioGeneration and UnifiedStudio call THIS rather than
 * keeping their own literal tables, so (shot type x resolution x effort) never drift.
 * Low effort → unsuffixed WORKFLOW_NAMES (resolution travels as image_size); high
 * effort → the higher-tier names above.
 */
export function workflowFor(
  isProductShot: boolean,
  resolution: string,
  effort: EffortTier = 'low',
): string {
  const res = resolution || '1K';
  if (effort === 'high') {
    if (isProductShot) return PRODUCT_SHOT_GENERATE_HIGH;
    return res === '4K' ? MODEL_SHOT_GENERATE_HIGH_4K : MODEL_SHOT_GENERATE_HIGH;
  }
  return isProductShot ? WORKFLOW_NAMES.productShot : WORKFLOW_NAMES.modelShot;
}

// ─── Types ──────────────────────────────────────────────────────────

export interface PhotoshootStartRequest {
  jewelry_image_url: string;
  model_image_url: string;
  category: string;
  idempotency_key?: string;
  aspect_ratio?: string;
  resolution?: string;
  /** 'high' routes to the higher-tier workflow (up to 3 jewelry images). Defaults to 'low'. */
  tier?: EffortTier;
  /** High Effort: 1-3 jewelry image URLs, cover first. Falls back to jewelry_image_url when absent. */
  jewelry_image_urls?: string[];
  input_jewelry_asset_id?: string;
  /** High Effort: 1-3 jewelry asset ids, cover first. Replaces input_jewelry_asset_id when present. */
  input_jewelry_asset_ids?: string[];
  input_model_asset_id?: string;
  /** UUID of the selected FormaNova preset model — audit field only, never affects generation */
  input_preset_model_id?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Build the jewelry image + asset-id payload fields shared by model and PDP starts.
 * Sends plural arrays (cover first) when multiple images are present, always keeping
 * the singular cover field for backward compatibility. Asset ids are UUID-validated.
 */
function buildJewelryFields(opts: {
  coverUrl: string;
  urls?: string[];
  coverAssetId?: string;
  assetIds?: string[];
}): { payloadFields: Record<string, unknown>; envelopeFields: Record<string, unknown> } {
  const urls = (opts.urls && opts.urls.length ? opts.urls : [opts.coverUrl]).filter(Boolean);
  const payloadFields: Record<string, unknown> = { jewelry_image_url: urls[0] };
  if (urls.length > 1) payloadFields.jewelry_image_urls = urls;

  const rawIds = (opts.assetIds && opts.assetIds.length
    ? opts.assetIds
    : (opts.coverAssetId ? [opts.coverAssetId] : []));
  const validIds = rawIds.filter((id): id is string => !!id && UUID_RE.test(id));
  const envelopeFields: Record<string, unknown> = {};
  if (validIds.length > 1) envelopeFields.input_jewelry_asset_ids = validIds;
  else if (validIds.length === 1) envelopeFields.input_jewelry_asset_id = validIds[0];

  return { payloadFields, envelopeFields };
}

export interface JewelryRequestFields {
  tier?: EffortTier;
  jewelry_image_urls?: string[];
  input_jewelry_asset_ids?: string[];
  input_jewelry_asset_id?: string;
}

/**
 * Build the effort-dependent jewelry request fields the studio spreads into
 * startPhotoshoot / startPdpShot. High Effort sends cover-first arrays (up to 3,
 * empties dropped); Standard keeps the singular asset-id path. Pure — unit tested.
 */
export function buildJewelryRequestFields(opts: {
  effort: EffortTier;
  coverUrl: string;
  coverAssetId: string | null;
  supporting: Array<{ url: string | null; assetId: string | null }>;
}): JewelryRequestFields {
  if (opts.effort !== 'high') {
    return opts.coverAssetId ? { input_jewelry_asset_id: opts.coverAssetId } : {};
  }
  const urls = [opts.coverUrl, ...opts.supporting.map(s => s.url)].filter((u): u is string => !!u);
  const ids = [opts.coverAssetId, ...opts.supporting.map(s => s.assetId)].filter((id): id is string => !!id);
  return { tier: 'high', jewelry_image_urls: urls, input_jewelry_asset_ids: ids };
}

export interface PhotoshootStartResponse {
  workflow_id: string;
  status_url: string;
  result_url: string;
  projected_cost?: number;
  authorized_budget?: number;
}

export interface PhotoshootStatusResponse {
  runtime?: {
    state: 'running' | 'completed' | 'failed';
  };
  progress?: {
    state: 'running' | 'completed' | 'failed';
    total_nodes?: number;
    completed_nodes?: number;
    visited?: string[];
  };
  state?: 'running' | 'completed' | 'failed';
  error?: string;
}

export interface PhotoshootResultResponse {
  /**
   * Vault asset id produced by this run, present top-level on every /result
   * response (generic across model-shot/PDP/fix/upscale — a plain DB lookup keyed
   * on workflow id, not aware of which tool ran). It sits OUTSIDE the node-keyed
   * arrays, so the index signature below is widened from `unknown[]` to `unknown`:
   * result-image / description extraction already guards each node value with
   * Array.isArray, and this scalar is read directly as a sibling field.
   */
  output_asset_id?: string | null;
  [key: string]: unknown;
}

// ─── Start Photoshoot ───────────────────────────────────────────────

export async function startPhotoshoot(
  request: PhotoshootStartRequest,
): Promise<PhotoshootStartResponse> {
  if (!request.jewelry_image_url || typeof request.jewelry_image_url !== 'string') {
    throw new Error('A valid jewelry image URL must be provided.');
  }
  if (!request.model_image_url || typeof request.model_image_url !== 'string') {
    throw new Error('A valid model image URL must be provided.');
  }

  const {
    jewelry_image_url, jewelry_image_urls, input_jewelry_asset_id, input_jewelry_asset_ids,
    input_model_asset_id, input_preset_model_id, resolution, tier, ...rest
  } = request;

  const workflowName = workflowFor(false, resolution ?? '1K', tier ?? 'low');
  const { payloadFields, envelopeFields } = buildJewelryFields({
    coverUrl: jewelry_image_url,
    urls: jewelry_image_urls,
    coverAssetId: input_jewelry_asset_id,
    assetIds: input_jewelry_asset_ids,
  });
  const payload = { ...rest, ...payloadFields, image_size: resolution ?? '1K' };

  const modelId = input_model_asset_id && UUID_RE.test(input_model_asset_id) ? input_model_asset_id : undefined;
  const presetModelId = input_preset_model_id && UUID_RE.test(input_preset_model_id) ? input_preset_model_id : undefined;

  const res = await authenticatedFetch(`${API_BASE}/run/state/${workflowName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payload,
      ...envelopeFields,
      ...(modelId ? { input_model_asset_id: modelId } : {}),
      ...(presetModelId ? { input_preset_model_id: presetModelId } : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to start photoshoot: ${res.status} — ${text.substring(0, 200)}`);
  }

  return res.json();
}

// ─── Poll Status ────────────────────────────────────────────────────

export async function getPhotoshootStatus(
  workflowId: string,
): Promise<PhotoshootStatusResponse> {
  const res = await authenticatedFetch(`${API_BASE}/status/${workflowId}`);

  if (res.status === 404) {
    return { state: 'running' };
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Status check failed: ${res.status} — ${text.substring(0, 200)}`);
  }

  return res.json();
}

// ─── Get Result (with retry for result-write lag) ───────────────────

export async function getPhotoshootResult(
  workflowId: string,
  maxRetries: number = 5,
  retryDelayMs: number = 1000,
): Promise<PhotoshootResultResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, retryDelayMs));
    }

    const res = await authenticatedFetch(`${API_BASE}/result/${workflowId}`);

    // 404 = result not written yet — retry
    if (res.status === 404) {
      lastError = new Error('Result not ready yet (404)');
      console.log(`[photoshoot-api] Result 404, retry ${attempt + 1}/${maxRetries}`);
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Result fetch failed: ${res.status} — ${text.substring(0, 200)}`);
    }

    return res.json();
  }

  throw lastError || new Error('Result fetch exhausted retries');
}

// ─── Start PDP Shot ─────────────────────────────────────────────────

export interface PdpStartRequest {
  jewelry_image_url: string;   // internal — mapped to jewelry_image_urls array on send (cover)
  /** High Effort: 1-3 jewelry image URLs, cover first. Falls back to [jewelry_image_url]. */
  jewelry_image_urls?: string[];
  inspiration_image_url: string;
  category: string;
  idempotency_key?: string;
  aspect_ratio?: string;
  resolution?: string;
  /** 'high' routes to the higher-tier PDP workflow. Defaults to 'low'. */
  tier?: EffortTier;
  input_jewelry_asset_id?: string;
  /** High Effort: 1-3 jewelry asset ids, cover first. Replaces input_jewelry_asset_id when present. */
  input_jewelry_asset_ids?: string[];
  /** Set if user uploaded their own inspiration — never send both */
  input_inspiration_asset_id?: string;
  /** Set if user picked a preset inspiration — never send both */
  input_preset_inspiration_id?: string;
}

export async function startPdpShot(
  request: PdpStartRequest,
): Promise<PhotoshootStartResponse> {
  if (!request.jewelry_image_url) throw new Error('A valid jewelry image URL must be provided.');
  if (!request.inspiration_image_url) throw new Error('A valid inspiration image URL must be provided.');

  const {
    jewelry_image_url,
    jewelry_image_urls,
    input_jewelry_asset_id,
    input_jewelry_asset_ids,
    input_inspiration_asset_id,
    input_preset_inspiration_id,
    resolution,
    tier,
    ...rest
  } = request;

  const workflowName = workflowFor(true, resolution ?? '1K', tier ?? 'low');

  // Backend expects jewelry_image_urls as an array (cover first), 1-3 entries.
  const jewelryUrls = (jewelry_image_urls && jewelry_image_urls.length ? jewelry_image_urls : [jewelry_image_url]).filter(Boolean);
  const payload = { ...rest, jewelry_image_urls: jewelryUrls, image_size: resolution ?? '1K' };

  const rawJewelryIds = (input_jewelry_asset_ids && input_jewelry_asset_ids.length
    ? input_jewelry_asset_ids
    : (input_jewelry_asset_id ? [input_jewelry_asset_id] : []));
  const validJewelryIds = rawJewelryIds.filter((id): id is string => !!id && UUID_RE.test(id));
  const jewelryIdField = validJewelryIds.length > 1
    ? { input_jewelry_asset_ids: validJewelryIds }
    : validJewelryIds.length === 1
    ? { input_jewelry_asset_id: validJewelryIds[0] }
    : {};

  const inspirationAssetId = input_inspiration_asset_id && UUID_RE.test(input_inspiration_asset_id) ? input_inspiration_asset_id : undefined;
  const presetInspirationId = input_preset_inspiration_id && UUID_RE.test(input_preset_inspiration_id) ? input_preset_inspiration_id : undefined;

  // Exactly one of the two inspiration ID fields must be sent — never both
  const inspirationIdField = inspirationAssetId
    ? { input_inspiration_asset_id: inspirationAssetId }
    : presetInspirationId
    ? { input_preset_inspiration_id: presetInspirationId }
    : {};

  const res = await authenticatedFetch(`${API_BASE}/run/${workflowName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payload,
      ...jewelryIdField,
      ...inspirationIdField,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to start PDP shot: ${res.status} — ${text.substring(0, 200)}`);
  }

  return res.json();
}

// ─── Fix Shot ───────────────────────────────────────────────────────

export interface FixShotRequest {
  isProductShot: boolean;
  resolution: string;
  resultImageUrl: string;
  jewelryImageUrl: string;
  prompt?: string;
  category: string;
  aspect_ratio?: string;
  idempotency_key?: string;
  jewelry_description?: string;
  /**
   * Vault asset id of the exact image being fixed (its output_asset_id, or the
   * upscaled asset's id when fixing an already-upscaled image). The backend
   * resolves image_size/tier from this, so it drives fix price + routing. Sent as
   * a TOP-LEVEL sibling of `payload`, never nested inside it. When absent we fall
   * back to `image_size` in the payload (see below).
   */
  sourceAssetId?: string | null;
}

export async function startFixShot(request: FixShotRequest): Promise<PhotoshootStartResponse> {
  // Base fix workflow, no resolution suffix — tier is resolved server-side from
  // source_asset_id (fallback image_size in the payload). Step 5 cutover.
  const workflowName = fixWorkflowFor(request.isProductShot);

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const sourceAssetId = request.sourceAssetId && UUID_RE.test(request.sourceAssetId)
    ? request.sourceAssetId
    : undefined;

  // Strip data: prefix → send as b64; otherwise send as URL
  const resultImageField = request.resultImageUrl.startsWith('data:')
    ? { result_image_b64: request.resultImageUrl.replace(/^data:[^;]+;base64,/, '') }
    : { result_image_url: request.resultImageUrl };

  const jewelryImageField = request.jewelryImageUrl.startsWith('data:')
    ? { jewelry_image_b64: request.jewelryImageUrl.replace(/^data:[^;]+;base64,/, '') }
    : { jewelry_image_url: request.jewelryImageUrl };

  // Model shot: standard { payload } envelope -> /run/state/
  // Product shot: GraphFlowRunEnvelope -> /run/
  // Keep product fields flat in payload so prepare_fix_request receives them directly.
  const endpoint = request.isProductShot
    ? `${API_BASE}/run/${workflowName}`
    : `${API_BASE}/run/state/${workflowName}`;

  let body: string;

  if (request.isProductShot) {
    // Same shape as startPdpShot. The API layer handles the GraphFlow envelope.
    const productPayload: Record<string, unknown> = {
      ...resultImageField,
      ...jewelryImageField,
      category: request.category,
      generation_type: 'product_shot_v1',
      ...(request.prompt ? { fix_instruction: request.prompt } : {}),
      ...(request.aspect_ratio ? { aspect_ratio: request.aspect_ratio } : {}),
      ...(request.idempotency_key ? { idempotency_key: request.idempotency_key } : {}),
      ...(request.jewelry_description ? { jewelry_description: request.jewelry_description } : {}),
    };
    // Fallback only: when we can't resolve the asset, let the backend tier from
    // image_size. Not sent on the normal path — source_asset_id drives it there.
    if (!sourceAssetId) productPayload.image_size = request.resolution;
    body = JSON.stringify({
      payload: productPayload,
      ...(sourceAssetId ? { source_asset_id: sourceAssetId } : {}),
    });
  } else {
    const payload: Record<string, unknown> = {
      ...resultImageField,
      ...jewelryImageField,
      category: request.category,
      ...(request.prompt ? { fix_instruction: request.prompt } : {}),
      ...(request.aspect_ratio ? { aspect_ratio: request.aspect_ratio } : {}),
      ...(request.idempotency_key ? { idempotency_key: request.idempotency_key } : {}),
    };
    if (!request.jewelryImageUrl.startsWith('data:')) {
      payload.jewelry_image_urls = [request.jewelryImageUrl];
    }
    // Fallback only (see product branch): tier from image_size when no asset id.
    if (!sourceAssetId) payload.image_size = request.resolution;
    body = JSON.stringify({
      payload,
      ...(sourceAssetId ? { source_asset_id: sourceAssetId } : {}),
    });
  }

  const res = await authenticatedFetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to start fix: ${res.status} — ${text.substring(0, 200)}`);
  }

  return res.json();
}

/**
 * Fetch the jewelry description that was generated by the describe node
 * during a completed Product_shot_pipeline run.
 * Returns null on 404 (workflow not completed or not owned by the user).
 */
export async function getJewelryDescription(workflowId: string): Promise<string | null> {
  const res = await authenticatedFetch(`${API_BASE}/jewelry-description/${workflowId}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch jewelry description: ${res.status} — ${text.substring(0, 200)}`);
  }
  const data = await res.json();
  return data.jewelry_description ?? null;
}

/**
 * Helper to resolve the runtime state from a status response.
 * Checks runtime.state first, then progress.state, then top-level state.
 */
export function resolveWorkflowState(
  status: PhotoshootStatusResponse,
): 'running' | 'completed' | 'failed' | 'unknown' {
  return status.runtime?.state || status.progress?.state || status.state || 'unknown';
}
