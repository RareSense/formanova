import { describe, expect, it } from 'vitest';
import { classifyWorkflow, getWorkflowTypeMeta, inferSourceType } from './workflow-classifier';

describe('workflow classification', () => {
  it('routes ring_cad_nurbs_v1 to Image to CAD rather than CAD Render', () => {
    // "ring_cad_nurbs_v1" contains "cad" but neither "sketch" nor "image", so
    // without an explicit rule the lower-priority cad_render rule claims it.
    const meta = classifyWorkflow('ring_cad_nurbs_v1');
    expect(meta.sourceType).toBe('image_to_cad');
    expect(meta.historyTitle).toBe('Image to CAD');
    expect(meta.loadRoute).toBe('/image-to-cad');
  });

  it('still classifies the older sketch workflow as Image to CAD', () => {
    expect(inferSourceType('sketch_generate_v1')).toBe('image_to_cad');
  });

  it('labels the text workflow Text to CAD', () => {
    const meta = classifyWorkflow('ring_generate_v1');
    expect(meta.sourceType).toBe('text_to_cad');
    expect(meta.historyTitle).toBe('Text to CAD');
    expect(meta.loadRoute).toBe('/text-to-cad');
  });

  it('does not use the old CAD naming in history titles', () => {
    for (const sourceType of ['image_to_cad', 'text_to_cad'] as const) {
      const title = getWorkflowTypeMeta(sourceType).historyTitle ?? '';
      expect(title).not.toMatch(/sketch to cad|generate cad design/i);
    }
  });

  it('leaves genuine CAD renders alone', () => {
    expect(inferSourceType('cad_render_preview')).toBe('cad_render');
  });

  it('keeps photo and product shot classification unchanged', () => {
    expect(inferSourceType('jewelry_photoshoots_generator')).toBe('photo');
    expect(inferSourceType('Product_shot_pipeline')).toBe('product_shot');
  });
});
