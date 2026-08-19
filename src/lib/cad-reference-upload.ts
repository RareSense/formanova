/**
 * cad-reference-upload.ts
 *
 * Turns the picked reference files into whatever `reference_image_artifacts`
 * should carry on the ring_cad_nurbs_v1 start call.
 *
 * Split out of useImageToCADWorkflow so the fallback rule below is directly
 * testable without standing up the whole generation hook (AI_RULES section 10:
 * API/result-shape changes need tests).
 */
import { uploadCadReferenceImages, CadReferenceUploadError } from '@/lib/microservices-api';
import type { ImageInput } from '@/lib/ring-cad-nurbs-api';

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Preferred path: POST /upload/cad-reference, then pass the returned item
 * objects through unmodified (all six keys). This is what gives the images
 * real asset ids and set membership, which "My Rings" is built on.
 *
 * TEMPORARY FALLBACK — remove once /upload/cad-reference is live in prod.
 * Backend shipped it to staging on 2026-08-19 with the prod deploy pending,
 * and will send a "live in prod" note. Until then prod would 404 on every
 * generation, so a 404 — meaning the endpoint isn't deployed to THIS
 * environment — falls back to the previous inline-base64 behaviour.
 *
 * Deliberately scoped to 404 alone: 400 (bad file), 401 (auth), and 422 (too
 * many files) are real failures and must surface rather than silently
 * degrading to a path that would hide them.
 *
 * Removal condition: delete this function's catch block (and the base64
 * helper) once prod is confirmed; `uploadCadReferenceImages` then stands alone.
 */
export async function buildReferenceInputs(files: File[]): Promise<ImageInput[]> {
  if (files.length === 0) return [];
  try {
    const { items } = await uploadCadReferenceImages(files, { category: 'ring' });
    return items;
  } catch (err) {
    if (err instanceof CadReferenceUploadError && err.status === 404) {
      console.warn('[cad] /upload/cad-reference not deployed here; falling back to inline base64');
      return Promise.all(files.map(fileToDataUri));
    }
    throw err;
  }
}
