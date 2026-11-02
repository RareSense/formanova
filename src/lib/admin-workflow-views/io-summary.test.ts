import { describe, expect, it } from 'vitest';

import { buildRunView } from './index';
import { buildIoSummary, CLICK_ONLY_BYTES, MAX_AUTO_3D, type IoItem } from './io-summary';
import {
  cadImproveRun, catalogShotRun, designImageRun, fastloadRun, FIXTURES, photoshoot4kRun, productShotRun, proxy, syntheticOddRun,
} from './__fixtures__/runs';

const summarize = (name: keyof typeof FIXTURES | string, isCad = false, files = {}) => {
  const detail = FIXTURES[name]();
  return buildIoSummary(buildRunView(detail, isCad), files);
};
const brief = (items: IoItem[]) => items.map((i) => [i.kind, i.format, i.label, i.url]);

describe('buildIoSummary: the pictures and 3D files in and out of a run', () => {
  it('product shot: every input picture once (duplicate urls folded), the generated image out', () => {
    const s = buildIoSummary(buildRunView(productShotRun(), false));
    expect(s.inputs.map((i) => i.url)).toEqual([proxy(1), proxy(2), proxy(3)]);
    expect(s.inputs.every((i) => i.kind === 'image')).toBe(true);
    expect(brief(s.outputs)).toEqual([['image', null, 'Generated image', proxy(4)]]);
  });

  it('photoshoot 4K: model + jewelry in, only the final upscaled picture out', () => {
    const s = buildIoSummary(buildRunView(photoshoot4kRun(), false));
    expect(s.inputs.map((i) => i.url)).toEqual([proxy(10), proxy(11)]);
    expect(s.outputs.map((i) => i.url)).toEqual([proxy(14)]);
  });

  it('design image: the role-labelled pictures in, the design picture out', () => {
    const s = buildIoSummary(buildRunView(designImageRun(), false));
    expect(s.inputs.map((i) => i.label)).toEqual(['Design being edited', 'Design with annotations', 'Inspiration / reference']);
    expect(brief(s.outputs)).toEqual([['image', null, 'Design picture', proxy(23)]]);
  });

  it('catalog shot: render + background in, placed photo and AI picture out', () => {
    const s = buildIoSummary(buildRunView(catalogShotRun(), false));
    expect(s.inputs.map((i) => i.label)).toEqual(['Render', 'Background']);
    expect(s.outputs.map((i) => i.label)).toEqual(['Placed photo', 'AI picture (before paste-back)']);
  });

  it('fastload: the 3DM in (78 MB, click only), the skeleton 3DM out; packed meshes are not 3D previews', () => {
    const s = buildIoSummary(buildRunView(fastloadRun(), true));
    expect(brief(s.inputs)).toEqual([['model3d', '3dm', 'Input .3dm', proxy(30)]]);
    expect(s.inputs[0].preview).toBe('click');
    expect(s.inputs[0].bytes).toBeGreaterThan(CLICK_ONLY_BYTES);
    // skeleton_3dm has no name or extension: the format comes from its mime type.
    expect(brief(s.outputs)).toEqual([['model3d', '3dm', 'Skeleton .3dm', proxy(31)]]);
    expect(s.outputs[0].preview).toBe('auto');
  });

  it('CAD improve: reference picture in; GLB, 3DM, STL and casting STL out; STEP and PDF stay below', () => {
    const s = buildIoSummary(buildRunView(cadImproveRun(), true));
    expect(brief(s.inputs)).toEqual([['image', null, 'Reference images', proxy(60)]]);
    expect(s.outputs.map((i) => [i.format, i.url])).toEqual([
      ['glb', proxy(62)], ['3dm', proxy(61)], ['stl', proxy(63)], ['stl', proxy(65)],
    ]);
  });

  it('WebGL cap: at most MAX_AUTO_3D previews mount on their own, outputs first; the rest wait for a click', () => {
    const s = buildIoSummary(buildRunView(cadImproveRun(), true));
    expect(MAX_AUTO_3D).toBe(2);
    expect(s.outputs.map((i) => i.preview)).toEqual(['auto', 'auto', 'click', 'click']);
    const all = [...s.inputs, ...s.outputs];
    expect(all.filter((i) => i.preview === 'auto').length).toBeLessThanOrEqual(MAX_AUTO_3D);
  });

  it('the cap holds for every fixture', () => {
    for (const name of Object.keys(FIXTURES)) {
      const s = summarize(name, /cad_(generate|improve|nurbs)|fastload/.test(name));
      expect([...s.inputs, ...s.outputs].filter((i) => i.preview === 'auto').length).toBeLessThanOrEqual(MAX_AUTO_3D);
    }
  });

  it('untrusted hosts are listed but never previewed', () => {
    const s = buildIoSummary(buildRunView(syntheticOddRun(), false));
    const model = s.outputs.find((i) => i.kind === 'model3d');
    expect(model).toMatchObject({ url: 'https://cdn.example.com/m/ring.glb', trusted: false, preview: 'none' });
    // The tracking-pixel gif is an input picture, but not trusted.
    expect(s.inputs.find((i) => i.url.includes('tracker.example.com'))?.trusted).toBe(false);
    expect(s.inputs.find((i) => i.url.startsWith('data:image/png'))?.trusted).toBe(true);
  });

  it('result files (/api/result fallback) join the outputs; refused or duplicate ones do not', () => {
    const run = buildRunView(fastloadRun(), true);
    const s = buildIoSummary(run, {
      resultFiles: [
        { label: '3D preview (from the run result)', url: proxy(99), format: 'glb' },
        { label: 'dupe', url: proxy(31), format: '3dm' },
        { label: 'bad', url: 'javascript:alert(1)', format: 'glb' },
        { label: 'none', url: null, format: '3dm' },
      ],
    });
    expect(s.outputs.map((i) => i.url)).toEqual([proxy(31), proxy(99)]);
    expect(s.outputs[1]).toMatchObject({ kind: 'model3d', format: 'glb', preview: 'auto' });
  });

  it('a run with no successful output has no outputs', () => {
    const detail = productShotRun();
    detail.steps = [{ ...detail.steps[0], output: { error: 'boom' } }];
    expect(buildIoSummary(buildRunView(detail, false)).outputs).toEqual([]);
  });
});
