import { describe, expect, it } from 'vitest';
import { computeLayout, describeFix, whitenBackdrop } from './fix';
import type { Pixels } from './analyze';

describe('computeLayout', () => {
  it('centres the piece in a 2000 px square for Amazon, filling 87% of the frame', () => {
    // Large photo, piece in the left half.
    const l = computeLayout(8000, 6000, { x: 0.1, y: 0.2, w: 0.4, h: 0.5 }, 'amazon'); // piece 3200 x 3000 px
    expect([l.outW, l.outH]).toEqual([2000, 2000]);
    const pieceW = 0.4 * l.drawW, pieceH = 0.5 * l.drawH;
    expect(Math.max(pieceW, pieceH) / 2000).toBeCloseTo(0.87, 2);
    const centreX = l.drawX + (0.1 + 0.2) * l.drawW;
    const centreY = l.drawY + (0.2 + 0.25) * l.drawH;
    expect(centreX).toBeCloseTo(1000, -1);
    expect(centreY).toBeCloseTo(1000, -1);
  });

  it('never enlarges a small photo: the output gets smaller instead', () => {
    const l = computeLayout(600, 600, { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, 'amazon');
    expect(l.drawW).toBe(600); // drawn at its own size
    expect(l.outW).toBeLessThan(2000);
    expect(l.outW).toBe(l.outH);
  });

  it('uses Etsy\'s landscape shape', () => {
    const l = computeLayout(3000, 3000, { x: 0.2, y: 0.2, w: 0.6, h: 0.6 }, 'etsy');
    expect([l.outW, l.outH]).toEqual([2667, 2000]);
  });

  it('frames the whole photo when the piece could not be found', () => {
    const l = computeLayout(2048, 1024, null, 'shopify');
    expect(l.drawW).toBeLessThanOrEqual(2048);
    expect(l.drawX).toBeGreaterThanOrEqual(0);
  });
});

describe('whitenBackdrop', () => {
  /** Off-white 20 x 20 with a gold ring (pixels 5..14) holding a bright white-gold highlight in the middle. */
  function ringPhoto(): Pixels {
    const w = 20, h = 20;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const inRing = x >= 5 && x < 15 && y >= 5 && y < 15;
      const highlight = x >= 9 && x < 11 && y >= 9 && y < 11;
      const c = highlight ? [248, 248, 246] : inRing ? [200, 160, 60] : [236, 234, 230];
      data.set([...c, 255], i);
    }
    return { width: w, height: h, data };
  }

  it('turns the off-white backdrop pure white', () => {
    const p = ringPhoto();
    whitenBackdrop(p);
    expect(Array.from(p.data.slice(0, 3))).toEqual([255, 255, 255]);
  });

  it('never touches the jewelry, not even a white highlight inside it', () => {
    const p = ringPhoto();
    whitenBackdrop(p);
    const at = (x: number, y: number) => Array.from(p.data.slice((y * 20 + x) * 4, (y * 20 + x) * 4 + 3));
    expect(at(6, 6)).toEqual([200, 160, 60]);
    expect(at(9, 9)).toEqual([248, 248, 246]);
  });

  it('leaves a coloured backdrop alone', () => {
    const p: Pixels = { width: 4, height: 4, data: new Uint8ClampedArray(64).fill(120) };
    expect(whitenBackdrop(p)).toBe(0);
  });
});

describe('whitenBackdrop inside the jewelry', () => {
  const BACK = [236, 234, 230];
  /** 40 x 40 off-white with a gold bracelet loop (ring 10..29, 3 px thick) and a tiny white-gold highlight on it. */
  function loop(): Pixels {
    const w = 40, h = 40;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const inOuter = x >= 10 && x < 30 && y >= 10 && y < 30;
      const inInner = x >= 13 && x < 27 && y >= 13 && y < 27;
      const highlight = x === 11 && y === 11;
      const c = highlight ? [250, 250, 248] : inOuter && !inInner ? [200, 160, 60] : BACK;
      data.set([...c, 255], (y * w + x) * 4);
    }
    return { width: w, height: h, data };
  }
  const at = (p: Pixels, x: number, y: number) => Array.from(p.data.slice((y * 40 + x) * 4, (y * 40 + x) * 4 + 3));

  it('cleans the backdrop showing through the middle of a loop', () => {
    const p = loop();
    whitenBackdrop(p, BACK as [number, number, number]);
    expect(at(p, 20, 20)).toEqual([255, 255, 255]);
  });

  it('still never touches the metal or a white highlight on it', () => {
    const p = loop();
    whitenBackdrop(p, BACK as [number, number, number]);
    expect(at(p, 10, 20)).toEqual([200, 160, 60]);
    expect(at(p, 11, 11)).toEqual([250, 250, 248]);
  });

  it('without the backdrop colour, only cleans from the edges', () => {
    const p = loop();
    whitenBackdrop(p);
    expect(at(p, 20, 20)).toEqual(BACK);
  });
});

describe('describeFix', () => {
  const offWhite = { background: { kind: 'near-white' as const, color: [238, 235, 230] as [number, number, number], whiteShare: 0 }, box: { x: 0.2, y: 0.3, w: 0.3, h: 0.4 }, fill: 0.4 };
  it('says in plain words what changed', () => {
    expect(describeFix({ width: 4000, height: 2500, bytes: 1, type: 'image/jpeg' }, offWhite, 'amazon', { width: 2000, height: 2000 }))
      .toEqual(['Made square', 'White background', 'Jewelry fills 87%', '2000 × 2000 px']);
  });
  it('is honest when the original was too small', () => {
    expect(describeFix({ width: 800, height: 600, bytes: 1, type: 'image/jpeg' }, offWhite, 'amazon', { width: 700, height: 700 }))
      .toContain('Kept at 700 × 700: shoot closer for a larger photo');
  });
});
