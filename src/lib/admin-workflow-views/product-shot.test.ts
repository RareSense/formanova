import { describe, expect, it } from 'vitest';

import { productShotView } from './product-shot';
import { productShotRun, proxy } from './__fixtures__/runs';

describe('productShotView', () => {
  it('inputs: every jewelry image, the inspiration and the options', () => {
    const view = productShotView(productShotRun());
    expect(view.family).toBe('product_shot');
    expect(view.inputs.images).toEqual([
      { url: proxy(1), label: 'Jewelry 1' },
      { url: proxy(2), label: 'Jewelry 2' },
      { url: proxy(3), label: 'Inspiration' },
    ]);
    expect(view.inputs.fields).toEqual([
      { label: 'Category', value: 'earrings' },
      { label: 'Art direction (user)', value: 'warm white marble, soft morning light', long: true },
      { label: 'Aspect ratio', value: '4:5' },
      { label: 'Image size', value: '2K' },
    ]);
  });

  it('steps: the analysis, the generated prompt, the failed attempt and the retry', () => {
    const [analyze, prepare, failed, generate] = productShotView(productShotRun()).steps;
    expect(analyze.fields).toEqual([
      { label: 'Category', value: 'earrings' },
      { label: 'Pattern', value: 'pair' },
      { label: 'Identity', value: 'gold hoop earring' },
      { label: 'Summary', value: 'a pair of gold hoops shown front' },
      { label: 'Same piece', value: 'yes' },
      { label: 'Art direction: surface', value: 'white marble' },
      { label: 'Art direction: lighting', value: 'soft morning light' },
    ]);
    expect(prepare.fields[0]).toEqual({
      label: 'Prompt', long: true,
      value: 'Product photograph of a pair of gold hoop earrings on warm white marble, soft morning light.',
    });
    expect([failed.failed, failed.retried, failed.error]).toEqual([true, true, 'HTTP 504 from generate_jewelry_image_pdp_higher_tier: upstream timed out']);
    expect(generate.images).toEqual([{ url: proxy(4), label: 'Generated image' }]);
  });

  it('output: the final image from the last successful generate call', () => {
    expect(productShotView(productShotRun()).outputs.images).toEqual([{ url: proxy(4), label: 'Final image' }]);
  });

  it('shows no output image when no generate call succeeded', () => {
    const run = productShotRun();
    run.steps = run.steps.slice(0, 3);
    expect(productShotView(run).outputs.images).toEqual([]);
  });

  it('reads a single jewelry image and survives an empty payload', () => {
    const run = productShotRun();
    run.input_payload = { payload: { jewelry_image_url: 'https://cdn.example.com/hoop.jpg' } };
    expect(productShotView(run).inputs.images).toEqual([{ url: 'https://cdn.example.com/hoop.jpg', label: 'Jewelry' }]);
    run.input_payload = null;
    run.steps = [];
    const empty = productShotView(run);
    expect([empty.inputs.images, empty.inputs.fields, empty.steps, empty.outputs.images]).toEqual([[], [], [], []]);
  });
});
