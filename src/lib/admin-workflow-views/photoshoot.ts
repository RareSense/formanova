/**
 * jewelry_photoshoots_generator(_higher_tier, _higher_tier_4k):
 *   analyze_onmodel_jewelry -> prepare_..._initial -> generate_..._initial (the intermediate
 *   draft) -> prepare_..._polished -> generate_..._polished -> upscale_higher_tier_4k (4K only).
 * The low-effort generator (prepare_jewelry_request -> generate_jewelry_image) reads the same way.
 */
import type { AdminGenerationDetail, AdminGenerationStep } from '@/lib/admin-generations-api';
import { asRecord, buildSteps, dedupeImages, field, fieldsFromObject, firstImage, lastOk, unwrapResult, valueText } from './common';
import { complaintImage, genericStep } from './generic';
import { inputRoots, jewelryImages, producedImage } from './product-shot';
import { emptySection, type ViewField, type WorkflowView } from './types';

/** analyze_onmodel_jewelry's items: one line per item, its simple values joined. */
function itemsText(items: unknown): ViewField[] {
  if (!Array.isArray(items) || !items.length) return [];
  const lines = items.map((item) => {
    const record = asRecord(item);
    if (!record) return valueText(item);
    return Object.entries(record)
      .map(([k, v]) => (['string', 'number', 'boolean'].includes(typeof v) ? `${k}: ${valueText(v)}` : null))
      .filter(Boolean)
      .join(' · ');
  }).filter(Boolean);
  return field('Items', lines.join('; '));
}

const stage = (tool: string) => (tool.includes('initial') ? 'initial' : tool.includes('polished') ? 'polished' : null);

function describe(step: AdminGenerationStep) {
  const tool = step.tool_name;
  const out = unwrapResult(step.output);
  if (tool.startsWith('analyze_')) {
    return {
      fields: [
        ...field('Category', out.category),
        ...itemsText(out.items),
        ...field('Piece', out.piece),
        ...fieldsFromObject(out.specs, 'Specs'),
        ...field('Needs repose', out.needs_repose),
        ...field('Pose match', out.pose_match),
        ...field('Model description', out.base_desc),
      ],
      images: [],
    };
  }
  if (tool.startsWith('prepare_')) {
    const which = stage(tool);
    const label = which === 'initial' ? 'Initial prompt' : which === 'polished' ? 'Polished prompt' : 'Prompt';
    return { fields: field(label, out.prompt, true), images: [] };
  }
  if (tool.startsWith('generate_') || tool.startsWith('upscale')) {
    const url = producedImage(step);
    const which = stage(tool);
    const label = tool.startsWith('upscale') ? 'Upscaled image'
      : which === 'initial' ? 'Intermediate image'
        : which === 'polished' ? 'Polished image' : 'Generated image';
    return { fields: [], images: url ? [{ url, label }] : [] };
  }
  return genericStep(step);
}

export function photoshootView(detail: AdminGenerationDetail): WorkflowView {
  const roots = inputRoots(detail);
  const [root] = roots;
  const model = roots.map((r) => firstImage(r, ['model_image_url', 'model_url'])).find(Boolean);
  const upscaled = producedImage(lastOk(detail.steps, (t) => t.startsWith('upscale')));
  const generated = producedImage(lastOk(detail.steps, (t) => t.startsWith('generate_')));
  const final = upscaled
    ? [{ url: upscaled, label: 'Final image (upscaled)' }]
    : generated ? [{ url: generated, label: 'Final image' }] : complaintImage(detail);
  return {
    family: 'photoshoot',
    inputs: {
      ...emptySection(),
      images: dedupeImages([...(model ? [{ url: model, label: 'Model' }] : []), ...jewelryImages(roots)]),
      fields: [
        ...field('Category', root.category),
        ...field('Piece (user)', root.user_piece),
        ...fieldsFromObject(root.user_specs, 'Specs (user)'),
        ...field('Aspect ratio', root.aspect_ratio),
        ...field('Image size', root.image_size),
        ...field('Upscale factor', root.upscale_factor),
      ],
    },
    steps: buildSteps(detail.steps, describe),
    outputs: { ...emptySection(), images: final },
  };
}
