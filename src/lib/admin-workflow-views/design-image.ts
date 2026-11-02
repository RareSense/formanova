/**
 * design_image_v1: one design picture from a prompt and role-labelled pictures
 * (base / markup / drawing / reference). The result's image_artifact sits with
 * consistent / drift / view (see design-image-api.ts).
 */
import { payloadRoot, readCadStudioInputs } from '@/lib/admin-generation-inputs';
import type { AdminGenerationDetail } from '@/lib/admin-generations-api';
import { buildSteps, field, imageUrl, lastNodeWithKey } from './common';
import { complaintImage, genericStep } from './generic';
import { emptySection, type WorkflowView } from './types';

export function designImageView(detail: AdminGenerationDetail): WorkflowView {
  const inputs = readCadStudioInputs('design_image_v1', payloadRoot(detail.input_payload), false);
  const result = lastNodeWithKey(detail.steps, 'image_artifact');
  const picture = imageUrl(result?.image_artifact);
  const drift = Array.isArray(result?.drift)
    ? result.drift.filter((d): d is string => typeof d === 'string' && d.trim() !== '').join('; ')
    : null;
  return {
    family: 'design_image',
    inputs: {
      ...emptySection(),
      // Same-origin proxy form, like every other view (inputImageUrl keeps the url as sent).
      images: (inputs?.images ?? []).map((img) => ({ ...img, url: imageUrl(img.url) ?? img.url })),
      fields: [...field('Prompt', inputs?.prompt, true), ...(inputs?.details ?? [])],
    },
    steps: buildSteps(detail.steps, genericStep),
    outputs: {
      ...emptySection(),
      images: picture ? [{ url: picture, label: 'Design picture' }] : complaintImage(detail),
      fields: result
        ? [...field('Matches the design', result.consistent), ...field('Drift', drift), ...field('View', result.view)]
        : [],
    },
  };
}
