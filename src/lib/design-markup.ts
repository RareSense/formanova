/**
 * design-markup.ts
 *
 * The marks a customer draws on a design picture to show WHERE to change it:
 * free brush, box, arrow, and a free eraser that rubs out any part of them.
 * Pure geometry and rendering, no React. Coordinates are percent of the
 * picture (0-100) so marks survive any display size; widths are percent of the
 * picture width.
 *
 * Marks are sent to design_image_v1 as ONE flattened picture (role "markup"):
 * the design with the marks painted on it. flattenMarkup produces that image.
 */

export type MarkKind = 'brush' | 'box' | 'arrow' | 'erase';

export interface MarkPoint {
  x: number;
  y: number;
}

export interface Mark {
  kind: MarkKind;
  points: MarkPoint[];
  /** Stroke width as a percent of the picture width. */
  width: number;
  /** Paint colour; marks made before colours existed are red. */
  colour?: string;
}

export interface MarkBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Corner handles of a box (top-left, top-right, bottom-left, bottom-right), ends of an arrow. */
export type MarkHandle = 0 | 1 | 2 | 3;

export const MARK_COLOUR = '#e5383b';
/** The colours a customer can mark with: strong, and easy to tell apart on metal and stones. */
export const MARK_COLOURS: { name: string; value: string }[] = [
  { name: 'Red', value: MARK_COLOUR },
  { name: 'Blue', value: '#2563eb' },
  { name: 'Green', value: '#16a34a' },
  { name: 'Yellow', value: '#facc15' },
  { name: 'Black', value: '#111111' },
];
/** Marks are painted semi-transparent so the design stays readable under them. */
export const MARK_OPACITY = 0.6;
export const MIN_BRUSH = 2;
export const MAX_BRUSH = 14;
/** Eraser is a little wider than the brush at the same setting, as in most editors. */
export const ERASER_SCALE = 1.4;

const clampPct = (v: number) => Math.max(0, Math.min(100, v));

/** Marks that count as a numbered area for the customer (erase strokes do not). */
export function visibleMarkIndexes(marks: Mark[]): number[] {
  return marks.flatMap((m, i) => (m.kind === 'erase' ? [] : [i]));
}

export function markBounds(mark: Mark): MarkBounds {
  const xs = mark.points.map((p) => p.x);
  const ys = mark.points.map((p) => p.y);
  const pad = mark.kind === 'brush' || mark.kind === 'erase' ? mark.width / 2 : 1;
  return {
    x0: clampPct(Math.min(...xs) - pad),
    y0: clampPct(Math.min(...ys) - pad),
    x1: clampPct(Math.max(...xs) + pad),
    y1: clampPct(Math.max(...ys) + pad),
  };
}

function distanceToSegment(p: MarkPoint, a: MarkPoint, b: MarkPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** True when a click at `p` lands on this mark. Erase strokes are never selectable. */
export function hitsMark(mark: Mark, p: MarkPoint): boolean {
  if (mark.kind === 'erase') return false;
  if (mark.kind === 'box') {
    const b = markBounds(mark);
    return p.x >= b.x0 - 2 && p.x <= b.x1 + 2 && p.y >= b.y0 - 2 && p.y <= b.y1 + 2;
  }
  const tolerance = mark.kind === 'brush' ? mark.width / 2 + 1.5 : 2.5;
  if (mark.points.length === 1) return Math.hypot(p.x - mark.points[0].x, p.y - mark.points[0].y) < tolerance;
  for (let i = 1; i < mark.points.length; i++) {
    if (distanceToSegment(p, mark.points[i - 1], mark.points[i]) < tolerance) return true;
  }
  return false;
}

/** Index of the topmost mark under `p`, or null. */
export function topMarkAt(marks: Mark[], p: MarkPoint): number | null {
  for (let i = marks.length - 1; i >= 0; i--) if (hitsMark(marks[i], p)) return i;
  return null;
}

/** A drag in progress has to leave a visible mark; a click with Box or Arrow does not. */
export function isMeaningfulMark(mark: Mark): boolean {
  if (mark.kind === 'brush' || mark.kind === 'erase') return mark.points.length > 0;
  const a = mark.points[0];
  const b = mark.points[mark.points.length - 1];
  return Math.hypot(b.x - a.x, b.y - a.y) > 2;
}

/** Moves a mark by (dx, dy), stopping at the picture's edges. */
export function moveMark(mark: Mark, dx: number, dy: number): Mark {
  const b = markBounds(mark);
  const sx = Math.max(-b.x0, Math.min(100 - b.x1, dx));
  const sy = Math.max(-b.y0, Math.min(100 - b.y1, dy));
  return { ...mark, points: mark.points.map((p) => ({ x: p.x + sx, y: p.y + sy })) };
}

/** Handle positions for the selected mark: four corners for a box, two ends for an arrow. */
export function markHandles(mark: Mark): { handle: MarkHandle; at: MarkPoint }[] {
  if (mark.kind === 'arrow') {
    return [
      { handle: 0, at: mark.points[0] },
      { handle: 1, at: mark.points[mark.points.length - 1] },
    ];
  }
  if (mark.kind === 'box') {
    const [a, b] = [mark.points[0], mark.points[mark.points.length - 1]];
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    return [
      { handle: 0, at: { x: x0, y: y0 } },
      { handle: 1, at: { x: x1, y: y0 } },
      { handle: 2, at: { x: x0, y: y1 } },
      { handle: 3, at: { x: x1, y: y1 } },
    ];
  }
  return [];
}

/** Drags one handle to `p`. Brush strokes have no handles and come back unchanged. */
export function resizeMark(mark: Mark, handle: MarkHandle, p: MarkPoint): Mark {
  const to = { x: clampPct(p.x), y: clampPct(p.y) };
  if (mark.kind === 'arrow') {
    const [a, b] = [mark.points[0], mark.points[mark.points.length - 1]];
    return { ...mark, points: handle === 0 ? [to, b] : [a, to] };
  }
  if (mark.kind === 'box') {
    const [a, b] = [mark.points[0], mark.points[mark.points.length - 1]];
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    const left = handle === 0 || handle === 2;
    const top = handle === 0 || handle === 1;
    return {
      ...mark,
      points: [
        { x: left ? to.x : x0, y: top ? to.y : y0 },
        { x: left ? x1 : to.x, y: top ? y1 : to.y },
      ],
    };
  }
  return mark;
}

/**
 * Paints the marks onto a 2D context of size w x h, in order, with erase
 * strokes cutting through everything drawn before them. Draws opaque; the
 * caller applies MARK_OPACITY (CSS on screen, globalAlpha when flattening).
 */
export function paintMarks(ctx: CanvasRenderingContext2D, marks: Mark[], w: number, h: number, minLine = 3): void {
  const X = (p: MarkPoint) => (p.x / 100) * w;
  const Y = (p: MarkPoint) => (p.y / 100) * h;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const mark of marks) {
    ctx.globalCompositeOperation = mark.kind === 'erase' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = mark.colour ?? MARK_COLOUR;
    ctx.fillStyle = mark.colour ?? MARK_COLOUR;
    if (mark.kind === 'brush' || mark.kind === 'erase') {
      ctx.lineWidth = (mark.width / 100) * w;
      ctx.beginPath();
      ctx.moveTo(X(mark.points[0]), Y(mark.points[0]));
      if (mark.points.length === 1) ctx.lineTo(X(mark.points[0]) + 0.1, Y(mark.points[0]));
      for (const p of mark.points.slice(1)) ctx.lineTo(X(p), Y(p));
      ctx.stroke();
      continue;
    }
    const [a, b] = [mark.points[0], mark.points[mark.points.length - 1]];
    ctx.lineWidth = Math.max(minLine, (mark.width / 100) * w * 0.35);
    if (mark.kind === 'box') {
      ctx.strokeRect(X(a), Y(a), X(b) - X(a), Y(b) - Y(a));
    } else {
      const angle = Math.atan2(Y(b) - Y(a), X(b) - X(a));
      const head = ctx.lineWidth * 4;
      ctx.beginPath();
      ctx.moveTo(X(a), Y(a));
      ctx.lineTo(X(b), Y(b));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(X(b), Y(b));
      ctx.lineTo(X(b) - head * Math.cos(angle - 0.5), Y(b) - head * Math.sin(angle - 0.5));
      ctx.lineTo(X(b) - head * Math.cos(angle + 0.5), Y(b) - head * Math.sin(angle + 0.5));
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * The picture sent as role "markup": the design with the marks on it, at the
 * design's own resolution. Marks are drawn on their own layer first so the
 * eraser only removes marks, never the design underneath.
 */
export async function flattenMarkup(design: HTMLImageElement, marks: Mark[]): Promise<Blob> {
  const w = design.naturalWidth || design.width;
  const h = design.naturalHeight || design.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  ctx.drawImage(design, 0, 0, w, h);

  const layer = document.createElement('canvas');
  layer.width = w;
  layer.height = h;
  const layerCtx = layer.getContext('2d');
  if (!layerCtx) throw new Error('Canvas is not available');
  paintMarks(layerCtx, marks, w, h, Math.max(3, w / 300));

  ctx.globalAlpha = MARK_OPACITY;
  ctx.drawImage(layer, 0, 0);
  ctx.globalAlpha = 1;

  return new Promise((resolve, reject) => {
    out.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not save the marked-up picture'))), 'image/png');
  });
}
