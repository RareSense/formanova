import type { jsPDF as JsPDF } from 'jspdf';
import {
  CONTACT_LINES, FOOTER_H, LINE_H, MARGIN, SHEET_FONT, TERM_ROWS, TEXT_GAP,
  cellPosition, containImage, gridGeometry, logoBox, paginate, productLines, wrapLines,
  type LineSheet,
} from './layout';
import { INK, MUTED, RULE } from './pdf-colors';
import interRegularUrl from '@/assets/fonts/line-sheet/Inter-Regular.ttf?url';
import interSemiBoldUrl from '@/assets/fonts/line-sheet/Inter-SemiBold.ttf?url';

/** Base64 of a font file, for jsPDF's virtual file system. */
async function fontBase64(url: string): Promise<string> {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * Embeds Inter (regular and semibold, trimmed to Latin, punctuation and every
 * currency sign) so text like "₹1,200" or "Étoile" prints exactly. The
 * built-in PDF fonts cannot draw ₹ and many other characters.
 */
async function embedFonts(doc: JsPDF) {
  const [regular, semibold] = await Promise.all([fontBase64(interRegularUrl), fontBase64(interSemiBoldUrl)]);
  doc.addFileToVFS('Inter-Regular.ttf', regular);
  doc.addFont('Inter-Regular.ttf', SHEET_FONT, 'normal');
  doc.addFileToVFS('Inter-SemiBold.ttf', semibold);
  doc.addFont('Inter-SemiBold.ttf', SHEET_FONT, 'bold');
}

/** Shortens text with an ellipsis until it fits `maxW` at the current font. */
function fit(doc: JsPDF, text: string, maxW: number): string {
  if (doc.getTextWidth(text) <= maxW) return text;
  let t = text;
  while (t.length > 1 && doc.getTextWidth(`${t}…`) > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function drawHeader(doc: JsPDF, sheet: LineSheet, pageW: number) {
  const { brand } = sheet;
  let textX = MARGIN;
  if (brand.logo) {
    const { w, h } = logoBox(brand.logo);
    doc.addImage(brand.logo.src, 'JPEG', MARGIN, MARGIN, w, h);
    textX = MARGIN + w + 12;
  }
  const leftW = pageW / 2 - textX;
  doc.setTextColor(INK);
  doc.setFont(SHEET_FONT, 'bold');
  doc.setFontSize(16);
  doc.text(fit(doc, brand.name.trim() || 'Your brand', leftW), textX, MARGIN + 14);
  if (brand.collection.trim()) {
    doc.setFont(SHEET_FONT, 'normal');
    doc.setFontSize(10);
    doc.setTextColor(MUTED);
    doc.text(fit(doc, brand.collection.trim(), leftW), textX, MARGIN + 30);
  }
  doc.setFont(SHEET_FONT, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(MUTED);
  CONTACT_LINES(brand).forEach((line, i) => {
    doc.text(fit(doc, line, pageW / 2 - MARGIN), pageW - MARGIN, MARGIN + 8 + i * LINE_H, { align: 'right' });
  });
  doc.setDrawColor(RULE);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, MARGIN + 46, pageW - MARGIN, MARGIN + 46);
}

function drawFooter(doc: JsPDF, sheet: LineSheet, pageW: number, pageH: number, n: number, total: number) {
  const y = pageH - MARGIN;
  doc.setDrawColor(RULE);
  doc.line(MARGIN, y - FOOTER_H + 12, pageW - MARGIN, y - FOOTER_H + 12);
  doc.setFont(SHEET_FONT, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(MUTED);
  const contact = [sheet.brand.website, sheet.brand.email].map((s) => s.trim()).filter(Boolean).join('  ·  ');
  if (contact) doc.text(fit(doc, contact, pageW * 0.6), MARGIN, y);
  doc.text(`Page ${n} of ${total}`, pageW - MARGIN, y, { align: 'right' });
}

/** Builds the line sheet PDF in the browser. jsPDF is loaded only when this runs. */
export async function buildLineSheetPdf(sheet: LineSheet): Promise<JsPDF> {
  const { jsPDF } = await import('jspdf');
  const g = gridGeometry(sheet.paper);
  const doc = new jsPDF({ unit: 'pt', format: [g.pageW, g.pageH], compress: true });
  await embedFonts(doc);
  const pages = paginate(sheet);

  pages.forEach((page, index) => {
    if (index > 0) doc.addPage([g.pageW, g.pageH]);
    drawHeader(doc, sheet, g.pageW);

    if (page.kind === 'products') {
      page.products.forEach((p, slot) => {
        const { x, y } = cellPosition(slot, g);
        if (p.image) {
          const box = containImage(p.image, g.imageH);
          doc.addImage(p.image.src, 'JPEG', x + box.dx, y + box.dy, box.w, box.h, p.id, 'FAST');
        }
        const lines = productLines(p, sheet.currency);
        const top = y + g.imageH + TEXT_GAP + 8;
        const put = (text: string, bold: boolean, color: string, ty: number) => {
          if (!text) return;
          doc.setFont(SHEET_FONT, bold ? 'bold' : 'normal');
          doc.setFontSize(8);
          doc.setTextColor(color);
          doc.text(fit(doc, text, g.cellW), x, ty);
        };
        // Name first, up to two lines; SKU and details follow it.
        doc.setFont(SHEET_FONT, 'bold');
        doc.setFontSize(8);
        const nameLines = wrapLines(lines.name, g.cellW, (t) => doc.getTextWidth(t), 2);
        nameLines.forEach((line, i) => put(line, true, INK, top + i * LINE_H));
        const after = top + Math.max(1, nameLines.length) * LINE_H;
        put(lines.sku, false, MUTED, after);
        put(lines.details, false, INK, after + LINE_H);
        // Prices always on the last two lines, so they line up across a row.
        put(lines.wholesale, true, INK, top + 4 * LINE_H);
        put(lines.retail, false, INK, top + 5 * LINE_H);
      });
    } else {
      doc.setFont(SHEET_FONT, 'bold');
      doc.setFontSize(13);
      doc.setTextColor(INK);
      doc.text('Order terms', MARGIN, g.gridTop + 8);
      let ty = g.gridTop + 34;
      const labelW = 110;
      TERM_ROWS(sheet.terms).forEach(({ label, value }) => {
        doc.setFont(SHEET_FONT, 'bold');
        doc.setFontSize(9);
        doc.setTextColor(MUTED);
        doc.text(label, MARGIN, ty);
        doc.setFont(SHEET_FONT, 'normal');
        doc.setTextColor(INK);
        const wrapped: string[] = doc.splitTextToSize(value.trim(), g.pageW - 2 * MARGIN - labelW);
        doc.text(wrapped, MARGIN + labelW, ty);
        ty += Math.max(1, wrapped.length) * 13 + 10;
      });
    }

    drawFooter(doc, sheet, g.pageW, g.pageH, index + 1, pages.length);
  });

  return doc;
}
