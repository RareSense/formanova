import { describe, expect, it } from 'vitest';

import { photoshootView } from './photoshoot';
import { photoshoot4kRun, proxy } from './__fixtures__/runs';

describe('photoshootView', () => {
  it('inputs: model image, jewelry image(s) and every option including user specs', () => {
    const view = photoshootView(photoshoot4kRun());
    expect(view.family).toBe('photoshoot');
    expect(view.inputs.images).toEqual([
      { url: proxy(10), label: 'Model' },
      { url: proxy(11), label: 'Jewelry' },
    ]);
    expect(view.inputs.fields).toEqual([
      { label: 'Category', value: 'necklace' },
      { label: 'Piece (user)', value: 'emerald pendant necklace' },
      { label: 'Specs (user): chain_length', value: '45 cm' },
      { label: 'Specs (user): metal', value: '18k gold' },
      { label: 'Aspect ratio', value: '3:4' },
      { label: 'Image size', value: '4K' },
      { label: 'Upscale factor', value: '2' },
    ]);
  });

  it('steps: analysis, initial prompt + intermediate image, polished prompt + image, upscale', () => {
    const steps = photoshootView(photoshoot4kRun()).steps;
    expect(steps.map((s) => s.tool)).toHaveLength(7);
    expect(steps[0].fields).toEqual([
      { label: 'Category', value: 'necklace' },
      { label: 'Items', value: 'index: 0 · kind: pendant necklace · view: front' },
      { label: 'Piece', value: 'emerald pendant on a fine gold chain' },
      { label: 'Specs: chain_length', value: '45 cm' },
      { label: 'Needs repose', value: 'yes' },
      { label: 'Pose match', value: 'no' },
      { label: 'Model description', value: 'a woman in a white linen shirt' },
    ]);
    expect(steps[1].fields[0]).toMatchObject({ label: 'Initial prompt', long: true });
    expect(steps[2].images).toEqual([{ url: proxy(12), label: 'Intermediate image' }]);
    expect(steps[3].fields[0]).toMatchObject({ label: 'Polished prompt', long: true });
    expect([steps[4].failed, steps[4].retried, steps[4].error]).toEqual([true, true, 'OpenAI 429: rate limited']);
    expect(steps[5].images).toEqual([{ url: proxy(13), label: 'Polished image' }]);
    expect(steps[6].images).toEqual([{ url: proxy(14), label: 'Upscaled image' }]);
  });

  it('output: the upscaled image on _4k, else the polished one', () => {
    expect(photoshootView(photoshoot4kRun()).outputs.images).toEqual([{ url: proxy(14), label: 'Final image (upscaled)' }]);
    const run = photoshoot4kRun();
    run.workflow_name = 'jewelry_photoshoots_generator_higher_tier';
    run.steps = run.steps.slice(0, 6);
    expect(photoshootView(run).outputs.images).toEqual([{ url: proxy(13), label: 'Final image' }]);
  });

  it('a failed upscale leaves the polished image as the output, not an invented one', () => {
    const run = photoshoot4kRun();
    run.steps[6] = { ...run.steps[6], output: { error: 'no gpu' } };
    expect(photoshootView(run).outputs.images).toEqual([{ url: proxy(13), label: 'Final image' }]);
  });
});
