import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  CONTACT_LINES, FOOTER_H, LABEL_W, LINE_H, MARGIN, SHEET_FONT, TERM_ROWS, TEXT_GAP,
  cellPosition, containImage, detailRows, gridGeometry, logoBox, paginate, productLines, wrapLines,
  type LineSheet,
} from '@/lib/line-sheet/layout';
import { INK, MUTED, RULE } from '@/lib/line-sheet/pdf-colors';

/** Width of bold 8pt Inter text, as the PDF measures it, from a reused canvas. */
let measureCtx: CanvasRenderingContext2D | null = null;
function measureName(text: string): number {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * 4.4;
  measureCtx.font = `600 8px ${SHEET_FONT}, Helvetica, Arial, sans-serif`;
  return measureCtx.measureText(text).width;
}

/**
 * The line sheet pages exactly as the PDF draws them: the same layout numbers,
 * 1 pt drawn as 1 px, then the whole page scaled to the available width.
 * Text is placed by its baseline, like the PDF.
 */
export function SheetPreview({ sheet }: { sheet: LineSheet }) {
  const g = gridGeometry(sheet.paper, sheet.layout);
  const pages = paginate(sheet);
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.8);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / g.pageW);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [g.pageW]);

  return (
    <div ref={boxRef} className="w-full space-y-6" aria-label="Line sheet preview">
      {pages.map((page, i) => (
        <div
          key={i}
          className="relative overflow-hidden bg-white shadow-sm ring-1 ring-black/10"
          style={{ width: g.pageW * scale, height: g.pageH * scale }}
        >
          <div
            style={{ width: g.pageW, height: g.pageH, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'relative', fontFamily: `${SHEET_FONT}, Helvetica, Arial, sans-serif`, color: INK }}
          >
            <Header sheet={sheet} pageW={g.pageW} />

            {page.kind === 'products' && page.products.length === 0 && (
              <p style={text(MARGIN, g.gridTop + 20, 11, MUTED)}>Your pieces will appear here.</p>
            )}

            {page.kind === 'products' && page.products.map((p, slot) => {
              const { x, y } = cellPosition(slot, g);
              const lines = productLines(p, sheet.currency);
              const box = p.image ? containImage(p.image, g.imageH) : null;
              const ty = y + g.imageH + TEXT_GAP + 8;
              const nameLines = wrapLines(lines.name, g.cellW, measureName, 2);
              const afterName = ty + Math.max(1, nameLines.length) * LINE_H;
              return (
                <div key={p.id}>
                  {p.image && box ? (
                    <img src={p.image.src} alt={p.name || 'Product photo'} style={{ position: 'absolute', left: x + box.dx, top: y + box.dy, width: box.w, height: box.h }} />
                  ) : (
                    <div style={{ position: 'absolute', left: x, top: y, width: g.cellW, height: g.imageH, border: `1px dashed ${RULE}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: MUTED }}>
                      No photo
                    </div>
                  )}
                  {nameLines.map((line, n) => <Line key={n} value={line} x={x} y={ty + n * LINE_H} w={g.cellW} bold />)}
                  {sheet.layout === 'detailed' ? (
                    detailRows(p).map((r, n) => (
                      <div key={r.label}>
                        <Line value={r.label} x={x} y={afterName + n * LINE_H} w={LABEL_W} color={MUTED} />
                        <Line value={r.value} x={x + LABEL_W} y={afterName + n * LINE_H} w={g.cellW - LABEL_W} />
                      </div>
                    ))
                  ) : (
                    <>
                      <Line value={lines.sku} x={x} y={afterName} w={g.cellW} color={MUTED} />
                      <Line value={lines.details} x={x} y={afterName + LINE_H} w={g.cellW} />
                    </>
                  )}
                  <Line value={lines.wholesale} x={x} y={ty + (g.textLines - 2) * LINE_H} w={g.cellW} bold />
                  <Line value={lines.retail} x={x} y={ty + (g.textLines - 1) * LINE_H} w={g.cellW} />
                </div>
              );
            })}

            {page.kind === 'terms' && (
              <>
                <p style={{ ...text(MARGIN, g.gridTop + 8, 13, INK), fontWeight: 600 }}>Order terms</p>
                <dl style={{ position: 'absolute', left: MARGIN, top: g.gridTop + 25, width: g.pageW - 2 * MARGIN, margin: 0, display: 'grid', gridTemplateColumns: '110px 1fr', rowGap: 10, fontSize: 9, lineHeight: '13px' }}>
                  {TERM_ROWS(sheet.terms).map((r) => (
                    <div key={r.label} style={{ display: 'contents' }}>
                      <dt style={{ fontWeight: 600, color: MUTED }}>{r.label}</dt>
                      <dd style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{r.value.trim()}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}

            <Footer sheet={sheet} pageW={g.pageW} pageH={g.pageH} n={i + 1} total={pages.length} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Absolute text whose baseline sits at `y`, as jsPDF places it. */
function text(x: number, y: number, size: number, color: string): CSSProperties {
  // A line box 1.3x the font size, so accents and ascenders are never clipped; the baseline still lands on `y`.
  const lh = size * 1.3;
  return { position: 'absolute', left: x, top: y - size * 0.8 - (lh - size) / 2, margin: 0, fontSize: size, lineHeight: `${lh}px`, color, whiteSpace: 'nowrap' };
}

function Line({ value, x, y, w, bold, color = INK }: { value: string; x: number; y: number; w: number; bold?: boolean; color?: string }) {
  if (!value) return null;
  return <p style={{ ...text(x, y, 8, color), width: w, overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: bold ? 600 : 400 }}>{value}</p>;
}

function Header({ sheet, pageW }: { sheet: LineSheet; pageW: number }) {
  const { brand } = sheet;
  const logo = brand.logo ? logoBox(brand.logo) : null;
  const textX = logo ? MARGIN + logo.w + 12 : MARGIN;
  const leftW = pageW / 2 - textX;
  return (
    <>
      {brand.logo && logo && <img src={brand.logo.src} alt="" style={{ position: 'absolute', left: MARGIN, top: MARGIN, width: logo.w, height: logo.h }} />}
      <p style={{ ...text(textX, MARGIN + 14, 16, INK), width: leftW, overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>{brand.name.trim() || 'Your brand'}</p>
      {brand.collection.trim() && (
        <p style={{ ...text(textX, MARGIN + 30, 10, MUTED), width: leftW, overflow: 'hidden', textOverflow: 'ellipsis' }}>{brand.collection.trim()}</p>
      )}
      {CONTACT_LINES(brand).map((line, i) => (
        <p key={i} style={{ ...text(pageW / 2, MARGIN + 8 + i * LINE_H, 8, MUTED), width: pageW / 2 - MARGIN, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' }}>{line}</p>
      ))}
      <div style={{ position: 'absolute', left: MARGIN, top: MARGIN + 46, width: pageW - 2 * MARGIN, borderTop: `0.5px solid ${RULE}` }} />
    </>
  );
}

function Footer({ sheet, pageW, pageH, n, total }: { sheet: LineSheet; pageW: number; pageH: number; n: number; total: number }) {
  const y = pageH - MARGIN;
  const contact = [sheet.brand.website, sheet.brand.email].map((s) => s.trim()).filter(Boolean).join('  ·  ');
  return (
    <>
      <div style={{ position: 'absolute', left: MARGIN, top: y - FOOTER_H + 12, width: pageW - 2 * MARGIN, borderTop: `0.5px solid ${RULE}` }} />
      {contact && <p style={{ ...text(MARGIN, y, 8, MUTED), width: pageW * 0.6, overflow: 'hidden', textOverflow: 'ellipsis' }}>{contact}</p>}
      <p style={{ ...text(pageW / 2, y, 8, MUTED), width: pageW / 2 - MARGIN, textAlign: 'right' }}>Page {n} of {total}</p>
    </>
  );
}
