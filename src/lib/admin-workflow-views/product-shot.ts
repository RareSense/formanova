/**
 * Product_shot_pipeline(_higher_tier): analyze_jewelry_pdp -> prepare_jewelry_request_pdp*
 * -> generate_jewelry_image_pdp*. Inputs come from the request payload (falling back to the
 * first step's input, which the DAG maps from __root__).
 */
import { payloadRoot } from '@/lib/admin-generation-inputs';
import type { AdminGenerationDetail, AdminGenerationStep } from '@/lib/admin-generations-api';
import { asRecord, buildSteps, dedupeImages, field, fieldsFromObject, firstImage, imageList, lastOk, unwrapResult } from './common';
import { complaintImage, genericStep } from './generic';
import { emptySection, type ViewImage, type WorkflowView } from './types';

/** Jewelry pictures (list first, else the single url), numbered when there are several. */
export function jewelryImages(roots: Record<string, unknown>[]): ViewImage[] {
  for (const root of roots) {
    const urls = [...new Set([...imageList(root.jewelry_image_urls), firstImage(root, ['jewelry_image_url'])].filter((u): u is string => Boolean(u)))];
    if (urls.length) return urls.map((url, i) => ({ url, label: urls.length > 1 ? `Jewelry ${i + 1}` : 'Jewelry' }));
  }
  return [];
}

/** The picture a generate/upscale call produced: its stored image, else its output_url. */
export function producedImage(step: AdminGenerationStep | null): string | null {
  if (!step) return null;
  const out = unwrapResult(step.output);
  return firstImage(out, ['image', 'output_url', 'image_url']);
}

/** The roots inputs are read from: the request, then what the first step was given. */
export function inputRoots(detail: AdminGenerationDetail): Record<string, unknown>[] {
  return [payloadRoot(detail.input_payload), asRecord(detail.steps[0]?.input) ?? {}];
}

function describe(step: AdminGenerationStep) {
  const tool = step.tool_name;
  const out = unwrapResult(step.output);
  if (tool.startsWith('analyze_')) {
    return {
      fields: [
        ...field('Category', out.category),
        ...field('Pattern', out.pattern),
        ...field('Identity', out.identity),
        ...field('Summary', out.summary),
        ...field('Same piece', out.same_piece),
        ...fieldsFromObject(out.art_direction, 'Art direction'),
      ],
      images: [],
    };
  }
  if (tool.startsWith('prepare_')) {
    return {
      fields: [...field('Prompt', out.prompt, true), ...field('Aspect ratio', out.aspect_ratio), ...field('Image size', out.image_size)],
      images: [],
    };
  }
  if (tool.startsWith('generate_')) {
    const url = producedImage(step);
    return { fields: [], images: url ? [{ url, label: 'Generated image' }] : [] };
  }
  return genericStep(step);
}

export function productShotView(detail: AdminGenerationDetail): WorkflowView {
  const roots = inputRoots(detail);
  const [root] = roots;
  const inspiration = roots.map((r) => firstImage(r, ['inspiration_image_url']) ?? imageList(r.inspiration_image_urls)[0] ?? null).find(Boolean);
  const final = producedImage(lastOk(detail.steps, (t) => t.startsWith('generate_')));
  return {
    family: 'product_shot',
    inputs: {
      ...emptySection(),
      images: dedupeImages([...jewelryImages(roots), ...(inspiration ? [{ url: inspiration, label: 'Inspiration' }] : [])]),
      fields: [
        ...field('Category', root.category),
        ...field('Art direction (user)', root.user_art_direction, true),
        ...field('Aspect ratio', root.aspect_ratio),
        ...field('Image size', root.image_size),
      ],
    },
    steps: buildSteps(detail.steps, describe),
    outputs: { ...emptySection(), images: final ? [{ url: final, label: 'Final image' }] : complaintImage(detail) },
  };
}
