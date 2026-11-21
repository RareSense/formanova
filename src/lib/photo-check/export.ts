/** File types the download can be saved as. */
export type ExportFormat = 'jpeg' | 'webp';

export const FORMAT_LABEL: Record<ExportFormat, string> = { jpeg: 'JPG', webp: 'WebP' };

/** Smallest width offered: below this a product photo is no use on any marketplace. */
export const MIN_EXPORT_WIDTH = 200;

/**
 * The size to save at. The width can only go down from the fixed photo (never
 * enlarged, which blurs jewelry) and the height follows the same shape, so the
 * marketplace's square or 4:3 is kept.
 */
export function exportSize(fixedW: number, fixedH: number, requestedW?: number): { width: number; height: number; capped: boolean } {
  const wanted = requestedW && Number.isFinite(requestedW) ? Math.round(requestedW) : fixedW;
  const width = Math.max(Math.min(MIN_EXPORT_WIDTH, fixedW), Math.min(wanted, fixedW));
  return { width, height: Math.round((width * fixedH) / fixedW), capped: wanted > fixedW };
}

/**
 * Saves the fixed photo at the chosen size and type, in the browser. For a
 * marketplace with an upload-size warning (Etsy, 1 MB), steps the quality
 * down until the file fits.
 */
export async function exportPhoto(fixed: Blob, width: number, height: number, format: ExportFormat, softMaxBytes?: number): Promise<Blob> {
  const img = await createImageBitmap(fixed);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);
    const type = format === 'webp' ? 'image/webp' : 'image/jpeg';
    const encode = (q: number) => new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('export failed'))), type, q));
    let quality = 0.9;
    let blob = await encode(quality);
    while (softMaxBytes && blob.size > softMaxBytes && quality > 0.6) {
      quality -= 0.1;
      blob = await encode(quality);
    }
    return blob;
  } finally {
    img.close();
  }
}
