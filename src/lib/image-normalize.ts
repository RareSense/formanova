/**
 * Image format normalization utility.
 *
 * Supported formats (pass-through): JPEG, PNG, WEBP
 * Unsupported formats (auto-converted to JPEG): AVIF, HEIC/HEIF, BMP, TIFF, etc.
 *
 * HEIC/HEIF files are converted via the heic2any library before canvas decoding.
 * Users are never blocked from uploading — unsupported formats are silently
 * converted to JPEG via an offscreen canvas before use.
 */

import heic2any from 'heic2any';

const SUPPORTED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const HEIC_TYPES = new Set([
  'image/heic',
  'image/heif',
]);

/**
 * Returns true when the file is already in a natively-supported format.
 */
export function isSupportedImageFormat(file: File): boolean {
  return SUPPORTED_TYPES.has(file.type);
}

// Image extensions that browsers sometimes report with an empty or non-image/*
// MIME type (notably .jfif on Windows, which is byte-identical JPEG). Used as a
// fallback gate so these aren't wrongly rejected. normalizeImageFile() converts
// any non-native format to JPEG afterward, so accepting them is safe.
const IMAGE_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'jpe', 'jfif', 'pjpeg', 'pjp',
  'png', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'avif', 'heic', 'heif',
]);

/**
 * True if the file looks like an image — by MIME (image/*) or, when the browser
 * reports an empty/odd MIME (e.g. .jfif), by a known image file extension.
 * Use this for upload validation instead of a raw `file.type` check so valid
 * images aren't rejected on MIME quirks.
 */
export function isLikelyImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  const ext = file.name.split('.').pop()?.toLowerCase();
  return !!ext && IMAGE_EXTENSIONS.has(ext);
}

function isHeicFile(file: File): boolean {
  if (HEIC_TYPES.has(file.type)) return true;
  // Some browsers report HEIC as empty type — check extension
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ext === 'heic' || ext === 'heif';
}

/**
 * Normalise an image file to a supported format.
 *
 * - If the file is already JPG/PNG/WEBP it is returned as-is.
 * - HEIC/HEIF files are converted via heic2any first.
 * - Other unsupported formats are decoded on an offscreen canvas and re-encoded as JPEG.
 *
 * The returned File has the same name (with .jpg extension) and a correct
 * MIME type so downstream code can treat every file identically.
 */
export async function normalizeImageFile(file: File): Promise<File> {
  if (isSupportedImageFormat(file)) return file;

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';

  // HEIC/HEIF: convert to JPEG blob via heic2any, then return as File
  if (isHeicFile(file)) {
    try {
      const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
      const blob = Array.isArray(result) ? result[0] : result;
      return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
    } catch (e) {
      console.warn(`HEIC conversion failed for ${file.name}, attempting canvas fallback`, e);
      // Fall through to canvas decode (will likely fail but keeps flow stable)
    }
  }

  // Generic fallback: decode via Image element → canvas → JPEG
  try {
    const bitmap = await createImageBitmapFromFile(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(bitmap, 0, 0);

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))),
        'image/jpeg',
        0.92,
      );
    });
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
  } catch (e) {
    console.warn(`Image normalization failed for ${file.name}, returning original`, e);
    // Return original file so the UI doesn't crash — preview may show a broken image
    return file;
  }
}

/**
 * Normalize an array of files in parallel.
 */
export async function normalizeImageFiles(files: File[]): Promise<File[]> {
  return Promise.all(files.map(normalizeImageFile));
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

function createImageBitmapFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error(`Failed to decode image: ${file.name}`));
    };
    img.src = URL.createObjectURL(file);
  });
}
