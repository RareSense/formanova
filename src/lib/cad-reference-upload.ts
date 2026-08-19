/**
 * cad-reference-upload.ts
 *
 * Turns the picked reference files into whatever `reference_image_artifacts`
 * should carry on the ring_cad_nurbs_v1 start call.
 *
 * Uploading happens when an image is ATTACHED, not here — see
 * useReferenceImages, which mirrors Photo Studio's handleJewelryUpload. By the
 * time generation runs, each file normally already has its uploaded item, so
 * this just pairs them up.
 *
 * Split out of useImageToCADWorkflow so the fallback rule below is directly
 * testable without standing up the whole generation hook (AI_RULES section 10:
 * API/result-shape changes need tests).
 */
import type { CadReferenceItem } from '@/lib/microservices-api';
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
 * Pairs each file with the item produced when it was attached, falling back to
 * inlining that file as base64 where no item exists.
 *
 * A missing item means one of: the upload is still in flight, it failed, or
 * /upload/cad-reference is not deployed to this environment (prod, until
 * backend's deploy lands). All three degrade to the old base64 path so the
 * user can still generate — an upload problem must never block generating.
 *
 * Items are passed through UNMODIFIED, all six keys including asset_id and
 * position: backend confirmed nothing between their API boundary and the tool
 * call strips or schema-validates these elements.
 */
export async function buildReferenceInputs(
  files: File[],
  uploadedItems: (CadReferenceItem | null)[] = [],
): Promise<ImageInput[]> {
  if (files.length === 0) return [];
  return Promise.all(
    files.map((file, i) => {
      const item = uploadedItems[i];
      return item ? Promise.resolve(item as ImageInput) : fileToDataUri(file);
    }),
  );
}
