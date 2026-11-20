import type { Analysis, Box, Pixels } from './analyze';
import { MARKET_RULES, type Marketplace } from './rules';

/** Where the original photo is drawn inside the fixed photo, in pixels. */
export interface FixLayout {
  outW: number;
  outH: number;
  drawX: number;
  drawY: number;
  drawW: number;
  drawH: number;
}

/**
 * Frames the piece for the marketplace: the target shape, the piece centred
 * and filling `fixFill` of the frame. Never enlarges the photo beyond its own
 * pixels: when the original is too small, the output is smaller instead (and
 * the size check says so), so no blurry upscaling.
 */
export function computeLayout(srcW: number, srcH: number, box: Box | null, market: Marketplace): FixLayout {
  const { target, fixFill } = MARKET_RULES[market];
  const b = box ?? { x: 0, y: 0, w: 1, h: 1 };
  const bw = Math.max(1, b.w * srcW);
  const bh = Math.max(1, b.h * srcH);
  const wanted = Math.min((fixFill * target.width) / bw, (fixFill * target.height) / bh);
  const scale = Math.min(wanted, 1);
  const shrink = scale / wanted; // 1 unless the original is too small
  const outW = Math.round(target.width * shrink);
  const outH = Math.round(target.height * shrink);
  const cx = (b.x + b.w / 2) * srcW * scale;
  const cy = (b.y + b.h / 2) * srcH * scale;
  return {
    outW,
    outH,
    drawX: Math.round(outW / 2 - cx),
    drawY: Math.round(outH / 2 - cy),
    drawW: Math.round(srcW * scale),
    drawH: Math.round(srcH * scale),
  };
}

/**
 * Turns the off-white backdrop pure white. First it spreads in from the edges
 * through light, nearly grey pixels, stopping at the jewelry's outline. Then
 * it also cleans enclosed gaps (inside a bracelet loop or a ring) that match
 * the backdrop colour, but only gaps large enough to be backdrop: a white-gold
 * highlight is small and a different shade, so the piece is never changed.
 * Edits `px` in place and returns how many pixels it changed.
 */
export function whitenBackdrop(px: Pixels, backdrop?: [number, number, number], minLevel = 215, maxTint = 25): number {
  const { width: w, height: h, data } = px;
  const seen = new Uint8Array(w * h);
  const isLight = (p: number) => {
    const i = p * 4;
    const lo = Math.min(data[i], data[i + 1], data[i + 2]);
    const hi = Math.max(data[i], data[i + 1], data[i + 2]);
    return lo >= minLevel && hi - lo <= maxTint;
  };
  const near = (p: number) => {
    if (!backdrop) return false;
    const i = p * 4;
    return Math.abs(data[i] - backdrop[0]) + Math.abs(data[i + 1] - backdrop[1]) + Math.abs(data[i + 2] - backdrop[2]) <= 18;
  };
  /** Collects the connected region from `starts` whose pixels pass `accept`. */
  const region = (starts: number[], accept: (p: number) => boolean): number[] => {
    const out: number[] = [];
    const stack = starts.filter((p) => !seen[p] && accept(p));
    stack.forEach((p) => { seen[p] = 1; });
    while (stack.length) {
      const p = stack.pop()!;
      out.push(p);
      const x = p % w;
      const next = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p >= w ? p - w : -1, p < w * (h - 1) ? p + w : -1];
      for (const q of next) if (q >= 0 && !seen[q] && accept(q)) { seen[q] = 1; stack.push(q); }
    }
    return out;
  };
  let changed = 0;
  const paint = (pixels: number[]) => {
    for (const p of pixels) {
      const i = p * 4;
      if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) changed++;
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
    }
  };

  const border: number[] = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
  paint(region(border, isLight));

  if (backdrop) {
    const minArea = Math.max(16, Math.round(w * h * 0.002));
    for (let p = 0; p < w * h; p++) {
      if (seen[p] || !near(p)) continue;
      const gap = region([p], near);
      if (gap.length >= minArea) paint(gap);
    }
  }
  return changed;
}

export interface FixedPhoto {
  blob: Blob;
  url: string;
  width: number;
  height: number;
}

const toBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('export failed'))), 'image/jpeg', quality));

/** Builds the fixed photo in the browser: framed, padded, backdrop cleaned where safe, as a JPEG. */
export async function buildFixedPhoto(source: CanvasImageSource, srcW: number, srcH: number, a: Analysis, market: Marketplace): Promise<FixedPhoto> {
  const r = MARKET_RULES[market];
  const layout = computeLayout(srcW, srcH, a.box, market);
  const canvas = document.createElement('canvas');
  canvas.width = layout.outW;
  canvas.height = layout.outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');

  const light = a.background.kind === 'white' || a.background.kind === 'near-white';
  const [br, bg, bb] = a.background.color.map(Math.round);
  ctx.fillStyle = light || r.needsWhiteBackground ? '#ffffff' : `rgb(${br},${bg},${bb})`;
  ctx.fillRect(0, 0, layout.outW, layout.outH);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, layout.drawX, layout.drawY, layout.drawW, layout.drawH);

  if (light) {
    const img = ctx.getImageData(0, 0, layout.outW, layout.outH);
    whitenBackdrop(img, a.background.color);
    ctx.putImageData(img, 0, 0);
  }

  // Etsy uploads may fail above 1 MB: step the quality down until it fits.
  let quality = 0.9;
  let blob = await toBlob(canvas, quality);
  while (r.softMaxFileBytes && blob.size > r.softMaxFileBytes && quality > 0.6) {
    quality -= 0.1;
    blob = await toBlob(canvas, quality);
  }
  return { blob, url: URL.createObjectURL(blob), width: layout.outW, height: layout.outH };
}
