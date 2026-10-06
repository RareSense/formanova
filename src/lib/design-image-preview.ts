/**
 * design-image-preview.ts — TEMPORARY, remove when design_image_v1 is live.
 *
 * The design_image_v1 workflow is not registered on the backend yet, so the
 * editor would only show errors. Until it is, pictures are "made" here with no
 * backend call and no credits: after a short wait the request's own picture
 * comes back (an edit returns the design unchanged, an angle returns the
 * approved picture). This lets the whole interface be tried end to end.
 *
 * To go live: set DESIGN_IMAGE_BACKEND_LIVE to true (or delete this file and
 * its one use in useDesignImageRun).
 */
import type { DesignImageResult, DesignImageStartParams } from '@/lib/design-image-api';
import type { ArtifactRef, ImageInput } from '@/lib/ring-cad-nurbs-api';

export const DESIGN_IMAGE_BACKEND_LIVE = false;

const WAIT_MS = 2500;

function toArtifact(image: ImageInput): ArtifactRef | null {
  if (typeof image === 'string') return { uri: image, url: image, type: 'image/png', bytes: 0, sha256: '' };
  const url = (image as { url?: string }).url;
  return url ? { uri: (image as { uri?: string }).uri ?? url, url, type: 'image/png', bytes: 0, sha256: '' } : null;
}

/** One preview picture: the base (or marked-up) picture, or `fallback` when the request had none. */
export async function previewDesignImage(request: DesignImageStartParams, fallback: string | null, signal?: AbortSignal): Promise<DesignImageResult | null> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, WAIT_MS + Math.random() * 1000);
    signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
  if (signal?.aborted) return null;
  const source = request.images?.find((i) => i.role === 'base') ?? request.images?.[0];
  const image = source ? toArtifact(source.image) : fallback ? toArtifact(fallback) : null;
  if (!image) throw new Error('Nothing to show yet: add a picture or try an example.');
  return { image, consistent: request.view ? true : null, drift: [], view: request.view ?? null };
}
