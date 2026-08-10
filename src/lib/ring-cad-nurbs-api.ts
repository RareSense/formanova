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
  FABLE_5: 'claude_fable_5_openrouter',
  OPUS_5: 'claude_opus_5_openrouter',
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
}

export type RingCadFailurePhase =
  | 'module_prompts'
  | 'module_generation'
  | 'module_assembly'
  | 'cad_export'
  | 'validation_prompt';

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
  // The backend hands back a signed url for artifacts; prefer it. Otherwise the
  // uri is azure://, which must go through azureUriToUrl to reach the
  // same-origin artifact proxy - it is not fetchable directly (AI_RULES 4).
  // url may end up '' if the reference is neither signed nor resolvable; the
  // artifact is still reported, since the run did produce it. Callers must
  // check .url before fetching rather than assuming it is usable.
  const url = signedUrl || azureUriToUrl(rawUri);
  return {
    uri: rawUri || signedUrl,
    url,
    type: typeof a.type === 'string' ? a.type : '',
    bytes: typeof a.bytes === 'number' ? a.bytes : 0,
    sha256: typeof a.sha256 === 'string' ? a.sha256 : '',
  };
}

/** True for the three terminal states that produced a usable ring. */
export function isRingCadSuccess(data: unknown): boolean {
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.ok === false) return false;
  if (typeof d.status === 'string' && d.status.toLowerCase() === 'failed') return false;
  return d.ok === true || d.status === 'completed';
}

/** The result is a flat object, not the nested node_results shape of older CAD workflows. */
export function parseRingCadResult(data: unknown): RingCadResult {
  const d = (data ?? {}) as Record<string, unknown>;

  const threedmArtifact = readArtifact(d.threedm_artifact);
  const glbArtifact = readArtifact(d.glb_artifact);
  const diagnostics = (d.cad_diagnostics && typeof d.cad_diagnostics === 'object'
    ? d.cad_diagnostics
    : {}) as RingCadDiagnostics;

  const rawStatus = typeof d.validation_status === 'string' ? d.validation_status : null;
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
    retryable: phase === 'cad_export',
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
