import { describe, expect, it } from 'vitest';

import { genericStep, genericView, imagesIn } from './generic';
import { proxy, unknownRun } from './__fixtures__/runs';

describe('genericView (unknown workflows)', () => {
  it('shows every picture found in the payload and every key', () => {
    const view = genericView(unknownRun());
    expect(view.family).toBe('generic');
    expect(view.inputs.images).toEqual([{ url: proxy(70), label: 'result_image_url' }]);
    expect(view.inputs.fields).toEqual([
      { label: 'fix_instruction', value: 'remove the second ring' },
      { label: 'category', value: 'ring' },
    ]);
  });

  it('steps show their simple values and pictures; the output is the last picture made', () => {
    const view = genericView(unknownRun());
    expect(view.steps[0].fields).toEqual([{ label: 'category', value: 'ring' }]);
    expect(view.steps[0].images).toEqual([{ url: proxy(71), label: 'output_url' }]);
    expect(view.outputs.images).toEqual([{ url: proxy(71), label: 'Output image' }]);
  });

  it('falls back to the complaint output picture when the steps have none', () => {
    const run = unknownRun();
    run.steps = [];
    run.feedback = { id: 'f', complaint: 'bad', category: 'other', reporter_email: '', created_at: '', input_image_urls: null, output_image_url: 'https://cdn.example.com/out.png' };
    expect(genericView(run).outputs.images).toEqual([{ url: 'https://cdn.example.com/out.png', label: 'Output image (from complaint)' }]);
  });
});

describe('imagesIn', () => {
  it('takes pictures by key or mime, not any url', () => {
    expect(imagesIn({
      model_image_url: 'https://cdn.example.com/m.jpg',
      docs_url: 'https://example.com/readme',
      file: { uri: 'https://api/artifacts/' + 'b'.repeat(64), type: 'model/vnd.3dm' },
      art: { uri: 'https://api/artifacts/' + 'c'.repeat(64), type: 'image/png' },
      inline: 'data:image/png;base64,AA',
    })).toEqual([
      { url: 'https://cdn.example.com/m.jpg', label: 'model_image_url' },
      { url: '/api/artifacts/' + 'c'.repeat(64), label: 'art' },
      { url: 'data:image/png;base64,AA', label: 'inline' },
    ]);
  });
});

describe('genericStep', () => {
  it('skips base64 and url values in the fields', () => {
    const out = genericStep({ tool_name: 't', took_ms: null, at: null, input: {}, output: { prompt: 'p', image_b64: 'AAA', output_url: 'https://cdn.example.com/o.png' } });
    expect(out.fields).toEqual([{ label: 'prompt', value: 'p' }]);
  });
});
