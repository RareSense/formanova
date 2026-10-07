import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  ERASER_SCALE,
  MARK_COLOUR,
  MARK_OPACITY,
  isMeaningfulMark,
  markBounds,
  markHandles,
  moveMark,
  paintMarks,
  resizeMark,
  topMarkAt,
  visibleMarkIndexes,
  type Mark,
  type MarkHandle,
  type MarkPoint,
} from "@/lib/design-markup";

export type MarkupTool = "select" | "brush" | "box" | "arrow" | "erase";

interface MarkupCanvasProps {
  /** Renderable picture URL (blob:, data: or a public URL). */
  src: string | null;
  alt: string;
  marks: Mark[];
  /** A finished edit of the marks (draw, move, resize, delete): the parent records it for undo. */
  onCommit: (next: Mark[]) => void;
  tool: MarkupTool;
  /** Brush width, percent of the picture width. */
  brush: number;
  /** Colour for new marks. */
  colour?: string;
  selected: number | null;
  onSelect: (index: number | null) => void;
  disabled?: boolean;
  /** Shown over the picture while it is being remade (blur + spinner). */
  overlay?: React.ReactNode;
  /** Shown over the picture when there are no marks yet. */
  hint?: React.ReactNode;
}

type Drag =
  | { kind: "draw"; mark: Mark }
  | { kind: "move"; index: number; start: MarkPoint; base: Mark[] }
  | { kind: "resize"; index: number; handle: MarkHandle; base: Mark[] };

/**
 * The design picture with its marks. Marks are painted on a canvas in order,
 * so the eraser cuts through anything drawn before it; selection, handles and
 * the numbered badges are plain elements on top so they stay crisp and
 * clickable. Pointer events cover mouse, pen and touch alike.
 */
export default function MarkupCanvas({ src, alt, marks, onCommit, tool, brush, colour = MARK_COLOUR, selected, onSelect, disabled, overlay, hint }: MarkupCanvasProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [live, setLive] = useState<Mark[] | null>(null);
  const [hover, setHover] = useState<MarkPoint | null>(null);
  const [width, setWidth] = useState(0);
  // The drawing area is sized to the picture's own proportions, so a mark at
  // x% of the frame is x% of the picture, both on screen and when flattened.
  const outerRef = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(1);
  const [frame, setFrame] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const fit = () => {
      const W = outer.clientWidth, H = outer.clientHeight;
      if (!W || !H) return;
      setFrame(W / H > aspect ? { w: H * aspect, h: H } : { w: W, h: W / aspect });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(outer);
    return () => observer.disconnect();
  }, [aspect]);

  const shown = live ?? marks;

  // Repaint on any change and on resize, at device resolution.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const paint = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      const drawing = dragRef.current?.kind === "draw" ? [dragRef.current.mark] : [];
      paintMarks(ctx, [...shown, ...drawing], w, h, 3 * dpr);
      setWidth(rect.width);
    };
    paint();
    const observer = new ResizeObserver(paint);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [shown, live]);

  const pointAt = (e: React.PointerEvent): MarkPoint => {
    const rect = layerRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)),
    };
  };
  const capture = (e: React.PointerEvent) => {
    try { layerRef.current?.setPointerCapture(e.pointerId); } catch { /* not every pointer can be captured */ }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled || e.button > 0) return;
    capture(e);
    const p = pointAt(e);
    if (tool === "select") {
      const hit = topMarkAt(marks, p);
      onSelect(hit);
      if (hit !== null) dragRef.current = { kind: "move", index: hit, start: p, base: marks };
      return;
    }
    onSelect(null);
    const kind = tool === "erase" ? "erase" : tool;
    dragRef.current = {
      kind: "draw",
      mark: { kind, points: kind === "brush" || kind === "erase" ? [p] : [p, p], width: kind === "erase" ? brush * ERASER_SCALE : brush, ...(kind === "erase" ? {} : { colour }) },
    };
    setLive([...marks]);
  };

  const startResize = (e: React.PointerEvent, handle: MarkHandle) => {
    e.stopPropagation();
    if (disabled || selected === null) return;
    capture(e);
    dragRef.current = { kind: "resize", index: selected, handle, base: marks };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointAt(e);
    setHover(p);
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === "draw") {
      const m = drag.mark;
      drag.mark = { ...m, points: m.kind === "brush" || m.kind === "erase" ? [...m.points, p] : [m.points[0], p] };
      setLive([...marks]);
    } else if (drag.kind === "move") {
      const moved = moveMark(drag.base[drag.index], p.x - drag.start.x, p.y - drag.start.y);
      setLive(drag.base.map((m, i) => (i === drag.index ? moved : m)));
    } else {
      const resized = resizeMark(drag.base[drag.index], drag.handle, p);
      setLive(drag.base.map((m, i) => (i === drag.index ? resized : m)));
    }
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.kind === "draw") {
      if (isMeaningfulMark(drag.mark)) onCommit([...marks, drag.mark]);
    } else if (live && JSON.stringify(live) !== JSON.stringify(drag.base)) {
      onCommit(live);
    }
    setLive(null);
  };

  const numbered = visibleMarkIndexes(shown);
  const sel = selected !== null && shown[selected] ? shown[selected] : null;
  const selBox = sel ? markBounds(sel) : null;
  const cursorSize = ((tool === "erase" ? brush * ERASER_SCALE : brush) / 100) * width;
  const cursorClass = disabled ? "" : tool === "brush" || tool === "erase" ? "cursor-none" : tool === "select" ? "cursor-default" : "cursor-crosshair";

  return (
    <div ref={outerRef} className="relative flex h-full w-full items-center justify-center overflow-hidden bg-muted/20">
    <div className="relative" style={{ width: frame.w || "100%", height: frame.h || "100%" }}>
      {src && (
        <img
          src={src}
          alt={alt}
          className="h-full w-full select-none object-fill"
          draggable={false}
          onLoad={(e) => { const i = e.currentTarget; if (i.naturalWidth && i.naturalHeight) setAspect(i.naturalWidth / i.naturalHeight); }}
        />
      )}
      <div
        ref={layerRef}
        className={`absolute inset-0 touch-none ${cursorClass}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setHover(null)}
      >
        <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" style={{ opacity: MARK_OPACITY }} />

        {selBox && (
          <div
            className="pointer-events-none absolute border-2 border-dashed border-foreground"
            style={{ left: `${selBox.x0}%`, top: `${selBox.y0}%`, width: `${selBox.x1 - selBox.x0}%`, height: `${selBox.y1 - selBox.y0}%` }}
          >
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => { onCommit(marks.filter((_, i) => i !== selected)); onSelect(null); }}
              className="pointer-events-auto absolute -top-10 left-0 flex h-8 items-center gap-1.5 border border-border bg-background px-2.5 text-xs shadow-sm hover:bg-muted"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        )}
        {sel && markHandles(sel).map(({ handle, at }) => (
          <span
            key={handle}
            aria-hidden="true"
            onPointerDown={(e) => startResize(e, handle)}
            className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize border-2 border-foreground bg-background"
            style={{ left: `${at.x}%`, top: `${at.y}%` }}
          />
        ))}
        {numbered.map((index, n) => {
          const b = markBounds(shown[index]);
          return (
            <button
              key={index}
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onSelect(index)}
              aria-label={`Mark ${n + 1}`}
              className={`absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-background text-[11px] font-semibold text-background shadow ${selected === index ? "bg-foreground" : ""}`}
              style={{ left: `${b.x0}%`, top: `${b.y0}%`, background: selected === index ? undefined : shown[index].colour ?? MARK_COLOUR }}
            >
              {n + 1}
            </button>
          );
        })}
        {hover && !disabled && (tool === "brush" || tool === "erase") && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
            style={{
              left: `${hover.x}%`, top: `${hover.y}%`, width: cursorSize, height: cursorSize,
              borderColor: tool === "erase" ? "hsl(var(--foreground))" : colour,
              background: tool === "erase" ? "hsl(var(--background) / 0.35)" : `${colour}26`,
            }}
          />
        )}
      </div>
    </div>
      {numbered.length === 0 && !overlay && hint}
      {overlay}
    </div>
  );
}
