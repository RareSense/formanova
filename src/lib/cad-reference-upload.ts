/**
 * cad-reference-upload.ts
 *
 * Turns the picked reference files into whatever `reference_image_artifacts`
 * should carry on the ring_cad_nurbs_v1 start call.
 *
 * The whole set goes up in ONE call to /upload/cad-reference, which mints a
 * single set_id for it. That is what makes a set mean exactly one generation,
 * so five images used for one run show as one card in My Rings rather than
 * five. Uploading per attach instead mints a set per attach, and the grouping
 * then reflects how the user happened to click rather than what they made.
 *
 * Split out of useImageToCADWorkflow so the fallback rule below is directly
 * testable without standing up the whole generation hook (AI_RULES section 10:
 * API/result-shape changes need tests).
 */
import { uploadCadReferenceImages } from '@/lib/microservices-api';
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
 * Uploads the set and returns the item objects, passed through UNMODIFIED with
 * all six keys. Backend confirmed nothing between their API boundary and the
 * tool call strips or schema-validates these, so `asset_id` and `position`
 * ride along harmlessly.
 *
 * If the upload fails, the files are inlined as base64 instead, which is what
 * the workflow accepted before this endpoint existed. An upload problem must
 * never stop someone generating: they lose the vault entry, not the ring.
 */
export async function buildReferenceInputs(files: File[]): Promise<ImageInput[]> {
  if (files.length === 0) return [];
  try {
    const { items } = await uploadCadReferenceImages(files, { category: 'ring' });
    // Trust the response only if it covers every file. A short list would
    // silently drop images from the generation, which is worse than inlining.
    if (items.length === files.length) return items as ImageInput[];
    console.warn('[cad] upload returned fewer items than files; inlining instead');
  } catch (err) {
    console.warn('[cad] reference upload failed; inlining images for this run', err);
  }
  return Promise.all(files.map(fileToDataUri));
}
