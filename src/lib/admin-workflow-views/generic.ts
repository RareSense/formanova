/**
 * The fallback view for workflows without their own extractor: every picture found in
 * the payload and the steps, and every simple key, as recorded.
 */
import { payloadRoot } from '@/lib/admin-generation-inputs';
import type { AdminGenerationDetail, AdminGenerationStep } from '@/lib/admin-generations-api';
import { asRecord, buildSteps, dedupeImages, fieldsFromObject, imageUrl, stepFailure, unwrapResult } from './common';
import { emptySection, type ViewField, type ViewImage, type WorkflowView } from './types';

const IMAGE_KEY = /(image|img|photo|picture|thumbnail|preview|screenshot|render|background|output_url|result_url)/i;
const LINK_VALUE = /^(https?:|azure:|data:|\/api\/)/;

/** Pictures anywhere in a value: data:image strings, image-named keys, and image artifacts. */
export function imagesIn(node: unknown): ViewImage[] {
  const out: ViewImage[] = [];
  function visit(value: unknown, key: string, depth: number) {
    if (depth > 8) return;
    if (typeof value === 'string') {
      const url = value.startsWith('data:image/') || IMAGE_KEY.test(key) ? imageUrl(value) : null;
      if (url) out.push({ url, label: key || 'Image' });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((child) => visit(child, key, depth + 1));
      return;
    }
    const record = asRecord(value);
    if (!record) return;
    if (typeof record.type === 'string' && (typeof record.uri === 'string' || typeof record.url === 'string')) {
      const url = imageUrl(record);
      if (url) out.push({ url, label: key || 'Image' });
      return; // a stored file: pictures are taken, other files are not descended into
    }
    Object.entries(record).forEach(([childKey, child]) => visit(child, childKey, depth + 1));
  }
  visit(node, '', 0);
  return dedupeImages(out);
}

/** Simple values of a record, leaving out links and pictures (they are shown as images). */
export function plainFields(value: unknown): ViewField[] {
  const record = asRecord(value) ?? {};
  const kept = Object.fromEntries(Object.entries(record).filter(([, v]) => !(typeof v === 'string' && LINK_VALUE.test(v.trim()))));
  return fieldsFromObject(kept);
}

export function genericStep(step: AdminGenerationStep): { fields: ViewField[]; images: ViewImage[] } {
  return { fields: plainFields(unwrapResult(step.output)), images: imagesIn(step.output) };
}

/** The last picture a successful step produced, else the complaint's output picture. */
export function lastOutputImage(detail: AdminGenerationDetail): ViewImage[] {
  for (let i = detail.steps.length - 1; i >= 0; i -= 1) {
    const step = detail.steps[i];
    if (stepFailure(step.output).failed) continue;
    const images = imagesIn(step.output);
    if (images.length) return [{ url: images[images.length - 1].url, label: 'Output image' }];
  }
  return complaintImage(detail);
}

/** The output picture a complaint recorded; used only when the steps show none. */
export function complaintImage(detail: AdminGenerationDetail): ViewImage[] {
  const url = imageUrl(detail.feedback?.output_image_url ?? null);
  return url ? [{ url, label: 'Output image (from complaint)' }] : [];
}

export function genericView(detail: AdminGenerationDetail): WorkflowView {
  const root = payloadRoot(detail.input_payload);
  return {
    family: 'generic',
    inputs: { ...emptySection(), images: imagesIn(root), fields: plainFields(root) },
    steps: buildSteps(detail.steps, genericStep),
    outputs: { ...emptySection(), images: lastOutputImage(detail) },
  };
}
