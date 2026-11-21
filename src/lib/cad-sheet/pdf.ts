import type { jsPDF as JsPDF } from 'jspdf';
import { embedFonts } from '@/lib/line-sheet/pdf';
import { SHEET_FONT } from '@/lib/line-sheet/layout';
import { SOURCE_LABEL, layerText, overallSize, formatSize, type CadReading, type EnteredFields, type Source, type UnitKey } from './model';
import { VIEW_HALF, VIEW_LABEL, VIEW_NAMES, type ViewName } from './views';

export type Paper = 'letter' | 'a4';
/** Landscape, like FormaNova's own CAD specification sheets. */
const PAPER: Record<Paper, [number, number]> = { letter: [792, 612], a4: [841.89, 595.28] };
const M = 28;

const INK = '#1a1a1a';
const MUTED = '#6b6b6b';
const LINE = '#4a4a4a';
const RED = '#c0261d';
const DIM = '#3b6fd1';
const HEAD_FILL = '#efefef';

export interface SheetRow {
  label: string;
  value: string;
  source: Source | 'none';
}

export interface SheetInput {
  reading: CadReading;
  units: UnitKey | null;
  entered: EnteredFields;
  /** Rendered views, or the jeweler's own pictures when the file has none. */
  views: Partial<Record<ViewName, string>> | null;
  /** True when the views are the jeweler's pictures: no dimension lines then. */
  ownPictures?: boolean;
  paper: Paper;
  date: string;
  /** Ring size, band, stones and weight as shown on the page, with their sources. */
  measured: SheetRow[];
  /** Stone schedule as centre / side stones / melee rows, when measured and not typed over. */
  stoneRows?: { label: string; value: string }[] | null;
  /** No finger hole was found: ring rows are left off when empty. */
  notRing?: boolean;
  /** Density used for the weight. */
  density?: number | null;
}

/** The embedded font has no Chinese or Japanese: Rhino's default layer name "图层" is "Layer"; the rest is marked. */
const printable = (s: string) => s.replace(/图层\s*/g, 'Layer ').replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu, '(CJK)');

/**
 * The CAD specification sheet in the layout FormaNova's own sheets use, which
 * jewelers already know: landscape; a bordered table of the piece on the left
 * (job, alloy, finish, weight, stones, key measurements); front, side, top and
 * back views with dimension lines on the right; then a review page with the
 * open flags, check items, approval and notes lines. Every value keeps its
 * source (From CAD, Estimated, Entered by you).
 */
export async function buildTechSheetPdf(input: SheetInput): Promise<JsPDF> {
  const { jsPDF } = await import('jspdf');
  const [W, H] = PAPER[input.paper];
  const doc = new jsPDF({ unit: 'pt', format: [W, H], orientation: 'landscape', compress: true });
  await embedFonts(doc);
  const { reading, entered } = input;
  const name = entered.pieceName.trim() || reading.fileName.replace(/\.[^.]+$/, '');
  const size = overallSize(reading, input.units);

  const font = (sz: number, bold = false, color = INK) => {
    doc.setFont(SHEET_FONT, bold ? 'bold' : 'normal');
    doc.setFontSize(sz);
    doc.setTextColor(color);
  };
  const footer = (page: number) => {
    font(6.5, false, MUTED);
    doc.text(printable(`${name}  |  For jeweler review  |  ${input.date}  |  Page ${page}`), M, H - 14);
  };
  const tag = (s: Source | 'none') => (s === 'none' ? 'Not given' : SOURCE_LABEL[s]);
  const you = (v: string) => ({ value: v.trim(), source: (v.trim() ? 'you' : 'none') as Source | 'none' });
  const measured = (label: string) => input.measured.find((m) => m.label === label) ?? { label, value: '', source: 'none' as const };

  /** A bordered two-column table like the workshop sheet; the source sits small under each value. */
  const table = (x: number, y: number, w: number, labelW: number, rows: { label: string; value: string; source?: Source | 'none' }[], head?: [string, string]) => {
    doc.setDrawColor(LINE);
    doc.setLineWidth(0.6);
    if (head) {
      doc.setFillColor(HEAD_FILL);
      doc.rect(x, y, w, 16, 'FD');
      font(7, true);
      doc.text(head[0], x + 6, y + 11);
      if (head[1]) doc.text(head[1], x + labelW + 6, y + 11);
      y += 16;
    }
    for (const r of rows) {
      font(7.8);
      const lines: string[] = doc.splitTextToSize(printable(r.value || '—'), w - labelW - 12);
      const shown = lines.slice(0, 4);
      const h = Math.max(20, 8 + shown.length * 9.5 + (r.source ? 8 : 0));
      doc.rect(x, y, labelW, h);
      doc.rect(x + labelW, y, w - labelW, h);
      font(6.8, true);
      doc.text(doc.splitTextToSize(r.label.toUpperCase(), labelW - 10).slice(0, 2), x + 6, y + 12);
      font(7.8, false, r.value ? INK : MUTED);
      doc.text(shown, x + labelW + 6, y + 12);
      if (r.source) {
        font(5.8, false, MUTED);
        doc.text(tag(r.source), x + labelW + 6, y + 12 + shown.length * 9.5);
      }
      y += h;
    }
    return y;
  };

  // ---------- Page 1 ----------
  font(17, true);
  doc.text('CAD SPECIFICATION SHEET', M, M + 14);
  font(8.5, true, RED);
  doc.text('FOR JEWELER REVIEW - not approved for production', M, M + 28);

  const leftW = (W - 2 * M) * 0.47;
  let y = M + 40;
  const ring = measured('Ring size');
  const band = measured('Band at the back');
  const weight = measured('Metal weight');
  const main: { label: string; value: string; source?: Source | 'none' }[] = [
    { label: 'Job name', ...you(entered.pieceName) },
    { label: 'Reference / revision', value: [entered.reference.trim(), entered.revision.trim() && `Rev ${entered.revision.trim()}`].filter(Boolean).join('  ·  '), source: (entered.reference.trim() ? 'you' : 'none') as Source | 'none' },
    { label: 'Units', source: size.source as Source, value: size.units === 'mm' ? 'Millimeters' : size.units === 'cm' ? 'Centimeters' : size.units === 'in' ? 'Inches' : size.units },
    { label: 'Alloy / karat', ...you(entered.metal) },
    { label: 'Finishing level', ...you(entered.finish) },
    { label: 'Metal weight', value: weight.value, source: weight.source },
    { label: 'Ring size', value: ring.value, source: ring.source },
    { label: 'Back of shank', value: band.value, source: band.source },
    { label: 'Hallmark / stamp', ...you(entered.hallmark) },
    { label: 'Engraving', ...you(entered.engraving) },
    { label: 'Tolerances', ...you(entered.tolerances) },
  ].filter((r) => !(input.notRing && !r.value && ['Ring size', 'Back of shank'].includes(r.label)));
  y = table(M, y, leftW, 112, main) + 10;

  const stones = measured('Stones');
  const stoneRows = input.stoneRows?.length && stones.source === 'estimated'
    ? input.stoneRows.map((r) => ({ ...r, source: 'estimated' as const }))
    : [{ label: 'Stones', value: stones.value, source: stones.source }];
  y = table(M, y, leftW, 112, stoneRows, ['STONES in mm (as modelled)', '']) + 10;

  const keyRows = [
    { label: 'Overall width × depth × height', value: formatSize(size.mm), source: size.source },
    { label: 'Parts / layers', value: [String(reading.parts), reading.layers.length ? layerText(reading.layers) : ''].filter(Boolean).join('  ·  '), source: 'cad' as const },
  ];
  y = table(M, y, leftW, 112, keyRows, ['KEY MEASUREMENTS in mm (from the CAD file)', '']) + 10;

  const people = [entered.designer.trim() && `Designer: ${entered.designer.trim()}`, entered.customer.trim() && `Customer / order: ${entered.customer.trim()}`].filter(Boolean).join('    ');
  if (entered.notes.trim() || people) {
    font(8.5, true);
    doc.text('PRODUCTION NOTES', M, y + 6);
    font(7.5);
    const notes: string[] = doc.splitTextToSize(printable([entered.notes.trim(), people].filter(Boolean).join('\n')), leftW);
    doc.text(notes.slice(0, Math.max(1, Math.floor((H - 30 - y - 14) / 9.5))), M, y + 18);
  }

  // Views: 2 × 2 boxes with dimension lines, like the workshop sheet.
  const rx = M + leftW + 12;
  const rw = W - M - rx;
  const top = M;
  const bw = (rw - 8) / 2;
  const bh = (H - top - 34 - 8) / 2;
  const [wMm, dMm, hMm] = size.mm;
  const big = Math.max(wMm, dMm, hMm) || 1;
  const dims: Record<ViewName, [number, number]> = { front: [wMm, hMm], side: [dMm, hMm], top: [wMm, dMm], back: [wMm, hMm] };
  const viewTitle: Record<ViewName, string> = { front: 'FRONT VIEW', side: 'SIDE VIEW (right)', top: 'TOP VIEW', back: 'BACK VIEW' };
  VIEW_NAMES.forEach((v, i) => {
    const x = rx + (i % 2) * (bw + 8);
    const by = top + Math.floor(i / 2) * (bh + 8);
    doc.setDrawColor(LINE);
    doc.setLineWidth(0.6);
    doc.rect(x, by, bw, bh);
    font(7, true);
    doc.text(input.ownPictures ? `PICTURE ${i + 1}` : viewTitle[v], x + 6, by + 12);
    const img = input.views?.[v];
    if (!img) {
      font(7.5, false, MUTED);
      doc.text(input.views ? '' : 'No view: the file has no display meshes.', x + 6, by + bh / 2);
      return;
    }
    const s = Math.min(bw - 44, bh - 50);
    const ix = x + (bw - s) / 2 - 14;
    const iy = by + 20;
    doc.addImage(img, 'PNG', ix, iy, s, s, `view-${v}`, 'FAST');
    if (input.ownPictures) return;
    // The picture spans 2 × VIEW_HALF × the largest side, centred.
    const scale = s / (2 * VIEW_HALF * big);
    const [hor, ver] = dims[v];
    const cx = ix + s / 2, cy = iy + s / 2;
    doc.setDrawColor(DIM);
    doc.setLineWidth(0.5);
    const yLine = Math.min(by + bh - 14, cy + (ver * scale) / 2 + 12);
    const x0 = cx - (hor * scale) / 2, x1 = cx + (hor * scale) / 2;
    doc.line(x0, yLine, x1, yLine);
    doc.line(x0, yLine - 3, x0, yLine + 3);
    doc.line(x1, yLine - 3, x1, yLine + 3);
    const xLine = Math.min(x + bw - 30, cx + (hor * scale) / 2 + 12);
    const y0 = cy - (ver * scale) / 2, y1 = cy + (ver * scale) / 2;
    doc.line(xLine, y0, xLine, y1);
    doc.line(xLine - 3, y0, xLine + 3, y0);
    doc.line(xLine - 3, y1, xLine + 3, y1);
    font(7, true, DIM);
    doc.text(hor.toFixed(2), cx, yLine + 10, { align: 'center' });
    doc.text(ver.toFixed(2), xLine + 4, (y0 + y1) / 2 + 2.5);
  });
  font(6.5, false, MUTED);
  doc.text(input.ownPictures ? 'Pictures added by the jeweler.' : 'Views of the CAD model. Dimensions are of the whole piece, mm.', rx, H - 24);
  footer(1);

  // ---------- Page 2: review ----------
  doc.addPage([W, H], 'landscape');
  const flags: [string, string][] = [];
  if (!reading.fileUnits) flags.push([`${reading.format.toUpperCase()} files do not store units; ${input.units ? 'they were chosen by hand' : 'millimeters were assumed'}.`, 'Confirm the units against a known size before casting.']);
  if (!input.views) flags.push(['The file has no display meshes ("Save small"), so there are no views.', 'Re-save in Rhino with Save small off, or check the piece in Rhino.']);
  if (ring.source === 'estimated') flags.push([`Ring size measured from the model: ${ring.value}.`, 'Confirm the finger size with the customer before sizing.']);
  if (stones.source === 'estimated') flags.push(['Stone sizes are measured from the modelled stones.', 'Measure the actual stones before setting.']);
  if (!weight.value) flags.push(['Metal weight was not measured: the metal is not one closed solid, or no metal was chosen.', 'Ask the caster for a weight from the casting model.']);
  if (!stones.value) flags.push(['No stones were found on a stone layer and none were typed in.', 'List the stones, or confirm the piece has none.']);

  font(17, true, RED);
  doc.text(`REVIEW REQUIRED - ${flags.length} open flag${flags.length === 1 ? '' : 's'}`, M, M + 14);
  font(7.5, false, MUTED);
  doc.text('Each flag: what was found, and what the jeweler or manufacturer needs to check.', M, M + 28);
  y = M + 40;
  const cw = [22, (W - 2 * M - 22) * 0.5, (W - 2 * M - 22) * 0.5];
  doc.setFillColor(HEAD_FILL);
  doc.setDrawColor(LINE);
  doc.rect(M, y, W - 2 * M, 16, 'FD');
  font(7, true);
  doc.text('#', M + 6, y + 11);
  doc.text('What was found', M + cw[0] + 6, y + 11);
  doc.text('What to check', M + cw[0] + cw[1] + 6, y + 11);
  y += 16;
  flags.forEach(([found, check], i) => {
    font(7.5);
    const a: string[] = doc.splitTextToSize(printable(found), cw[1] - 12);
    const b: string[] = doc.splitTextToSize(check, cw[2] - 12);
    const h = 8 + Math.max(a.length, b.length) * 9.5;
    doc.rect(M, y, W - 2 * M, h);
    doc.line(M + cw[0], y, M + cw[0], y + h);
    doc.line(M + cw[0] + cw[1], y, M + cw[0] + cw[1], y + h);
    doc.text(String(i + 1), M + 6, y + 11);
    doc.text(a, M + cw[0] + 6, y + 11);
    doc.text(b, M + cw[0] + cw[1] + 6, y + 11);
    y += h;
  });

  y += 18;
  font(9, true);
  doc.text('CHECK ITEMS', M, y);
  font(7.5);
  const checks = [
    'Every value is marked From CAD (read from the file), Estimated (measured from the model, please confirm) or Entered by you.',
    'Shrinkage: all dimensions are as modelled, before mould and casting shrinkage. No shrinkage allowance has been applied; plan it with your caster.',
    entered.tolerances.trim() ? `Tolerances: ${entered.tolerances.trim()}.` : 'No tolerances were specified for this design.',
    'Production approval: not approved. This sheet is for jeweler review until a person signs it off.',
  ];
  checks.forEach((c, i) => doc.text(printable(`- ${c}`), M + 6, y + 13 + i * 11));
  y += 13 + checks.length * 11 + 14;

  font(9, true);
  doc.text('APPROVAL', M, y);
  font(8);
  doc.text('Reviewed by: ______________________     Date: ____________     Approved for production:  [ ] yes   [ ] no', M + 6, y + 16);
  y += 40;
  font(9, true);
  doc.text('REVIEWER NOTES', M, y);
  doc.setDrawColor('#bdbdbd');
  doc.setLineWidth(0.5);
  for (let ly = y + 22; ly < H - 34; ly += 19) doc.line(M + 6, ly, W - M, ly);
  footer(2);
  return doc;
}
