import { MARKET_RULES, type Marketplace } from './rules';

/** RGBA pixels, as from canvas getImageData (usually a downscaled copy for speed). */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Facts about the original file, not the downscaled copy. */
export interface PhotoMeta {
  width: number;
  height: number;
  bytes: number;
  type: string;
}

export type BackgroundKind = 'white' | 'near-white' | 'plain' | 'busy';

export interface Background {
  kind: BackgroundKind;
  /** Average colour of the photo's edges. */
  color: [number, number, number];
  /** Share of edge pixels that are white (every channel 250 or more). */
  whiteShare: number;
}

/** The piece's box, as fractions of the frame (0 to 1). */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Analysis {
  background: Background;
  box: Box | null;
  /** How much of the frame the piece fills: the larger of its width and height share. */
  fill: number | null;
}

const WHITE = 250;
const NEAR_WHITE = 225;

/** The pixels in a band around the edge of the photo. */
function edgePixels(px: Pixels): number[][] {
  const band = Math.max(2, Math.round(Math.min(px.width, px.height) * 0.02));
  const out: number[][] = [];
  for (let y = 0; y < px.height; y++) {
    for (let x = 0; x < px.width; x++) {
      if (x >= band && x < px.width - band && y >= band && y < px.height - band) continue;
      const i = (y * px.width + x) * 4;
      out.push([px.data[i], px.data[i + 1], px.data[i + 2]]);
    }
  }
  return out;
}

export function analyzeBackground(px: Pixels): Background {
  const edge = edgePixels(px);
  const n = edge.length || 1;
  let white = 0, near = 0, sr = 0, sg = 0, sb = 0;
  for (const [r, g, b] of edge) {
    const lo = Math.min(r, g, b), hi = Math.max(r, g, b);
    if (lo >= WHITE) white++;
    if (lo >= NEAR_WHITE && hi - lo <= 20) near++;
    sr += r; sg += g; sb += b;
  }
  const color: [number, number, number] = [sr / n, sg / n, sb / n];
  // How much the edge varies: a plain backdrop is even, a room or table is not.
  let spread = 0;
  for (const [r, g, b] of edge) spread += Math.abs(r - color[0]) + Math.abs(g - color[1]) + Math.abs(b - color[2]);
  spread /= n * 3;
  const whiteShare = white / n;
  const kind: BackgroundKind = whiteShare >= 0.95 ? 'white' : near / n >= 0.9 ? 'near-white' : spread < 10 ? 'plain' : 'busy';
  return { kind, color, whiteShare };
}

/** Whether a pixel belongs to the piece rather than the backdrop. */
function isSubject(r: number, g: number, b: number, bg: Background): boolean {
  if (bg.kind === 'white' || bg.kind === 'near-white') {
    // Anything visibly darker or more coloured than the white backdrop.
    return Math.min(r, g, b) < 228 || Math.max(r, g, b) - Math.min(r, g, b) > 24;
  }
  const [cr, cg, cb] = bg.color;
  return Math.abs(r - cr) + Math.abs(g - cg) + Math.abs(b - cb) > 60;
}

/**
 * Finds the piece's box. Rows and columns with only a few stray pixels (dust,
 * noise, a faint shadow) are ignored. Returns null when nothing stands out or
 * when the "piece" fills the whole frame on a busy backdrop (cannot tell).
 */
export function findProduct(px: Pixels, bg: Background): Box | null {
  if (bg.kind === 'busy') return null;
  const rows = new Array(px.height).fill(0);
  const cols = new Array(px.width).fill(0);
  let total = 0;
  for (let y = 0; y < px.height; y++) {
    for (let x = 0; x < px.width; x++) {
      const i = (y * px.width + x) * 4;
      if (isSubject(px.data[i], px.data[i + 1], px.data[i + 2], bg)) {
        rows[y]++; cols[x]++; total++;
      }
    }
  }
  if (total < px.width * px.height * 0.001) return null;
  // Ignore the outermost 0.2% of the piece's pixels on each side: drops lone
  // specks of dust, keeps thin chains (whose rows still hold many pixels overall).
  const skip = Math.max(1, Math.floor(total * 0.002));
  const firstPast = (counts: number[]) => {
    let seen = 0;
    for (let i = 0; i < counts.length; i++) {
      seen += counts[i];
      if (seen > skip) return i;
    }
    return -1;
  };
  const y0 = firstPast(rows);
  const y1 = rows.length - 1 - firstPast([...rows].reverse());
  const x0 = firstPast(cols);
  const x1 = cols.length - 1 - firstPast([...cols].reverse());
  return { x: x0 / px.width, y: y0 / px.height, w: (x1 - x0 + 1) / px.width, h: (y1 - y0 + 1) / px.height };
}

export function analyze(px: Pixels): Analysis {
  const background = analyzeBackground(px);
  const box = findProduct(px, background);
  return { background, box, fill: box ? Math.max(box.w, box.h) : null };
}

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'unknown';

export interface Check {
  id: 'size' | 'shape' | 'background' | 'fill' | 'file';
  status: CheckStatus;
  /** One plain sentence. */
  text: string;
  /** The measured value in a few characters, for the status row ("Off-white", "34%"). */
  value: string;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
/** File size the way people read it: KB under 1 MB, MB above. */
export const fileSize = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`);
const mb = fileSize;

/** The checklist for one marketplace, in the order a seller thinks about it. */
export function runChecks(meta: PhotoMeta, a: Analysis, market: Marketplace): Check[] {
  return addValues(rawChecks(meta, a, market), meta, a);
}

function rawChecks(meta: PhotoMeta, a: Analysis, market: Marketplace): Omit<Check, 'value'>[] {
  const r = MARKET_RULES[market];
  const { width: w, height: h } = meta;
  const long = Math.max(w, h);
  const checks: Omit<Check, 'value'>[] = [];

  // Size
  const px = `${w} × ${h} px`;
  if (long < r.minLongSide) {
    checks.push({ id: 'size', status: 'fail', text: `${px}. Too small: ${r.label} needs ${r.minLongSide} px or more.` });
  } else if (r.maxSide && (w > r.maxSide || h > r.maxSide)) {
    checks.push({ id: 'size', status: 'warn', text: `${px}. Over ${r.maxSide} px. Fix it shrinks it.` });
  } else if (r.maxMegapixels && (w * h) / 1e6 > r.maxMegapixels) {
    checks.push({ id: 'size', status: 'warn', text: `${px}. Over ${r.maxMegapixels} megapixels. Fix it shrinks it.` });
  } else {
    const ok = r.goodSideApplies === 'both' ? Math.min(w, h) >= r.goodSide : long >= r.goodSide;
    const want = market === 'amazon'
      ? `Under ${r.goodSide} px, so shoppers can't zoom.`
      : r.goodSideApplies === 'both' ? `${r.label} wants ${r.goodSide} px on each side.` : `${r.label} recommends ${r.goodSide} px.`;
    checks.push(ok ? { id: 'size', status: 'pass', text: `${px}.` } : { id: 'size', status: 'warn', text: `${px}. ${want}` });
  }

  // Shape
  const ratio = w / h;
  if (r.shape === 'square') {
    checks.push(Math.abs(ratio - 1) < 0.01
      ? { id: 'shape', status: 'pass', text: 'Square.' }
      : { id: 'shape', status: 'warn', text: 'Not square. Fix it adds white space.' });
  } else if (r.shape === 'landscape-or-square') {
    checks.push(ratio >= 0.99
      ? { id: 'shape', status: 'pass', text: ratio > 1.01 ? 'Landscape.' : 'Square.' }
      : { id: 'shape', status: 'warn', text: `Portrait. ${r.label} prefers landscape or square.` });
  }

  // Background
  const bg = a.background;
  if (r.needsWhiteBackground) {
    if (bg.kind === 'white') checks.push({ id: 'background', status: 'pass', text: 'Pure white background.' });
    else if (bg.kind === 'near-white') checks.push({ id: 'background', status: 'warn', text: 'Off-white background. Fix it makes it pure white.' });
    else checks.push({ id: 'background', status: 'fail', text: `${bg.kind === 'busy' ? 'Busy' : 'Colored'} background. ${r.label} needs pure white.` });
  } else if (bg.kind === 'busy') {
    checks.push({ id: 'background', status: 'warn', text: 'Busy background.' });
  } else {
    checks.push({ id: 'background', status: 'pass', text: bg.kind === 'plain' ? 'Plain background.' : 'Light background.' });
  }

  // Fill
  if (a.fill === null) {
    checks.push({ id: 'fill', status: 'unknown', text: "Can't find the jewelry." });
  } else if (r.minFill !== undefined) {
    checks.push(a.fill >= r.minFill
      ? { id: 'fill', status: 'pass', text: `Jewelry fills ${pct(a.fill)}.` }
      : { id: 'fill', status: 'warn', text: `Jewelry fills ${pct(a.fill)}. ${r.label} wants ${pct(r.minFill)}.` });
  } else {
    checks.push(a.fill < 0.5
      ? { id: 'fill', status: 'warn', text: `Jewelry fills only ${pct(a.fill)}.` }
      : { id: 'fill', status: 'pass', text: `Jewelry fills ${pct(a.fill)}.` });
  }

  // File
  if (r.maxFileBytes && meta.bytes > r.maxFileBytes) {
    checks.push({ id: 'file', status: 'fail', text: `${mb(meta.bytes)}. Over the ${mb(r.maxFileBytes)} limit.` });
  } else if (r.softMaxFileBytes && meta.bytes > r.softMaxFileBytes) {
    checks.push({ id: 'file', status: 'warn', text: `${mb(meta.bytes)}. Over ${mb(r.softMaxFileBytes)} may not upload.` });
  } else {
    checks.push({ id: 'file', status: 'pass', text: `${mb(meta.bytes)}.` });
  }
  return checks;
}

const BACKGROUND_VALUE: Record<BackgroundKind, string> = { white: 'Pure white', 'near-white': 'Off-white', plain: 'Colored', busy: 'Busy' };

function addValues(checks: Omit<Check, 'value'>[], meta: PhotoMeta, a: Analysis): Check[] {
  const ratio = meta.width / meta.height;
  const values: Record<Check['id'], string> = {
    size: `${meta.width} × ${meta.height}`,
    shape: Math.abs(ratio - 1) < 0.01 ? 'Square' : ratio > 1 ? 'Landscape' : 'Portrait',
    background: BACKGROUND_VALUE[a.background.kind],
    fill: a.fill === null ? 'Not found' : pct(a.fill),
    file: fileSize(meta.bytes),
  };
  return checks.map((c) => ({ ...c, value: values[c.id] }));
}

export type Verdict = 'good' | 'attention' | 'unknown';

/** One plain answer for the whole photo. */
export function verdictOf(checks: Check[]): Verdict {
  if (checks.some((c) => c.status === 'fail' || c.status === 'warn')) return 'attention';
  if (checks.some((c) => c.status === 'unknown')) return 'unknown';
  return 'good';
}

/** Whether Fix it can help: it never invents a background, so a non-white Amazon backdrop cannot be fixed. */
export function canFix(a: Analysis, market: Marketplace): boolean {
  const notWhite = a.background.kind === 'plain' || a.background.kind === 'busy';
  return !(MARKET_RULES[market].needsWhiteBackground && notWhite);
}
