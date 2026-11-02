import { describe, expect, it } from 'vitest';

import { designImageView } from './design-image';
import { designImageRun, proxy } from './__fixtures__/runs';

describe('designImageView', () => {
  it('inputs: the prompt, role-labelled pictures and the options', () => {
    const view = designImageView(designImageRun());
    expect(view.family).toBe('design_image');
    expect(view.inputs.fields).toEqual([
      { label: 'Prompt', value: 'Make the band thinner and add milgrain', long: true },
      { label: 'Category', value: 'ring' },
      { label: 'Angle', value: 'three_quarter' },
      { label: 'Dimensions', value: 'band 2 mm' },
      { label: 'Output', value: 'render' },
    ]);
    expect(view.inputs.images.map((i) => i.label)).toEqual(['Design being edited', 'Design with annotations', 'Inspiration / reference']);
    expect(view.inputs.images[0].url).toBe(proxy(20));
  });

  it('output: the picture, whether it matches the design and what drifted', () => {
    const view = designImageView(designImageRun());
    expect(view.outputs.images).toEqual([{ url: proxy(23), label: 'Design picture' }]);
    expect(view.outputs.fields).toEqual([
      { label: 'Matches the design', value: 'no' },
      { label: 'Drift', value: 'stone is oval, the design shows round' },
      { label: 'View', value: 'three_quarter' },
    ]);
  });

  it('leaves consistency out when the run had no design to check against', () => {
    const run = designImageRun();
    run.steps[0].output = { result: { ok: true, image_artifact: { uri: `https://api/artifacts/${'e'.repeat(64)}`, type: 'image/png' } } };
    expect(designImageView(run).outputs.fields).toEqual([]);
  });
});
