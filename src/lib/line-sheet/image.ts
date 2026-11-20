import type { SheetImage } from './layout';

/** Longest side kept for a product photo: sharp in print at the cell size, small in memory and in the PDF. */
export const MAX_SIDE = 1200;

/** Larger files risk running a phone out of memory while decoding. */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

/**
 * What the file picker offers. Anything a browser can open (JPG, PNG, WebP,
 * AVIF, GIF, BMP, SVG) plus iPhone HEIC/HEIF, which is converted in the browser.
 */
export const ACCEPTED_IMAGES = 'image/*,.heic,.heif';

export type ImageKind = 'browser' | 'heic' | 'svg' | 'unsupported';

/** Formats browsers cannot open at all: the user is asked to export a JPG. */
const UNSUPPORTED_EXT = /\.(tiff?|psd|ai|eps|raw|cr2|cr3|nef|arw|dng|orf|rw2|raf)$/i;

export function imageKind(file: File): ImageKind {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  if (type === 'image/heic' || type === 'image/heif' || /\.(heic|heif)$/.test(name)) return 'heic';
  if (type === 'image/svg+xml' || name.endsWith('.svg')) return 'svg';
  if (type === 'image/tiff' || UNSUPPORTED_EXT.test(name)) return 'unsupported';
  if (type.startsWith('image/') || /\.(jpe?g|png|webp|avif|gif|bmp)$/.test(name)) return 'browser';
  return 'unsupported';
}

/** A photo that could not be used, with a message the jeweler can act on. */
export type ImageErrorKind = 'unsupported' | 'too_large' | 'unreadable';

export class ImageError extends Error {
  constructor(public readonly fileName: string, message: string, public readonly kind: ImageErrorKind = 'unreadable') {
    super(message);
    this.name = 'ImageError';
  }
}

/** Opens an image with an <img> element: SVG, and a fallback when createImageBitmap refuses a format. */
function loadWithElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
    img.src = url;
  });
}

type Drawable = { source: CanvasImageSource; width: number; height: number; close?: () => void };

async function decode(file: File, kind: ImageKind): Promise<Drawable> {
  if (kind === 'heic') {
    // Loaded only when someone actually adds an iPhone photo.
    const { heicTo } = await import('heic-to');
    const bitmap = await heicTo({ blob: file, type: 'bitmap', options: { imageOrientation: 'from-image' } });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }
  if (kind === 'svg') {
    const img = await loadWithElement(file);
    // An SVG without its own size still needs pixels to draw into.
    const width = img.naturalWidth || 600;
    const height = img.naturalHeight || 600;
    return { source: img, width, height };
  }
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  } catch {
    const img = await loadWithElement(file);
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  }
}

/**
 * Reads a photo in the browser and returns a white-backed JPEG copy, no larger
 * than `maxSide`. Nothing is uploaded. Transparent areas become white, as on a
 * printed sheet; the photo's own orientation is applied. Throws ImageError
 * with a plain message when the file cannot be used.
 */
export async function loadImage(file: File, maxSide = MAX_SIDE): Promise<SheetImage> {
  const kind = imageKind(file);
  if (kind === 'unsupported') {
    throw new ImageError(file.name, 'This file type cannot be opened in a browser. Please export it as JPG or PNG.', 'unsupported');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new ImageError(file.name, 'This photo is larger than 50 MB. Please export a smaller JPG.', 'too_large');
  }

  let drawable: Drawable;
  try {
    drawable = await decode(file, kind);
  } catch {
    throw new ImageError(file.name, 'This photo could not be opened. Please save it again as JPG and add it once more.');
  }

  try {
    if (!drawable.width || !drawable.height) throw new Error('empty image');
    const scale = Math.min(1, maxSide / Math.max(drawable.width, drawable.height));
    const width = Math.max(1, Math.round(drawable.width * scale));
    const height = Math.max(1, Math.round(drawable.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(drawable.source, 0, 0, width, height);
    return { src: canvas.toDataURL('image/jpeg', 0.88), width, height };
  } catch {
    throw new ImageError(file.name, 'This photo could not be opened. Please save it again as JPG and add it once more.');
  } finally {
    drawable.close?.();
  }
}

/** Plain-language note for the files that were skipped, one line per problem. */
export function describeFailures(failures: ImageError[]): string {
  return failures.map((f) => `${f.fileName}: ${f.message}`).join('\n');
}
