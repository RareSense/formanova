import { azureUriToUrl } from '@/lib/azure-utils';

/**
 * ring-cad-nurbs-api.ts
 *
 * Request/response contract for the ring_cad_nurbs_v1 workflow (spec rev 6).
 *
 *   POST /api/run/state/ring_cad_nurbs_v1  -> 202 { workflow_id, ... }
 *   GET  /api/status/{workflow_id}         -> poll until runtime.state is terminal
 *   GET  /api/result/{workflow_id}         -> BLOCKS; fetch once, after status is terminal
 *
 * Auth: the browser sends only its JWT via authenticatedFetch. The tenant
 * X-API-Key and X-On-Behalf-Of headers named in the spec are attached by the
 * backend proxy and must never appear in frontend code (AI_RULES section 1;
 * the spec likewise says the tenant key must not be exposed in a browser).
 *
 * This module is pure request/response shaping. Polling lives in the caller so
 * network concerns stay separate from parsing (AI_RULES section 8).
 */

// -- Tiers and pricing -----------------------------------------------------

/**
 * Tier ids carry provider, model, token ceiling and reasoning budget as one
 * matched set. Never send llm_model alongside llm_tier: an explicit model
 * bypasses tier routing, silently dropping the token cap and reasoning config.
 */
export const RING_CAD_TIERS = {
  FABLE_5: 'claude_fable_5_anthropic',
  OPUS_5: 'claude_opus_5_anthropic',
  GPT_5_6_SOL: 'gpt_5_6_sol_openrouter',
} as const;

export type RingCadTier = (typeof RING_CAD_TIERS)[keyof typeof RING_CAD_TIERS];

/** Credit cost per generation, selected by tier. */
export const RING_CAD_TIER_CREDITS: Record<string, number> = {
  [RING_CAD_TIERS.FABLE_5]: 100,
  [RING_CAD_TIERS.OPUS_5]: 70,
  [RING_CAD_TIERS.GPT_5_6_SOL]: 70,
};

/** Any tier outside the table - or omitting llm_tier entirely - bills at 100. */
export const RING_CAD_UNLISTED_TIER_CREDITS = 100;

/**
 * Fixed tier for Image-to-CAD. No picker is exposed, consistent with
 * CAD_MODEL_SELECTOR_ENABLED being false. Fable 5 has adaptive reasoning
 * always on and bills at 100 credits.
 */
export const RING_CAD_DEFAULT_TIER: RingCadTier = RING_CAD_TIERS.FABLE_5;

/** Credit cost of a generation at the fixed tier above. */
export const RING_CAD_GENERATION_CREDITS = RING_CAD_TIER_CREDITS[RING_CAD_DEFAULT_TIER];

export function resolveRingCadCredits(tier?: string | null): number {
  if (!tier) return RING_CAD_UNLISTED_TIER_CREDITS;
  return RING_CAD_TIER_CREDITS[tier] ?? RING_CAD_UNLISTED_TIER_CREDITS;
}

// -- Workflow identity and limits ------------------------------------------

export const RING_CAD_NURBS_WORKFLOW = 'ring_cad_nurbs_v1';

/** Beyond 5 the backend ignores the extras, so the UI must cap before sending. */
export const MAX_RING_CAD_REFERENCE_IMAGES = 5;

/** Hard ceiling from the spec. Typical run is 10-45 minutes. */
export const RING_CAD_POLL_TIMEOUT_MS = 90 * 60 * 1000;
/** Total nodes in the workflow, used to turn node_visit_seq into a percentage. */
export const RING_CAD_TOTAL_NODES = 46;

// -- Request ---------------------------------------------------------------

/** A stored blob reference, the same shape the run produces internally. */
export interface ArtifactRef {
  /** Raw backend reference; often azure://, which is NOT fetchable as-is. */
  uri: string;
  /**
   * Browser-ready URL: the signed url when the backend supplies one, otherwise
   * uri resolved through azureUriToUrl (the same-origin, auth-gated artifact
   * proxy). Always fetch this, never uri.
   */
  url: string;
  type: string;
  bytes: number;
  sha256: string;
}

/** Images may be sent as data: URLs (server stores them) or as existing refs. */
export type ImageInput = string | ArtifactRef;

export interface RingCadStartParams {
  /** Ordered; index 0 is IMAGE 1 and wins every conflict. 0 to 5 entries. */
  referenceImages: ImageInput[];
  /** Required when there are no images; optional but always used otherwise. */
  userDescription?: string;
  tier?: string | null;
}

export interface RingCadStartBody {
  payload: Record<string, unknown>;
}

/**
 * Builds the start body for the three input modes. reference_image_count must
 * always match the number of images actually supplied - it is what selects the
 * mode server-side.
 *
 *   0 images  -> user_description drives everything (mandatory here)
 *   1 image   -> image_artifact AND reference_image_artifacts, same picture in both
 *   2-5       -> reference_image_artifacts only, no image_artifact, no variants
 *
 * Note there is no return_nodes field: this workflow does not take one.
 */
export function buildRingCadStartBody({
  referenceImages,
  userDescription,
  tier = RING_CAD_DEFAULT_TIER,
}: RingCadStartParams): RingCadStartBody {
  const images = [...referenceImages];
  const description = (userDescription ?? '').trim();

  if (images.length > MAX_RING_CAD_REFERENCE_IMAGES) {
    throw new Error(`At most ${MAX_RING_CAD_REFERENCE_IMAGES} reference images are allowed`);
  }
  if (images.length === 0 && !description) {
    throw new Error('Describe your ring or upload a reference image');
  }

  const payload: Record<string, unknown> = {
    reference_image_count: images.length,
  };

  // Text is optional whenever an image is supplied, mandatory when none is.
  if (description) payload.user_description = description;

  if (images.length === 1) {
    // Single-image mode needs the picture in BOTH slots: image_artifact is the
    // IMAGE 1 the variant generator works from, reference_image_artifacts is the
    // ordered list the prompts read.
    payload.image_artifact = images[0];
    payload.reference_image_artifacts = [images[0]];
  } else if (images.length > 1) {
    // Multi-image mode generates no variants, so image_artifact is not sent.
    payload.reference_image_artifacts = images;
  }

  if (tier) payload.llm_tier = tier;

  return { payload };
}

// -- Result ----------------------------------------------------------------

/**
 * All three validation_status values are successes carrying a usable ring; they
 * differ only in whether the critic's corrections were applied. All three charge.
 */
export type RingCadValidationStatus = 'applied' | 'not_applied' | 'errored';

export interface RingCadDiagnostics {
  part_count?: number;
  glb_size?: number;
  returncode?: number;
  /** Exports and renders correctly, but some part is not a closed solid. */
  not_all_solid?: boolean;
}

export interface RingCadResult {
  /** The deliverable: NURBS .3dm, opens in Rhino, millimetres. */
  threedmArtifact: ArtifactRef | null;
  /** Preview mesh for web viewers. */
  glbArtifact: ArtifactRef | null;
  glbUrl: string | null;
  validationStatus: RingCadValidationStatus | null;
  diagnostics: RingCadDiagnostics;
  notAllSolid: boolean;
  /**
   * True when the corrected model was unavailable and an earlier stage's output
   * was used instead. Worth telling the user their ring is the pre-review build.
   */
  usedFallbackStage: boolean;
  /** Which result field the returned model actually came from. */
  sourceStage: string | null;
}

export type RingCadFailurePhase =
  | 'fail_phase2'
  | 'fail_phase3'
  | 'fail_modules'
  | 'fail_cad'
  | 'fail_validation_capture';

export interface RingCadFailure {
  phase: RingCadFailurePhase | null;
  errorCategory: string | null;
  failureOrigin: string | null;
  /** Backend-authored copy, safe to show the user directly. */
  userMessage: string | null;
  /** cad_export failures are worth a retry: geometry is generative and the run was free. */
  retryable: boolean;
}

function readArtifact(value: unknown): ArtifactRef | null {
  if (!value || typeof value !== 'object') return null;
  const a = value as Partial<ArtifactRef>;
  const signedUrl = typeof a.url === 'string' && a.url ? a.url : '';
  const rawUri = typeof a.uri === 'string' && a.uri ? a.uri : '';
  if (!signedUrl && !rawUri) return null;
  // Prefer the backend's url field, falling back to uri, but always route the
  // candidate through azureUriToUrl: a content-addressed artifact - azure://
  // or a raw http(s) host with a sha256 in its path, including the backend's
  // own cross-origin /api/artifacts/<sha> host - collapses to this app's
  // same-origin, auth-gated artifact proxy (AI_RULES 4). A genuine one-off
  // signed URL has no matching sha in its path, so it passes through as-is.
  const candidate = signedUrl || rawUri;
  const url = azureUriToUrl(candidate) || candidate;
  return {
    uri: rawUri || signedUrl,
    url,
    type: typeof a.type === 'string' ? a.type : '',
    bytes: typeof a.bytes === 'number' ? a.bytes : 0,
    sha256: typeof a.sha256 === 'string' ? a.sha256 : '',
  };
}

/**
 * Bounded depth-first search for the first value at a key matching `predicate`,
 * anywhere inside nested objects/arrays. A request that omits `return_nodes`
 * can make the backend fall back to a sink-node-keyed response instead of this
 * workflow's documented flat shape - e.g. `{ validation_run_cad: [{ glb_artifact:
 * {...} }] }` instead of `{ glb_artifact: {...} }` at the top level. Depth is
 * capped so one unmatched field never triggers an unbounded tree walk.
 */
const MAX_DEEP_SEARCH_DEPTH = 6;

function findKeyDeep(
  node: unknown,
  predicate: (key: string) => boolean,
  depth = 0,
): unknown {
  if (depth > MAX_DEEP_SEARCH_DEPTH || !node || typeof node !== 'object') return undefined;
  const values = Array.isArray(node) ? node : Object.values(node as Record<string, unknown>);
  if (!Array.isArray(node)) {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (predicate(key)) return value;
    }
  }
  for (const value of values) {
    const found = findKeyDeep(value, predicate, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** True for the three terminal states that produced a usable ring. */
export function isRingCadSuccess(data: unknown): boolean {
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.ok === false) return false;
  if (typeof d.status === 'string' && d.status.toLowerCase() === 'failed') return false;
  return d.ok === true || d.status === 'completed';
}

/**
 * Newest-first ladder of result fields to read a model from. The corrected
 * build is preferred; when a later stage failed to produce one, fall back to the
 * most recent earlier stage that did. Losing the corrections is much better than
 * showing the user nothing for a run that charged them.
 */
const THREEDM_STAGES = ['threedm_artifact', 'prevalidation_threedm_artifact'] as const;
const GLB_STAGES = ['glb_artifact', 'prevalidation_glb_artifact'] as const;

/** Walks a ladder and reports which field the artifact actually came from. */
function readStagedArtifact(
  d: Record<string, unknown>,
  stages: readonly string[],
): { artifact: ArtifactRef | null; stage: string | null; fellBack: boolean } {
  for (let i = 0; i < stages.length; i++) {
    const artifact = readArtifact(d[stages[i]]);
    if (artifact) return { artifact, stage: stages[i], fellBack: i > 0 };
  }
  // Any *_artifact key that names this model type, so an unexpected stage
  // name still yields a model rather than an empty screen.
  const suffix = stages[0].includes('threedm') ? 'threedm' : 'glb';
  const matchesArtifactKey = (key: string) => key.endsWith('_artifact') && key.includes(suffix);
  for (const [key, value] of Object.entries(d)) {
    if (!matchesArtifactKey(key)) continue;
    const artifact = readArtifact(value);
    if (artifact) return { artifact, stage: key, fellBack: true };
  }
  // Last resort: the response may be sink-node-keyed rather than flat (see
  // findKeyDeep). Search the whole tree before concluding there is no model.
  const deepArtifact = readArtifact(findKeyDeep(d, matchesArtifactKey));
  if (deepArtifact) return { artifact: deepArtifact, stage: 'deep-scan', fellBack: true };
  return { artifact: null, stage: null, fellBack: false };
}

/**
 * The documented shape is flat, unlike the nested node_results shape of older
 * CAD workflows - but omitting return_nodes on the start request can make the
 * backend fall back to a sink-node-keyed response instead (see findKeyDeep),
 * so every field here is read flat-first and deep-search-second.
 */
// Confirmed sink-node keys (backend v2 state-runtime, traced against
// state_runtime_workflow.py by another dev's agent): a missing return_nodes
// on the start request wraps the real flat-shape object in a single-element
// array under one of these three keys, one per outcome branch. The key
// itself IS the validation_status signal - there is no separate field for it
// inside the wrapped object.
const SINK_NODE_VALIDATION_STATUS: Record<string, RingCadValidationStatus> = {
  final_validated: 'applied',
  final_prevalidation: 'not_applied',
  final_validation_errored: 'errored',
};

/** Unwraps a confirmed sink-node envelope, if present, reporting its implied outcome. */
function unwrapSinkNode(
  root: Record<string, unknown>,
): { node: Record<string, unknown>; validationStatus: RingCadValidationStatus | null } {
  for (const [key, status] of Object.entries(SINK_NODE_VALIDATION_STATUS)) {
    const sink = root[key];
    if (Array.isArray(sink) && sink[0] && typeof sink[0] === 'object') {
      return { node: sink[0] as Record<string, unknown>, validationStatus: status };
    }
  }
  return { node: root, validationStatus: null };
}

export function parseRingCadResult(data: unknown): RingCadResult {
  const root = (data ?? {}) as Record<string, unknown>;
  const { node: d, validationStatus: sinkValidationStatus } = unwrapSinkNode(root);

  const threedm = readStagedArtifact(d, THREEDM_STAGES);
  const glb = readStagedArtifact(d, GLB_STAGES);
  const threedmArtifact = threedm.artifact;
  const glbArtifact = glb.artifact;

  // cad_diagnostics is the documented flat-shape field; an unrecognised
  // sink-node shape nests the per-node tool output under a different key
  // entirely (observed as plain "diagnostics" on the cad_runner node), so
  // fall back to a deep search of the whole original response for either
  // name when it's missing on the (possibly already-unwrapped) node.
  let diagnosticsRaw: unknown = d.cad_diagnostics;
  if (!diagnosticsRaw || typeof diagnosticsRaw !== 'object') {
    diagnosticsRaw = findKeyDeep(root, (key) => key === 'cad_diagnostics' || key === 'diagnostics');
  }
  const diagnostics = (diagnosticsRaw && typeof diagnosticsRaw === 'object'
    ? diagnosticsRaw
    : {}) as RingCadDiagnostics;

  // The sink key's implied status wins when present (it's the authoritative
  // signal for that shape); otherwise read an explicit field, falling back
  // to a deep search for it anywhere in the original response.
  let rawStatus: string | null = sinkValidationStatus ?? (typeof d.validation_status === 'string' ? d.validation_status : null);
  if (!rawStatus) {
    const deepStatus = findKeyDeep(root, (key) => key === 'validation_status');
    rawStatus = typeof deepStatus === 'string' ? deepStatus : null;
  }
  const validationStatus =
    rawStatus === 'applied' || rawStatus === 'not_applied' || rawStatus === 'errored'
      ? rawStatus
      : null;

  if (!threedmArtifact && !glbArtifact) {
    throw new Error('No CAD model found in the run result');
  }

  return {
    threedmArtifact,
    glbArtifact,
    glbUrl: glbArtifact?.url ?? null,
    validationStatus,
    diagnostics,
    notAllSolid: diagnostics.not_all_solid === true,
    usedFallbackStage: threedm.fellBack || glb.fellBack,
    sourceStage: threedm.stage ?? glb.stage,
  };
}

export function parseRingCadFailure(data: unknown): RingCadFailure {
  const d = (data ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const phase = str(d.phase) as RingCadFailurePhase | null;
  return {
    phase,
    errorCategory: str(d.error_category),
    failureOrigin: str(d.failure_origin),
    userMessage: str(d.user_message),
    // fail_cad is the commonest failure and the failed run is free, so it's
    // worth a retry (spec section 8).
    retryable: phase === 'fail_cad',
  };
}

/**
 * Progress fraction (0..1) from node_visit_seq. Repeat visits are not extra
 * progress, so distinct nodes entered is the measure.
 */
export function ringCadProgressFraction(statusData: unknown): number {
  const d = (statusData ?? {}) as { node_visit_seq?: Record<string, number> };
  const entered = Object.keys(d.node_visit_seq ?? {}).length;
  if (entered <= 0) return 0;
  return Math.min(entered / RING_CAD_TOTAL_NODES, 1);
}

/** A second visit to run_cad means a repair is underway - worth saying so. */
export function isRingCadRepairing(statusData: unknown): boolean {
  const d = (statusData ?? {}) as { node_visit_seq?: Record<string, number> };
  return (d.node_visit_seq?.run_cad ?? 0) > 1;
}
