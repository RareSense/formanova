import { describe, expect, it } from 'vitest';

import { extractWorkflowView, workflowFamily } from './index';
import { fastloadRun } from './__fixtures__/runs';

describe('workflowFamily', () => {
  it.each([
    ['Product_shot_pipeline', false, 'product_shot'],
    ['Product_shot_pipeline_higher_tier', false, 'product_shot'],
    ['jewelry_photoshoots_generator', false, 'photoshoot'],
    ['jewelry_photoshoots_generator_higher_tier', false, 'photoshoot'],
    ['jewelry_photoshoots_generator_higher_tier_4k', false, 'photoshoot'],
    ['design_image_v1', false, 'design_image'],
    ['cad_to_catalog_fastload', false, 'cad_fastload'],
    ['cad_to_catalog_shot', false, 'cad_shot'],
    ['jewelry_cad_generate', true, 'cad_model'],
    ['ring_cad_improve', true, 'cad_model'],
    ['fix_model_shot_higher_tier', false, 'generic'],
    ['', false, 'generic'],
  ])('%s -> %s', (name, isCadModel, family) => {
    expect(workflowFamily(name, isCadModel)).toBe(family);
  });

  it('fastload is never treated as a CAD model or an image workflow', () => {
    expect(workflowFamily('cad_to_catalog_fastload', true)).toBe('cad_fastload');
    expect(extractWorkflowView(fastloadRun(), false).family).toBe('cad_fastload');
  });
});
