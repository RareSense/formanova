import { describe, expect, it } from 'vitest';

import { buildRunView, workflowFamily, type ViewNode } from './index';
import { findNodes } from './walker';
import {
  cadImproveRun, catalogShotRun, designImageRun, fastloadRun, photoshoot4kRun, productShotRun, proxy, syntheticReelRun,
} from './__fixtures__/runs';

const labelAt = (node: ViewNode, path: string) => findNodes(node, (n) => n.path === path)[0]?.label;

describe('workflowFamily', () => {
  it.each([
    ['Product_shot_pipeline', false, 'product_shot'],
    ['Product_shot_pipeline_higher_tier', false, 'product_shot'],
    ['jewelry_photoshoots_generator', false, 'photoshoot'],
    ['jewelry_photoshoots_generator_higher_tier_4k', false, 'photoshoot'],
    ['design_image_v1', false, 'design_image'],
    ['cad_to_catalog_fastload', true, 'cad_fastload'],
    ['cad_to_catalog_shot', false, 'cad_shot'],
    ['jewelry_cad_generate', true, 'cad_model'],
    ['ring_cad_improve', true, 'cad_model'],
    ['fix_model_shot_higher_tier', false, 'generic'],
    ['', false, 'generic'],
  ])('%s -> %s', (name, isCadModel, family) => {
    expect(workflowFamily(name, isCadModel)).toBe(family);
  });
});

describe('buildRunView: generic walk with family labels', () => {
  it('product shot: labelled pictures first, final output from the last successful step', () => {
    const view = buildRunView(productShotRun(), false);
    expect(view.inputs.kind === 'group' && view.inputs.children.map((c) => c.key).slice(0, 3))
      .toEqual(['jewelry_image_urls', 'jewelry_image_url', 'inspiration_image_url']);
    expect(labelAt(view.inputs, 'input_payload.jewelry_image_urls[1]')).toBe('Jewelry 2');
    expect(labelAt(view.inputs, 'input_payload.user_art_direction')).toBe('Art direction (user)');
    expect(view.steps.map((s) => [s.failed, s.retried])).toEqual([[false, false], [false, false], [true, true], [false, false]]);
    expect(view.outputs).toMatchObject({ stepIndex: 4, tool: 'generate_jewelry_image_pdp_higher_tier' });
    expect(findNodes(view.outputs!.node, (n) => n.kind === 'media' && n.media === 'image')[0]).toMatchObject({ url: proxy(4), label: 'Generated image' });
  });

  it('photoshoot: step-scoped labels for prompts and the intermediate image', () => {
    const view = buildRunView(photoshoot4kRun(), false);
    expect(labelAt(view.steps[1].output, 'steps[1].output.prompt')).toBe('Initial prompt');
    expect(labelAt(view.steps[2].output, 'steps[2].output.image')).toBe('Intermediate image');
    expect(view.outputs?.tool).toBe('upscale_higher_tier_4k');
    expect(labelAt(view.outputs!.node, 'steps[6].output.image')).toBe('Upscaled image');
  });

  it('design image: pictures named by their role', () => {
    const view = buildRunView(designImageRun(), false);
    expect(labelAt(view.inputs, 'input_payload.payload.images[1].artifact')).toBe('Design with annotations');
    expect(labelAt(view.steps[0].output, 'steps[0].output.result.consistent')).toBe('Matches the design');
  });

  it('fastload: the .3dm is a file, never a picture placeholder', () => {
    const view = buildRunView(fastloadRun(), true);
    expect(view.family).toBe('cad_fastload');
    expect(findNodes(view.inputs, (n) => n.kind === 'media')).toMatchObject([{ media: 'file', ext: '3dm', name: 'pave-halo-ring.3dm', label: 'Input .3dm' }]);
    expect(findNodes(view.outputs!.node, (n) => n.kind === 'media').map((n) => n.label)).toEqual(['Skeleton .3dm', 'Meshes']);
  });

  it('CAD: the GLB is a 3D model and every file is a link', () => {
    const view = buildRunView(cadImproveRun(), true);
    const media = findNodes(view.outputs!.node, (n) => n.kind === 'media');
    expect(media.map((n) => n.kind === 'media' && [n.label, n.media])).toEqual([
      ['GLB', 'model3d'], ['3DM', 'file'], ['STL', 'file'], ['STEP', 'file'], ['Files', 'file'], ['Spec sheet', 'file'],
    ]);
  });

  it('catalog shot: placed photo and the AI picture are labelled', () => {
    const view = buildRunView(catalogShotRun(), false);
    expect(findNodes(view.outputs!.node, (n) => n.kind === 'media').map((n) => n.label)).toEqual(['Placed photo', 'AI picture (before paste-back)']);
  });

  it('unknown workflow: humanised labels, nothing needed in admin code', () => {
    const view = buildRunView(syntheticReelRun(), false);
    expect(view.family).toBe('generic');
    expect(labelAt(view.inputs, 'input_payload.payload.brand_kit')).toBe('Brand kit');
    expect(findNodes(view.outputs!.node, (n) => n.kind === 'media').map((n) => n.kind === 'media' && n.media)).toEqual(['file', 'image', 'file']);
  });

  it('no successful step means no outputs, not an invented one', () => {
    const run = productShotRun();
    run.steps = run.steps.slice(2, 3);
    expect(buildRunView(run, false).outputs).toBeNull();
  });
});
