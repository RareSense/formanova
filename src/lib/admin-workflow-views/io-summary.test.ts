import { describe, expect, it } from 'vitest';

import { buildRunView } from './index';
import { buildIoSummary, LARGE_FILE_BYTES, type IoItem } from './io-summary';
import {
  cadImproveRun, catalogShotRun, designImageRun, fastloadRun, FIXTURES, photoshoot4kRun, productShotRun, proxy, syntheticOddRun,
  syntheticReelRun,
} from './__fixtures__/runs';

const brief = (items: IoItem[]) => items.map((i) => [i.kind, i.format, i.label]);

describe('buildIoSummary: every picture, 3D file and stored file in and out of a run', () => {
  it('product shot: input pictures once each (duplicate urls folded), the generated image out', () => {
    const s = buildIoSummary(buildRunView(productShotRun(), false));
    expect(s.inputs.map((i) => [i.label, i.url])).toEqual([['Jewelry 1', proxy(1)], ['Jewelry 2', proxy(2)], ['Inspiration', proxy(3)]]);
    expect(brief(s.outputs)).toEqual([['image', null, 'Generated image']]);
  });

  it('photoshoot 4K: model first, then jewelry; only the final upscaled picture out', () => {
    const s = buildIoSummary(buildRunView(photoshoot4kRun(), false));
    expect(s.inputs.map((i) => [i.label, i.url])).toEqual([['Model', proxy(10)], ['Jewelry', proxy(11)]]);
    expect(s.outputs.map((i) => [i.label, i.url])).toEqual([['Upscaled image', proxy(14)]]);
  });

  it('design image: the role-labelled pictures in, the design picture out', () => {
    const s = buildIoSummary(buildRunView(designImageRun(), false));
    expect(s.inputs.map((i) => i.label)).toEqual(['Design being edited', 'Design with annotations', 'Inspiration / reference']);
    expect(brief(s.outputs)).toEqual([['image', null, 'Design picture']]);
  });

  it('catalog shot: render + background in, placed photo then AI picture out', () => {
    const s = buildIoSummary(buildRunView(catalogShotRun(), false));
    expect(s.inputs.map((i) => i.label)).toEqual(['Render', 'Background']);
    expect(s.outputs.map((i) => i.label)).toEqual(['Placed photo', 'AI picture (before paste-back)']);
  });

  it('fastload (realistic tool answer): outputs come ONLY from this run’s cad_fastload step, skeleton first, with the stored names', () => {
    const s = buildIoSummary(buildRunView(fastloadRun(), true));
    expect(brief(s.inputs)).toEqual([['model3d', '3dm', 'Input 3DM']]);
    expect(s.inputs[0]).toMatchObject({ large: true, name: 'pave-halo-ring.3dm', url: proxy(30) });
    expect(s.inputs[0].bytes).toBeGreaterThan(LARGE_FILE_BYTES);
    // Each tile's url is the sha256 the step recorded, through the same-origin proxy; the name
    // is the one store() put in the blob path.
    expect(s.outputs.map((i) => [i.kind, i.format, i.label, i.url, i.name])).toEqual([
      ['model3d', '3dm', 'Skeleton 3DM', proxy(31), 'skeleton.3dm'],
      ['file', 'gz', 'Meshes', proxy(32), 'meshes.bin.gz'],
    ]);
    expect(s.outputs[0].large).toBe(false);
  });

  it('CAD improve: reference in; GLB, 3DM, STL, casting, then STEP and the spec sheet out', () => {
    const s = buildIoSummary(buildRunView(cadImproveRun(), true));
    expect(brief(s.inputs)).toEqual([['image', null, 'Reference images']]);
    expect(brief(s.outputs)).toEqual([
      ['model3d', 'glb', 'GLB'], ['model3d', '3dm', '3DM'], ['model3d', 'stl', 'STL'], ['model3d', 'stl', 'Casting body'],
      ['file', 'step', 'STEP'], ['file', 'pdf', 'Spec sheet'],
    ]);
  });

  it('final picture first when a run returns pictures and files (video reel)', () => {
    const s = buildIoSummary(buildRunView(syntheticReelRun(), false));
    expect(brief(s.outputs)).toEqual([['image', null, 'Poster'], ['file', 'mp4', 'Video'], ['file', 'json', 'Captions']]);
    expect(brief(s.inputs)).toEqual([['image', null, 'Still'], ['image', null, 'Still'], ['file', 'zip', 'Brand kit']]);
  });

  it('untrusted hosts are listed but marked untrusted; plain links are not tiles', () => {
    const s = buildIoSummary(buildRunView(syntheticOddRun(), false));
    expect(s.outputs).toEqual([expect.objectContaining({ kind: 'model3d', url: 'https://cdn.example.com/m/ring.glb', trusted: false })]);
    expect(s.inputs.find((i) => i.url.includes('tracker.example.com'))?.trusted).toBe(false);
    expect(s.inputs.find((i) => i.url.startsWith('data:image/png'))?.trusted).toBe(true);
    expect(s.inputs.some((i) => i.url.includes('example.com/docs'))).toBe(false);
  });

  it('result files join the outputs in rank order; refused or duplicate ones do not', () => {
    const s = buildIoSummary(buildRunView(fastloadRun(), true), {
      resultFiles: [
        { label: '3D (from the run result)', url: proxy(99), kind: 'model3d', format: 'glb' },
        { label: 'dupe', url: proxy(31), kind: 'model3d', format: '3dm' },
        { label: 'bad', url: 'javascript:alert(1)', kind: 'model3d', format: 'glb' },
        { label: 'none', url: null, kind: 'model3d', format: '3dm' },
        { label: 'Output image (from complaint)', url: proxy(98), kind: 'image' },
      ],
    });
    expect(s.outputs.map((i) => i.url)).toEqual([proxy(98), proxy(99), proxy(31), proxy(32)]);
  });

  it('every fixture: every tile has a label and a url', () => {
    for (const name of Object.keys(FIXTURES)) {
      const s = buildIoSummary(buildRunView(FIXTURES[name](), /cad_(generate|improve|nurbs)|fastload/.test(name)));
      for (const i of [...s.inputs, ...s.outputs]) expect(i.label && i.url).toBeTruthy();
    }
  });

  it('a run with no successful output has no outputs', () => {
    const detail = productShotRun();
    detail.steps = [{ ...detail.steps[0], output: { error: 'boom' } }];
    expect(buildIoSummary(buildRunView(detail, false)).outputs).toEqual([]);
  });
});
