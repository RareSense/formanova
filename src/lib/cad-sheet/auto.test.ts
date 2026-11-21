import { describe, expect, it } from 'vitest';
import { measureAll } from './auto';
import type { CadReading } from './model';

/** Closed rectangular-section band around Y, Z up, in millimetres. */
function band(r: number, t: number, w: number, segs = 180): Float32Array {
  const out: number[] = [];
  const quad = (p: number[][]) => out.push(...p[0], ...p[1], ...p[2], ...p[0], ...p[2], ...p[3]);
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * 2 * Math.PI, a1 = ((i + 1) / segs) * 2 * Math.PI;
    const pt = (rad: number, a: number, y: number) => [rad * Math.cos(a), y, rad * Math.sin(a)];
    const ri = r, ro = r + t, y0 = -w / 2, y1 = w / 2;
    quad([pt(ro, a0, y0), pt(ro, a1, y0), pt(ro, a1, y1), pt(ro, a0, y1)]);
    quad([pt(ri, a0, y1), pt(ri, a1, y1), pt(ri, a1, y0), pt(ri, a0, y0)]);
    quad([pt(ri, a0, y0), pt(ri, a1, y0), pt(ro, a1, y0), pt(ro, a0, y0)]);
    quad([pt(ro, a0, y1), pt(ro, a1, y1), pt(ri, a1, y1), pt(ri, a0, y1)]);
  }
  return new Float32Array(out);
}

const reading: CadReading = {
  fileName: 'band.3dm', format: '3dm', fileUnits: 'mm', size: [20, 2, 20], upAxis: 'z', parts: 2, layers: ['METAL', 'GEMS'], partsWithoutMesh: 0,
};

describe('measureAll', () => {
  it('measures a US 7 band with a stone: size, band, stones and 14K weight', () => {
    const a = measureAll(reading, band(8.66, 1.5, 2.5), [{ layer: 'GEMS', name: '', sizeMm: [5, 5, 3] }], null, 13.07);
    expect(a.ringSize.value).toBe('US 7 · 17.3 mm inside');
    expect(a.band.value).toMatch(/^2\.\d\d mm wide × 1\.\d\d mm thick$/);
    expect(a.stones.value).toBe('Stones: 1 round, 5.00 mm');
    expect(a.weight.value).toMatch(/^2\.9\d g \(/); // π(10.16² − 8.66²)·2.5 = 221.7 mm³ → 2.90 g
  });

  it('scales an inch STL once the jeweler says inches', () => {
    const inches = band(8.66 / 25.4, 1.5 / 25.4, 2.5 / 25.4);
    const a = measureAll({ ...reading, format: 'stl', fileUnits: null }, inches, [], 'in', 13.07);
    expect(a.ringSize.value).toBe('US 7 · 17.3 mm inside');
  });

  it('prints UK letters and inches when the maker works that way', () => {
    const a = measureAll(reading, band(8.66, 1.5, 2.5), [], null, 13.07, 'uk', 'in');
    expect(a.ringSize.value).toMatch(/^UK N½? · 0\.68\d in inside$/);
    expect(a.band.value).toMatch(/ in wide × .* in thick$/);
  });

  it('does not print a ring size when the units are clearly off', () => {
    const a = measureAll(reading, band(16.5, 2, 4.5), [], null, 13.07);
    expect(a.ringSize.value).toBeNull();
    expect(a.ringSize).toMatchObject({ why: expect.stringContaining('33.0 mm across') });
  });

  it('explains instead of guessing when there are no meshes', () => {
    const a = measureAll({ ...reading, partsWithoutMesh: 3 }, new Float32Array(), [], null, 13.07);
    expect(a.ringSize).toEqual({ value: null, why: 'Not measured: this file has no display meshes. Type it in.' });
    expect(a.weight.value).toBeNull();
  });

  it('refuses a weight when the metal is open', () => {
    const full = band(8.66, 1.5, 2.5);
    const open = full.slice(0, Math.floor(full.length * 0.9 / 9) * 9); // a tenth of the surface missing
    expect(measureAll(reading, open, [], null, 13.07).weight).toEqual({ value: null, why: 'Not measured: the metal is not one closed solid, so its volume would be a guess. Type it in.' });
  });
});
