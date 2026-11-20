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
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
/** File size the way people read it: KB under 1 MB, MB above. */
export const fileSize = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`);
const mb = fileSize;

/** The checklist for one marketplace, in the order a seller thinks about it. */
export function runChecks(meta: PhotoMeta, a: Analysis, market: Marketplace): Check[] {
  const r = MARKET_RULES[market];
  const { width: w, height: h } = meta;
  const long = Math.max(w, h);
  const checks: Check[] = [];

  // Size
  const sizeText = `${w} × ${h} px`;
  if (long < r.minLongSide) {
    checks.push({ id: 'size', status: 'fail', text: `${sizeText}. Too small for ${r.label}: the longest side needs at least ${r.minLongSide} px.` });
  } else if (r.maxSide && (w > r.maxSide || h > r.maxSide)) {
    checks.push({ id: 'size', status: 'warn', text: `${sizeText}. Larger than ${r.label} accepts (${r.maxSide} px). Fix it will make it smaller.` });
  } else if (r.maxMegapixels && (w * h) / 1e6 > r.maxMegapixels) {
    checks.push({ id: 'size', status: 'warn', text: `${sizeText}. Over ${r.maxMegapixels} megapixels. Fix it will make it smaller.` });
  } else {
    const ok = r.goodSideApplies === 'both' ? Math.min(w, h) >= r.goodSide : long >= r.goodSide;
    const want = r.goodSideApplies === 'both' ? `at least ${r.goodSide} px on each side` : `at least ${r.goodSide} px on the longest side`;
    checks.push(ok
      ? { id: 'size', status: 'pass', text: `${sizeText}. Large enough.` }
      : { id: 'size', status: 'warn', text: `${sizeText}. ${r.label} recommends ${want}${market === 'amazon' ? ' so shoppers can zoom' : ''}.` });
  }

  // Shape
  const ratio = w / h;
  if (r.shape === 'square') {
    checks.push(Math.abs(ratio - 1) < 0.01
      ? { id: 'shape', status: 'pass', text: 'Square.' }
      : { id: 'shape', status: 'warn', text: `Not square. ${r.label} shows product photos best as squares. Fix it will add white space around it.` });
  } else if (r.shape === 'landscape-or-square') {
    checks.push(ratio >= 0.99
      ? { id: 'shape', status: 'pass', text: ratio > 1.01 ? 'Landscape.' : 'Square.' }
      : { id: 'shape', status: 'warn', text: `Portrait. ${r.label} recommends landscape or square for the first photo.` });
  }

  // Background
  const bg = a.background;
  if (r.needsWhiteBackground) {
    if (bg.kind === 'white') checks.push({ id: 'background', status: 'pass', text: 'Pure white background.' });
    else if (bg.kind === 'near-white') checks.push({ id: 'background', status: 'warn', text: 'Background is off-white. Fix it can make it pure white without touching the jewelry.' });
    else if (bg.kind === 'plain') checks.push({ id: 'background', status: 'fail', text: `Background is not white. ${r.label} needs pure white for the main photo. This needs a new background.` });
    else checks.push({ id: 'background', status: 'fail', text: `Busy background. ${r.label} needs pure white for the main photo. This needs a new background.` });
  } else if (bg.kind === 'busy') {
    checks.push({ id: 'background', status: 'warn', text: 'Busy background. A plain background usually sells jewelry better.' });
  } else {
    checks.push({ id: 'background', status: 'pass', text: bg.kind === 'plain' ? 'Plain background.' : 'Clean, light background.' });
  }

  // Fill
  if (a.fill === null) {
    checks.push({ id: 'fill', status: 'unknown', text: "Can't tell where the jewelry is on this background." });
  } else if (r.minFill !== undefined) {
    checks.push(a.fill >= r.minFill
      ? { id: 'fill', status: 'pass', text: `The jewelry fills ${pct(a.fill)} of the frame.` }
      : { id: 'fill', status: 'warn', text: `The jewelry fills ${pct(a.fill)} of the frame. Aim for ${pct(r.minFill)} or more. Fix it will frame it closer.` });
  } else if (a.fill < 0.5) {
    checks.push({ id: 'fill', status: 'warn', text: `The jewelry fills only ${pct(a.fill)} of the frame. Shoppers see more detail when it fills more.` });
  } else {
    checks.push({ id: 'fill', status: 'pass', text: `The jewelry fills ${pct(a.fill)} of the frame.` });
  }

  // File
  if (r.maxFileBytes && meta.bytes > r.maxFileBytes) {
    checks.push({ id: 'file', status: 'fail', text: `${mb(meta.bytes)}. Over the ${mb(r.maxFileBytes)} limit. Fix it will make it smaller.` });
  } else if (r.softMaxFileBytes && meta.bytes > r.softMaxFileBytes) {
    checks.push({ id: 'file', status: 'warn', text: `${mb(meta.bytes)}. Files over ${mb(r.softMaxFileBytes)} may not finish uploading. Fix it will make it smaller.` });
  } else {
    checks.push({ id: 'file', status: 'pass', text: `${mb(meta.bytes)}.` });
  }
  return checks;
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
