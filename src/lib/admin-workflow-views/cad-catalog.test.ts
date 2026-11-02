import { describe, expect, it } from 'vitest';

import { catalogShotView, fastloadView } from './cad-catalog';
import { catalogShotRun, catalogWhiteRun, fastloadRun, proxy } from './__fixtures__/runs';

describe('fastloadView', () => {
  it('input: the .3dm with its name, size and a download link', () => {
    const view = fastloadView(fastloadRun());
    expect(view.family).toBe('cad_fastload');
    expect(view.inputs.files).toEqual([{ label: 'Input .3dm', url: proxy(30), name: 'pave-halo-ring.3dm', bytes: 78_123_456 }]);
    expect(view.inputs.images).toEqual([]);
  });

  it('outputs: skeleton and meshes as links, triangles and seconds as values', () => {
    const view = fastloadView(fastloadRun());
    expect(view.outputs.files).toEqual([
      { label: 'Skeleton .3dm', url: proxy(31), name: null, bytes: 1_200_000 },
      { label: 'Meshes', url: proxy(32), name: null, bytes: 40_000_000 },
    ]);
    expect(view.outputs.fields).toEqual([
      { label: 'Triangles', value: '4,750,000' },
      { label: 'Surfaces meshed', value: '3' },
      { label: 'Surfaces not meshed', value: '0' },
      { label: 'Seconds', value: '41.2' },
    ]);
  });

  it('says nothing about outputs when the split failed', () => {
    const run = fastloadRun();
    run.steps[0].output = { error: 'cad_file is not a Rhino .3dm file.' };
    const view = fastloadView(run);
    expect([view.outputs.files, view.outputs.fields]).toEqual([[], []]);
    expect(view.steps[0]).toMatchObject({ failed: true, error: 'cad_file is not a Rhino .3dm file.' });
  });

  it('a file still inline as a data: url is a link without an invented name or size', () => {
    const run = fastloadRun();
    run.input_payload = { payload: { cad_file: 'data:application/octet-stream;base64,M0QgR2VvbWV0cnk=' } };
    expect(fastloadView(run).inputs.files).toEqual([
      { label: 'Input .3dm', url: 'data:application/octet-stream;base64,M0QgR2VvbWV0cnk=', name: null, bytes: null },
    ]);
  });
});

describe('catalogShotView', () => {
  it('photo kind: render + background in, options, the placed photo out', () => {
    const view = catalogShotView(catalogShotRun());
    expect(view.family).toBe('cad_shot');
    expect(view.inputs.images).toEqual([
      { url: proxy(40), label: 'Render' },
      { url: proxy(41), label: 'Background' },
    ]);
    expect(view.inputs.fields).toEqual([
      { label: 'Kind', value: 'photo' },
      { label: 'Materials', value: 'band: Yellow Gold; round x14: Diamond' },
      { label: 'Aspect', value: '4:5' },
      { label: 'Resolution', value: '2K' },
      { label: 'Model', value: 'gemini' },
    ]);
    expect(view.outputs.images).toEqual([
      { url: proxy(42), label: 'Placed photo' },
      { url: proxy(43), label: 'AI picture (before paste-back)' },
    ]);
    expect(view.steps[0].fields).toEqual([
      { label: 'Prompt', value: 'Place the ring on the linen, keep its exact shape and metal.', long: true },
      { label: 'Model', value: 'gemini-3-pro-image-preview' },
      { label: 'Fit', value: 'contain' },
      { label: 'Seconds', value: '38.5' },
    ]);
  });

  it('white kind: each picture by name in and out', () => {
    const view = catalogShotView(catalogWhiteRun());
    expect(view.inputs.images).toEqual([
      { url: proxy(50), label: 'front (front, Yellow Gold)' },
      { url: proxy(51), label: 'side (side)' },
    ]);
    expect(view.inputs.fields).toEqual([
      { label: 'Kind', value: 'white' },
      { label: 'Piece', value: 'Halo ring' },
      { label: 'Category', value: 'ring' },
      { label: 'Resolution', value: '1K' },
    ]);
    expect(view.outputs.images).toEqual([
      { url: proxy(52), label: 'front' },
      { url: proxy(53), label: 'side' },
    ]);
  });
});
