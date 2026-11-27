/** Shared constants/types for the Bulk Studio workspace UI. */
export type ShootMode = 'model-shot' | 'product-shot';
export type PrecisionDefault = 'single' | 'multi';

export const BULK_JEWELRY_TYPES = [
  { id: 'necklace', label: 'Necklaces' },
  { id: 'earrings', label: 'Earrings' },
  { id: 'rings', label: 'Rings' },
  { id: 'bracelets', label: 'Bracelets' },
  { id: 'watches', label: 'Watches' },
] as const;

export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';

/** dataTransfer type for dragging a piece onto another piece to merge them. */
export const PIECE_DRAG_MIME = 'application/x-formanova-piece';

export function isPieceDrag(e: { dataTransfer: DataTransfer }): boolean {
  return Array.from(e.dataTransfer.types).includes(PIECE_DRAG_MIME);
}
