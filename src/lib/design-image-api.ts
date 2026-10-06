/**
 * design-image-api.ts
 *
 * Request and result shaping for the Create CAD studio's design pictures: one
 * run of `design_image_v1` makes ONE picture from words plus up to four images.
 * Pure functions only; starting, polling and credits live in useDesignImageRun.
 *
 *   POST /api/run/state/design_image_v1  -> { workflow_id }
 *   GET  /api/status/{id}                -> runtime.state
 *   GET  /api/result/{id}                -> DesignImageResult (toolkit design_image tool)
 *
 * The contract mirrors the toolkit tool (FormaNova_cad_toolkit_v2,
 * app/toolkit/tools/design_image/schemas.py):
 * - images carry a role: `base` is the design being edited (the source of
 *   truth), `markup` is that design with the customer's pen marks flattened
 *   onto it, `reference` is anything to borrow from. At most one base OR markup.
 * - `view` is free text ("top", "looking at the crest side"); null keeps the
 *   camera where the base image has it.
 * - the result reports `consistent` / `drift` when there was a design to check
 *   against, so the UI can offer "Redo free" on a view that doesn't match.
 *
 * "4 designs to choose from" is four runs of this workflow, not one run with a
 * count: the tool returns exactly one image per call.
 */
import { readArtifact, type ArtifactRef, type CadJewelryType, type ImageInput } from '@/lib/ring-cad-nurbs-api';

export const DESIGN_IMAGE_WORKFLOW = 'design_image_v1';

/** Toolkit limits (schemas.py MAX_IMAGES / VIEW_MAX_CHARS / prompt max_length). */
export const MAX_DESIGN_IMAGES = 4;
export const MAX_DESIGN_VIEW_CHARS = 200;
export const MAX_DESIGN_PROMPT_CHARS = 4000;

/** Status polling for one picture. Typical runs finish in 20-60 s. */
export const DESIGN_IMAGE_POLL_INTERVAL_MS = 2000;
export const DESIGN_IMAGE_POLL_TIMEOUT_MS = 4 * 60 * 1000;

export type DesignImageRole = 'base' | 'markup' | 'reference';
export type DesignImageOutput = 'render' | 'sketch';

export interface DesignImageAttachment {
  role: DesignImageRole;
  image: ImageInput;
}

export interface DesignImageStartParams {
  prompt?: string;
  images?: DesignImageAttachment[];
  output?: DesignImageOutput;
  view?: string | null;
  jewelryType?: CadJewelryType | null;
  dimensions?: string | null;
}

export interface DesignImageStartBody {
  payload: Record<string, unknown>;
}

/** Raised for requests the toolkit would reject, so the UI never spends a call on them. */
export class DesignImageRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DesignImageRequestError';
  }
}

export function buildDesignImageStartBody({
  prompt = '',
  images = [],
  output = 'render',
  view = null,
  jewelryType = null,
  dimensions = null,
}: DesignImageStartParams): DesignImageStartBody {
  const text = prompt.trim();
  if (images.length > MAX_DESIGN_IMAGES) {
    throw new DesignImageRequestError(`At most ${MAX_DESIGN_IMAGES} pictures can be sent at once`);
  }
  const anchors = images.filter((i) => i.role === 'base' || i.role === 'markup');
  if (anchors.length > 1) {
    throw new DesignImageRequestError('Only one design can be edited at a time');
  }
  if (!text && anchors.length === 0) {
    throw new DesignImageRequestError('Describe the design, or start from a picture');
  }
  if (text.length > MAX_DESIGN_PROMPT_CHARS) {
    throw new DesignImageRequestError(`Keep the description under ${MAX_DESIGN_PROMPT_CHARS} characters`);
  }
  const viewText = view?.trim() || null;
  if (viewText && viewText.length > MAX_DESIGN_VIEW_CHARS) {
    throw new DesignImageRequestError(`Keep the angle under ${MAX_DESIGN_VIEW_CHARS} characters`);
  }

  const payload: Record<string, unknown> = {
    prompt: text,
    // An artifact object or a data: URL; the backend stores data: URLs on receipt.
    images: images.map((i) => ({ role: i.role, artifact: i.image })),
    output,
    api_key: 'managed',
  };
  if (viewText) payload.view = viewText;
  if (jewelryType) payload.jewelry_type = jewelryType;
  const dims = dimensions?.trim();
  if (dims) payload.dimensions = dims;
  return { payload };
}

export interface DesignImageResult {
  image: ArtifactRef;
  /** null when there was nothing to check against (a brand-new design) or the check itself failed. */
  consistent: boolean | null;
  /** What differs from the design, in plain words, when consistent is false. */
  drift: string[];
  view: string | null;
}

export interface DesignImageFailure {
  userMessage: string;
  errorCategory: string | null;
  retryable: boolean;
}

/**
 * The result may arrive flat or wrapped under a sink node (see findKeyDeep in
 * ring-cad-nurbs-api). Returns the object that holds image_artifact so its
 * sibling fields (consistent, drift, user_message) are read with it.
 */
function resultNode(data: unknown, depth = 0): Record<string, unknown> {
  const root = (data ?? {}) as Record<string, unknown>;
  if (depth > 6 || typeof root !== 'object') return {};
  if ('image_artifact' in root || 'user_message' in root || root.tool === 'design_image') return root;
  for (const value of Object.values(root)) {
    const child = Array.isArray(value) ? value[0] : value;
    if (child && typeof child === 'object') {
      const found = resultNode(child, depth + 1);
      if (Object.keys(found).length) return found;
    }
  }
  return depth === 0 ? root : {};
}

export function isDesignImageSuccess(data: unknown): boolean {
  const d = resultNode(data);
  if (d.ok === false) return false;
  if (typeof d.status === 'string' && d.status.toLowerCase() === 'failed') return false;
  return readArtifact(d.image_artifact) !== null;
}

export function parseDesignImageResult(data: unknown): DesignImageResult {
  const d = resultNode(data);
  const image = readArtifact(d.image_artifact);
  if (!image) throw new Error('No design picture found in the run result');
  const drift = Array.isArray(d.drift) ? d.drift.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];
  return {
    image,
    consistent: typeof d.consistent === 'boolean' ? d.consistent : null,
    drift,
    view: typeof d.view === 'string' && d.view ? d.view : null,
  };
}

const GENERIC_FAILURE = "We couldn't make that picture. Try again, or say it a different way.";

export function parseDesignImageFailure(data: unknown): DesignImageFailure {
  const d = resultNode(data);
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return {
    userMessage: str(d.user_message) ?? GENERIC_FAILURE,
    errorCategory: str(d.error_category),
    retryable: d.retryable === true,
  };
}
