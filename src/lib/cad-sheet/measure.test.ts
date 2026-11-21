import { describe, expect, it } from 'vitest';
import { euRingSize, formatRingSize, measureRing, meshVolume, usRingSize } from './measure';

/**
 * A closed ring band (rectangular cross-section) around the Y axis: inner
 * radius r, radial thickness t, width w along Y. Z is up. Optional "head"
 * block on top, like a setting.
 */
function band(r: number, t: number, w: number, segs = 120, head = false): number[] {
  const out: number[] = [];
  const quad = (p: number[][]) => out.push(...p[0], ...p[1], ...p[2], ...p[0], ...p[2], ...p[3]);
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * 2 * Math.PI, a1 = ((i + 1) / segs) * 2 * Math.PI;
    const pt = (rad: number, a: number, y: number) => [rad * Math.cos(a), y, rad * Math.sin(a)];
    const ri = r, ro = r + t, y0 = -w / 2, y1 = w / 2;
    quad([pt(ro, a0, y0), pt(ro, a1, y0), pt(ro, a1, y1), pt(ro, a0, y1)]); // outside
    quad([pt(ri, a0, y1), pt(ri, a1, y1), pt(ri, a1, y0), pt(ri, a0, y0)]); // inside
    quad([pt(ri, a0, y0), pt(ri, a1, y0), pt(ro, a1, y0), pt(ro, a0, y0)]); // one side
    quad([pt(ro, a0, y1), pt(ro, a1, y1), pt(ri, a1, y1), pt(ri, a0, y1)]); // other side
  }
  if (head) {
    // A 6 mm cube sitting on top of the band, like a setting.
    const z0 = r + t, s = 3;
    const c = (x: number, y: number, z: number) => [x, y, z];
    const v = [c(-s, -s, z0), c(s, -s, z0), c(s, s, z0), c(-s, s, z0), c(-s, -s, z0 + 6), c(s, -s, z0 + 6), c(s, s, z0 + 6), c(-s, s, z0 + 6)];
    for (const f of [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) quad(f.map((k) => v[k]));
  }
  return out;
}

describe('ring size conversions', () => {
  it('matches the standard tables', () => {
    expect(usRingSize(17.32)).toBe(7);
    expect(usRingSize(16.92)).toBe(6.5);
    expect(euRingSize(17.32)).toBe(54);
    expect(formatRingSize(17.32)).toBe('US 7 · EU 54 · 17.3 mm inside');
  });
});

describe('measureRing', () => {
  it('finds the finger hole, band width and thickness of a plain band', () => {
    const m = measureRing(band(8.66, 1.5, 2.5), 2)!;
    expect(m.axis).toBe(1);
    expect(m.innerDiameterMm).toBeCloseTo(17.32, 0);
    expect(m.bandWidthMm).toBeCloseTo(2.5, 1);
    expect(m.bandThicknessMm).toBeCloseTo(1.5, 0);
  });

  it('measures the back of the shank, not the head, on a ring with a setting', () => {
    const m = measureRing(band(8.66, 1.4, 2.0, 120, true), 2)!;
    expect(m.innerDiameterMm).toBeCloseTo(17.32, 0);
    expect(m.bandWidthMm).toBeCloseTo(2.0, 1); // the 6 mm head is at the top, not measured
    expect(m.bandThicknessMm).toBeCloseTo(1.4, 0);
  });

  it('says there is no ring when there is no hole (an earring stud)', () => {
    const cube: number[] = [];
    const s = 3;
    const v = [[-s, -s, -s], [s, -s, -s], [s, s, -s], [-s, s, -s], [-s, -s, s], [s, -s, s], [s, s, s], [-s, s, s]];
    for (const f of [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) {
      const p = f.map((k) => v[k]);
      for (let k = 0; k < 20; k++) cube.push(...p[0], ...p[1], ...p[2], ...p[0], ...p[2], ...p[3]);
    }
    expect(measureRing(cube, 2)).toBeNull();
  });
});

describe('meshVolume', () => {
  it('measures a closed band and knows it is closed', () => {
    const r = 8.66, t = 1.5, w = 2.5;
    const exact = Math.PI * ((r + t) ** 2 - r ** 2) * w;
    const { mm3, closed } = meshVolume(band(r, t, w, 360));
    expect(mm3 / exact).toBeCloseTo(1, 2);
    expect(closed).toBe(1);
  });

  it('knows when the surface is open (a missing side)', () => {
    const tris = band(8.66, 1.5, 2.5, 60);
    const open = tris.slice(0, tris.length - 18 * 60 / 60 * 1); // drop the last quad's two triangles
    expect(meshVolume(open).closed).toBeLessThan(1);
  });
});

describe('shank on a ring standing on a block', () => {
  it('measures only the shank, not the block under it', async () => {
    const { measureRing } = await import('./measure');
    const out: number[] = [];
    const quad = (p: number[][]) => out.push(...p[0], ...p[1], ...p[2], ...p[0], ...p[2], ...p[3]);
    const segs = 180, r = 8.5, t = 1.5, w = 2.5;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * 2 * Math.PI, a1 = ((i + 1) / segs) * 2 * Math.PI;
      const pt = (rad: number, a: number, y: number) => [rad * Math.cos(a), y, rad * Math.sin(a)];
      quad([pt(r + t, a0, -w / 2), pt(r + t, a1, -w / 2), pt(r + t, a1, w / 2), pt(r + t, a0, w / 2)]);
      quad([pt(r, a0, w / 2), pt(r, a1, w / 2), pt(r, a1, -w / 2), pt(r, a0, -w / 2)]);
      quad([pt(r, a0, -w / 2), pt(r, a1, -w / 2), pt(r + t, a1, -w / 2), pt(r + t, a0, -w / 2)]);
      quad([pt(r + t, a0, w / 2), pt(r + t, a1, w / 2), pt(r, a1, w / 2), pt(r, a0, w / 2)]);
    }
    // A 4 mm block just under the ring, 0.5 mm away.
    const z0 = -(r + t + 0.5), z1 = z0 - 4, x = 3, y = 3;
    quad([[-x, -y, z0], [x, -y, z0], [x, y, z0], [-x, y, z0]]);
    quad([[-x, -y, z1], [-x, y, z1], [x, y, z1], [x, -y, z1]]);
    const m = measureRing(new Float32Array(out), 2)!;
    expect(m.bandThicknessMm).toBeCloseTo(1.5, 1);
    expect(m.bandWidthMm).toBeCloseTo(2.5, 1);
  });
});
