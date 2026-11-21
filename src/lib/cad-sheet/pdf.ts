import type { jsPDF as JsPDF } from 'jspdf';
import { embedFonts } from '@/lib/line-sheet/pdf';
import { SHEET_FONT } from '@/lib/line-sheet/layout';
import { INK, MUTED, RULE } from '@/lib/line-sheet/pdf-colors';
import { ENTERED_LABELS, SOURCE_LABEL, readRows, type CadReading, type EnteredFields, type UnitKey } from './model';
import { VIEW_LABEL, type ViewName } from './views';

export type Paper = 'letter' | 'a4';
const PAPER: Record<Paper, [number, number]> = { letter: [612, 792], a4: [595.28, 841.89] };
const M = 40;

function fit(doc: JsPDF, text: string, maxW: number): string {
  if (doc.getTextWidth(text) <= maxW) return text;
  let t = text;
  while (t.length > 1 && doc.getTextWidth(`${t}…`) > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

export interface SheetInput {
  reading: CadReading;
  units: UnitKey | null;
  entered: EnteredFields;
  views: Record<ViewName, string> | null;
  paper: Paper;
  date: string;
}

/**
 * The manufacturing tech sheet as a one-page PDF, made in the browser: piece,
 * reference and revision; front, side and top views; what was read from the
 * CAD file and what the jeweler entered, each line labelled with its source.
 */
export async function buildTechSheetPdf(input: SheetInput): Promise<JsPDF> {
  const { jsPDF } = await import('jspdf');
  const [W, H] = PAPER[input.paper];
  const doc = new jsPDF({ unit: 'pt', format: [W, H], compress: true });
  await embedFonts(doc);
  const { reading, entered } = input;
  const text = (s: string, x: number, y: number, size: number, bold = false, color = INK, opts?: { align?: 'right' }) => {
    doc.setFont(SHEET_FONT, bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(color);
    doc.text(s, x, y, opts);
  };

  // Header
  const name = entered.pieceName.trim() || reading.fileName.replace(/\.[^.]+$/, '');
  doc.setFont(SHEET_FONT, 'bold');
  doc.setFontSize(16);
  text(fit(doc, name, W / 2 - M), M, M + 14, 16, true);
  const refLine = [entered.reference.trim() && `Reference ${entered.reference.trim()}`, entered.revision.trim() && `Revision ${entered.revision.trim()}`].filter(Boolean).join('  ·  ');
  if (refLine) text(refLine, M, M + 31, 10, false, MUTED);
  text('Manufacturing tech sheet', W - M, M + 10, 9, true, INK, { align: 'right' });
  text(input.date, W - M, M + 23, 9, false, MUTED, { align: 'right' });
  doc.setFont(SHEET_FONT, 'normal');
  doc.setFontSize(9);
  text(fit(doc, reading.fileName, W / 2 - M), W - M, M + 36, 9, false, MUTED, { align: 'right' });
  doc.setDrawColor(RULE);
  doc.setLineWidth(0.5);
  doc.line(M, M + 48, W - M, M + 48);

  // Views
  let y = M + 66;
  const gap = 14;
  const cell = (W - 2 * M - 2 * gap) / 3;
  if (input.views) {
    (['front', 'side', 'top'] as ViewName[]).forEach((v, i) => {
      const x = M + i * (cell + gap);
      doc.setDrawColor(RULE);
      doc.rect(x, y, cell, cell);
      doc.addImage(input.views![v], 'PNG', x + 1, y + 1, cell - 2, cell - 2, `view-${v}`, 'FAST');
      text(VIEW_LABEL[v], x, y + cell + 13, 9, false, MUTED);
    });
    y += cell + 34;
  } else {
    doc.setDrawColor(RULE);
    doc.rect(M, y, W - 2 * M, 54);
    text('No views: this Rhino file was saved without display meshes ("Save small").', M + 12, y + 23, 9.5, false, INK);
    text('Sizes below are read from the surfaces themselves. Re-save with "Save small" off to include views.', M + 12, y + 38, 9, false, MUTED);
    y += 74;
  }

  // Two columns: from the file | entered by you
  const colW = (W - 2 * M - 24) / 2;
  const rows = (title: string, x: number, items: { label: string; value: string; source: string }[]) => {
    let ry = y;
    text(title, x, ry, 11, true);
    ry += 18;
    for (const r of items) {
      text(r.label, x, ry, 8.5, true, MUTED);
      text(r.source, x + colW, ry, 7.5, false, MUTED, { align: 'right' });
      doc.setFont(SHEET_FONT, 'normal');
      doc.setFontSize(9.5);
      const lines: string[] = doc.splitTextToSize(r.value || '—', colW);
      text(lines.slice(0, 4).join('\n'), x, ry + 12, 9.5);
      ry += 12 + Math.min(lines.length, 4) * 12 + 8;
    }
    return ry;
  };
  const fromCad = readRows(reading, input.units).map((r) => ({ ...r, source: SOURCE_LABEL[r.source] }));
  const fromYou = ENTERED_LABELS.filter((f) => f.key !== 'notes')
    .map((f) => ({ label: f.label, value: entered[f.key].trim(), source: entered[f.key].trim() ? SOURCE_LABEL.you : 'Not given' }));
  const endA = rows('From the CAD file', M, fromCad);
  const endB = rows('Entered by you', M + colW + 24, fromYou);
  y = Math.max(endA, endB) + 6;

  // Notes
  if (entered.notes.trim()) {
    doc.line(M, y, W - M, y);
    y += 18;
    text('Production notes', M, y, 11, true);
    doc.setFont(SHEET_FONT, 'normal');
    doc.setFontSize(9.5);
    const lines: string[] = doc.splitTextToSize(entered.notes.trim(), W - 2 * M);
    text(lines.slice(0, 10).join('\n'), M, y + 16, 9.5);
  }

  // Footer: what the tags mean
  doc.setDrawColor(RULE);
  doc.line(M, H - M - 20, W - M, H - M - 20);
  text('From CAD: read from the file.  Estimated: assumed, please confirm.  Entered by you: typed in by the maker.', M, H - M, 7.5, false, MUTED);
  return doc;
}
