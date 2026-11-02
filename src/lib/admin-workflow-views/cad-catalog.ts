/**
 * Product Shot from CAD (FormaNova_cad_to_catalog toolkit, see cad-to-catalog-api.ts):
 *   cad_to_catalog_fastload  payload { cad_file } -> { skeleton_3dm, meshes, triangles, meshed, unmeshed, seconds }
 *   cad_to_catalog_shot      kind "photo": { render_image, background_image, materials, aspect, resolution, model }
 *                            -> place_in_scene { image, ai_image, prompt, fit, model, seconds }
 *                            kind "white": { piece, category, pictures[{ name, angle, metal, image }] }
 *                            -> save_pictures { images[{ name, file }] }
 * Results are found by key, not tool name, since the run result may nest them under a node.
 */
import { payloadRoot } from '@/lib/admin-generation-inputs';
import type { AdminGenerationDetail, AdminGenerationStep } from '@/lib/admin-generations-api';
import { asRecord, buildSteps, field, fileFrom, imageUrl, lastNodeWithKey, text, unwrapResult } from './common';
import { genericStep } from './generic';
import { emptySection, type ViewField, type ViewFile, type ViewImage, type WorkflowView } from './types';

const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('en-US') : null);

export function fastloadView(detail: AdminGenerationDetail): WorkflowView {
  const input = fileFrom(payloadRoot(detail.input_payload).cad_file, 'Input .3dm');
  const result = lastNodeWithKey(detail.steps, 'skeleton_3dm');
  const files = result
    ? [fileFrom(result.skeleton_3dm, 'Skeleton .3dm'), fileFrom(result.meshes, 'Meshes')].filter((f): f is ViewFile => Boolean(f))
    : [];
  const fields: ViewField[] = result
    ? [
        ...field('Triangles', count(result.triangles)),
        ...field('Surfaces meshed', count(result.meshed)),
        ...field('Surfaces not meshed', count(result.unmeshed)),
        ...field('Seconds', result.seconds),
      ]
    : [];
  return {
    family: 'cad_fastload',
    inputs: { ...emptySection(), files: input ? [input] : [] },
    steps: buildSteps(detail.steps, genericStep),
    outputs: { ...emptySection(), files, fields },
  };
}

function savedImages(images: unknown): ViewImage[] {
  if (!Array.isArray(images)) return [];
  return images.flatMap((item, i) => {
    const record = asRecord(item);
    const url = imageUrl(record?.file ?? record?.image);
    return url ? [{ url, label: text(record?.name) ?? `Picture ${i + 1}` }] : [];
  });
}

function describeShotStep(step: AdminGenerationStep) {
  const out = unwrapResult(step.output);
  if ('ai_image' in out || 'prompt' in out) {
    return {
      fields: [...field('Prompt', out.prompt, true), ...field('Model', out.model), ...field('Fit', out.fit), ...field('Seconds', out.seconds)],
      images: [],
    };
  }
  if (Array.isArray(out.images)) {
    return { fields: field('Seconds', out.seconds), images: savedImages(out.images) };
  }
  return genericStep(step);
}

export function catalogShotView(detail: AdminGenerationDetail): WorkflowView {
  const root = payloadRoot(detail.input_payload);
  const render = imageUrl(root.render_image);
  const background = imageUrl(root.background_image);
  const pictures = (Array.isArray(root.pictures) ? root.pictures : []).flatMap((item, i) => {
    const record = asRecord(item);
    const url = imageUrl(record?.image);
    if (!url) return [];
    const name = text(record?.name) ?? `Picture ${i + 1}`;
    const about = [text(record?.angle), text(record?.metal)].filter(Boolean).join(', ');
    return [{ url, label: about ? `${name} (${about})` : name }];
  });

  const placed = lastNodeWithKey(detail.steps, 'ai_image');
  const saved = lastNodeWithKey(detail.steps, 'images');
  const outputs: ViewImage[] = [];
  const placedUrl = imageUrl(placed?.image);
  const aiUrl = imageUrl(placed?.ai_image);
  if (placedUrl) outputs.push({ url: placedUrl, label: 'Placed photo' });
  if (aiUrl && aiUrl !== placedUrl) outputs.push({ url: aiUrl, label: 'AI picture (before paste-back)' });
  outputs.push(...savedImages(saved?.images));

  return {
    family: 'cad_shot',
    inputs: {
      ...emptySection(),
      images: [
        ...(render ? [{ url: render, label: 'Render' }] : []),
        ...(background ? [{ url: background, label: 'Background' }] : []),
        ...pictures,
      ],
      fields: [
        ...field('Kind', root.kind),
        ...field('Piece', root.piece),
        ...field('Category', root.category),
        ...field('Materials', root.materials),
        ...field('Aspect', root.aspect),
        ...field('Resolution', root.resolution),
        ...field('Model', root.model),
      ],
    },
    steps: buildSteps(detail.steps, describeShotStep),
    outputs: { ...emptySection(), images: outputs },
  };
}
