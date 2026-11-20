import type { Pixels } from './analyze';

/** Longest side of the copy the checks run on: plenty to find the piece, fast on a phone. */
export const SAMPLE_SIDE = 600;

/** Draws a photo at a small size and returns its pixels for analysis. Browser only. */
export function samplePixels(source: CanvasImageSource, width: number, height: number, side = SAMPLE_SIDE): Pixels {
  const scale = Math.min(1, side / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is not available');
  // Transparent areas count as white, as they would show on a marketplace.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  return { width: w, height: h, data: img.data };
}
