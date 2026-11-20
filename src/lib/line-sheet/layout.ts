/**
 * Jewelry line sheet: data shapes and page layout, shared by the on-screen
 * preview and the PDF export so the two always match. All sizes are in PDF
 * points (1/72 inch); the preview draws 1 pt as 1 CSS px and scales the page.
 *
 * Format follows real jewelry line sheets (owner, 2026-11-21): brand and
 * collection top left, contact top right, a photo-first grid of pieces with
 * SKU, name, details and prices under each photo, website and page number in
 * the footer, and the order terms on a last page.
 */

export interface SheetImage {
  /** JPEG data URL, already downscaled in the browser. */
  src: string;
  width: number;
  height: number;
}

export interface Brand {
  name: string;
  collection: string;
  email: string;
  phone: string;
  website: string;
  logo?: SheetImage;
}

export interface Product {
  id: string;
  image?: SheetImage;
  name: string;
  sku: string;
  metal: string;
  stone: string;
  size: string;
  /** Kept as typed text so the field never fights the user; parsed on output. */
  wholesale: string;
  retail: string;
}

export interface Terms {
  minimumOrder: string;
  payment: string;
  delivery: string;
  notes: string;
}

export type Paper = 'letter' | 'a4';

export interface LineSheet {
  brand: Brand;
  products: Product[];
  terms: Terms;
  paper: Paper;
  currency: string;
}

export const PAPER_SIZE: Record<Paper, { w: number; h: number }> = {
  letter: { w: 612, h: 792 },
  a4: { w: 595.28, h: 841.89 },
};

export const MARGIN = 40;
export const HEADER_H = 64;
export const FOOTER_H = 32;
export const COLS = 4;
export const GAP = 14;
export const TEXT_GAP = 8;
export const LINE_H = 11;
export const TEXT_LINES = 5;

export interface GridGeometry {
  pageW: number;
  pageH: number;
  cellW: number;
  imageH: number;
  cellH: number;
  rows: number;
  perPage: number;
  /** Top of the product grid. */
  gridTop: number;
}

export function gridGeometry(paper: Paper): GridGeometry {
  const { w, h } = PAPER_SIZE[paper];
  const cellW = (w - 2 * MARGIN - (COLS - 1) * GAP) / COLS;
  const imageH = cellW;
  const cellH = imageH + TEXT_GAP + TEXT_LINES * LINE_H;
  const available = h - 2 * MARGIN - HEADER_H - FOOTER_H;
  const rows = Math.max(1, Math.floor((available + GAP) / (cellH + GAP)));
  return { pageW: w, pageH: h, cellW, imageH, cellH, rows, perPage: rows * COLS, gridTop: MARGIN + HEADER_H };
}

/** Top-left corner of the product at `slot` (0-based, within its page). */
export function cellPosition(slot: number, g: GridGeometry): { x: number; y: number } {
  const col = slot % COLS;
  const row = Math.floor(slot / COLS);
  return { x: MARGIN + col * (g.cellW + GAP), y: g.gridTop + row * (g.cellH + GAP) };
}

export function hasTerms(t: Terms): boolean {
  return [t.minimumOrder, t.payment, t.delivery, t.notes].some((v) => v.trim() !== '');
}

export type SheetPage =
  | { kind: 'products'; products: Product[] }
  | { kind: 'terms' };

/** Products split into pages, then a terms page when any term is filled in. */
export function paginate(sheet: LineSheet): SheetPage[] {
  const { perPage } = gridGeometry(sheet.paper);
  const pages: SheetPage[] = [];
  for (let i = 0; i < sheet.products.length; i += perPage) {
    pages.push({ kind: 'products', products: sheet.products.slice(i, i + perPage) });
  }
  if (pages.length === 0) pages.push({ kind: 'products', products: [] });
  if (hasTerms(sheet.terms)) pages.push({ kind: 'terms' });
  return pages;
}

/** "45" or "45.5" → "$45.00"; free text that is not a number is kept as typed. */
export function formatPrice(value: string, currency: string): string {
  const raw = value.trim();
  if (!raw) return '';
  const numeric = raw.replace(/[,\s]/g, '').replace(/^[^\d.-]+/, '');
  const n = Number(numeric);
  if (!/\d/.test(numeric) || !Number.isFinite(n)) return raw;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);
  } catch {
    return raw;
  }
}

/** The five text lines under a product photo, most important first. Empty parts become ''. */
export function productLines(p: Product, currency: string): { name: string; sku: string; details: string; wholesale: string; retail: string } {
  const details = [p.metal, p.stone, p.size].map((s) => s.trim()).filter(Boolean).join(' · ');
  const wholesale = formatPrice(p.wholesale, currency);
  const retail = formatPrice(p.retail, currency);
  return {
    name: p.name.trim(),
    sku: p.sku.trim(),
    details,
    wholesale: wholesale && `Wholesale ${wholesale}`,
    retail: retail && `Retail ${retail}`,
  };
}

/** What is still missing, in plain words, so the editor can point at it. */
export function missingFields(p: Product): string[] {
  const missing: string[] = [];
  if (!p.image) missing.push('Photo');
  if (!p.name.trim()) missing.push('Name');
  if (!p.wholesale.trim() && !p.retail.trim()) missing.push('Price');
  return missing;
}

/**
 * Image box inside a square cell, keeping the photo's shape (never cropped or
 * stretched). Centred across and resting on the bottom, so every photo sits
 * right above its text, as in a printed catalog.
 */
export function containImage(img: SheetImage, box: number): { w: number; h: number; dx: number; dy: number } {
  const scale = Math.min(box / img.width, box / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  return { w, h, dx: (box - w) / 2, dy: box - h };
}

/** The logo fitted inside a 120 x 36 pt box, top left of every page. */
export function logoBox(img: SheetImage): { w: number; h: number } {
  const s = Math.min(120 / img.width, 36 / img.height);
  return { w: img.width * s, h: img.height * s };
}

export const CONTACT_LINES = (b: Brand): string[] =>
  [b.email, b.phone, b.website].map((s) => s.trim()).filter(Boolean);

export const TERM_ROWS = (t: Terms): { label: string; value: string }[] =>
  [
    { label: 'Minimum order', value: t.minimumOrder },
    { label: 'Payment', value: t.payment },
    { label: 'Delivery', value: t.delivery },
    { label: 'Notes', value: t.notes },
  ].filter((r) => r.value.trim() !== '');

export function emptyProduct(id: string, image?: SheetImage): Product {
  return { id, image, name: '', sku: '', metal: '', stone: '', size: '', wholesale: '', retail: '' };
}

export function fileName(brand: Brand): string {
  const base = [brand.name, brand.collection, 'line sheet'].map((s) => s.trim()).filter(Boolean).join(' ');
  return `${base.replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').toLowerCase() || 'line-sheet'}.pdf`;
}
