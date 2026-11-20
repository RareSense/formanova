import { describe, expect, it } from 'vitest';
import { analyze, canFix, fileSize, runChecks, verdictOf, type Pixels } from './analyze';

/** A w x h photo filled with `bg`, with an optional rectangle "piece" in `fg`. */
function photo(w: number, h: number, bg: number[], piece?: { x: number; y: number; w: number; h: number; fg: number[] }, noise = 0): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const inPiece = piece && x >= piece.x && x < piece.x + piece.w && y >= piece.y && y < piece.y + piece.h;
      const c = inPiece ? piece!.fg : bg;
      const n = noise ? ((x * 31 + y * 17) % (noise * 2)) - noise : 0;
      data[i] = c[0] + n; data[i + 1] = c[1] + n; data[i + 2] = c[2] + n; data[i + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

const GOLD = [200, 160, 60];
const meta = (width: number, height: number, bytes = 400_000) => ({ width, height, bytes, type: 'image/jpeg' });

describe('analyze', () => {
  it('sees a pure white background and measures how much of the frame the piece fills', () => {
    const a = analyze(photo(100, 100, [255, 255, 255], { x: 10, y: 20, w: 80, h: 60, fg: GOLD }));
    expect(a.background.kind).toBe('white');
    expect(a.box).toEqual({ x: 0.1, y: 0.2, w: 0.8, h: 0.6 });
    expect(a.fill).toBeCloseTo(0.8);
  });

  it('tells an off-white backdrop from pure white', () => {
    expect(analyze(photo(100, 100, [240, 238, 235])).background.kind).toBe('near-white');
  });

  it('recognises a plain coloured backdrop and still finds the piece', () => {
    const a = analyze(photo(100, 100, [90, 90, 95], { x: 30, y: 30, w: 40, h: 40, fg: GOLD }));
    expect(a.background.kind).toBe('plain');
    expect(a.fill).toBeCloseTo(0.4);
  });

  it('says it cannot tell on a busy background instead of guessing', () => {
    const a = analyze(photo(100, 100, [120, 110, 100], undefined, 40));
    expect(a.background.kind).toBe('busy');
    expect(a.box).toBeNull();
  });

  it('ignores a few stray specks of dust', () => {
    const p = photo(200, 200, [255, 255, 255], { x: 50, y: 50, w: 100, h: 100, fg: GOLD });
    p.data.set([0, 0, 0, 255], (5 * 200 + 190) * 4); // one dark speck near a corner
    expect(analyze(p).box).toEqual({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
  });
});

describe('runChecks', () => {
  const centred = analyze(photo(100, 100, [255, 255, 255], { x: 5, y: 5, w: 90, h: 90, fg: GOLD }));

  it('passes a large, square, pure white Amazon photo with the piece filling 90%', () => {
    const checks = runChecks(meta(2000, 2000), centred, 'amazon');
    expect(checks.map((c) => c.status)).toEqual(['pass', 'pass', 'pass', 'pass', 'pass']);
    expect(verdictOf(checks)).toBe('good');
  });

  it('flags a small, wide Amazon photo with the piece too far away', () => {
    const far = analyze(photo(100, 100, [255, 255, 255], { x: 35, y: 35, w: 30, h: 30, fg: GOLD }));
    const checks = runChecks(meta(900, 600), far, 'amazon');
    expect(checks.find((c) => c.id === 'size')?.status).toBe('warn');
    expect(checks.find((c) => c.id === 'shape')?.status).toBe('warn');
    expect(checks.find((c) => c.id === 'fill')?.text).toMatch(/fills 30%.*Aim for 85%/);
    expect(verdictOf(checks)).toBe('attention');
  });

  it('fails Amazon on a grey backdrop and does not offer a fix it cannot do', () => {
    const grey = analyze(photo(100, 100, [90, 90, 95], { x: 10, y: 10, w: 80, h: 80, fg: GOLD }));
    expect(runChecks(meta(2000, 2000), grey, 'amazon').find((c) => c.id === 'background')?.status).toBe('fail');
    expect(canFix(grey, 'amazon')).toBe(false);
    expect(canFix(grey, 'etsy')).toBe(true);
  });

  it('applies Etsy rules: both sides 2000 px, landscape first photo, 1 MB upload warning', () => {
    const checks = runChecks(meta(1500, 2000, 3_000_000), centred, 'etsy');
    expect(checks.find((c) => c.id === 'size')?.status).toBe('warn');
    expect(checks.find((c) => c.id === 'shape')?.text).toMatch(/Portrait/);
    expect(checks.find((c) => c.id === 'file')?.status).toBe('warn');
  });

  it('applies Shopify limits: 5000 px and 20 MB', () => {
    const checks = runChecks(meta(6000, 6000, 25 * 1024 * 1024), centred, 'shopify');
    expect(checks.find((c) => c.id === 'size')?.status).toBe('warn');
    expect(checks.find((c) => c.id === 'file')?.status).toBe('fail');
  });

  it('answers "can\'t tell" when the piece cannot be found and nothing else is wrong', () => {
    const busy = analyze(photo(100, 100, [120, 110, 100], undefined, 40));
    const checks = runChecks(meta(2048, 2048), busy, 'shopify');
    expect(checks.find((c) => c.id === 'fill')?.status).toBe('unknown');
    expect(verdictOf(checks)).toBe('attention'); // busy background is itself a warning on Shopify
  });
});

describe('fileSize', () => {
  it('shows KB under 1 MB and MB above', () => {
    expect(fileSize(40_000)).toBe('39 KB');
    expect(fileSize(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});
