import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Circle, Eraser, FlipHorizontal2, Minus, Pencil, Redo2, Trash2, Undo2 } from "lucide-react";

export interface DoodlePadHandle {
  /** The drawing as a PNG file, or null when nothing has been drawn. */
  toFile: () => Promise<File | null>;
}

type Tool = "pencil" | "eraser" | "line" | "circle";
type Point = readonly [number, number];
type Stroke = { tool: Tool; size: number; points: Point[]; mirror: boolean };

const W = 1000, H = 560, INK = "#1a1a1a";
const TOOLS: [Tool, string, typeof Pencil, string][] = [
  ["pencil", "Pencil", Pencil, "P"],
  ["eraser", "Eraser", Eraser, "E"],
  ["line", "Line", Minus, "L"],
  ["circle", "Circle (stones)", Circle, "C"],
];

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  const paths = s.mirror ? [s.points, s.points.map(([x, y]) => [W - x, y] as const)] : [s.points];
  ctx.lineWidth = s.size;
  ctx.strokeStyle = s.tool === "eraser" ? "#fff" : INK;
  for (const pts of paths) {
    if (pts.length === 0) continue;
    ctx.beginPath();
    if (s.tool === "circle" && pts.length > 1) {
      const [[x0, y0], [x1, y1]] = [pts[0], pts[pts.length - 1]];
      ctx.arc(x0, y0, Math.hypot(x1 - x0, y1 - y0), 0, Math.PI * 2);
    } else if (s.tool === "line" && pts.length > 1) {
      ctx.moveTo(...pts[0]);
      ctx.lineTo(...pts[pts.length - 1]);
    } else {
      ctx.moveTo(...pts[0]);
      for (const p of pts.slice(1)) ctx.lineTo(...p);
      if (pts.length === 1) ctx.lineTo(pts[0][0] + 0.1, pts[0][1]);
    }
    ctx.stroke();
  }
}

function render(ctx: CanvasRenderingContext2D, strokes: Stroke[]) {
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of strokes) drawStroke(ctx, s);
}

/**
 * "Draw it": a small sketch pad with the basics jewellery designers reach for
 * on a tablet: pencil, eraser, straight line, circle for stones, mirror
 * (symmetry), size, undo/redo and clear. Mouse, pen or finger.
 */
const DoodlePad = forwardRef<DoodlePadHandle, { onInkChange: (hasInk: boolean) => void; disabled?: boolean }>(
  function DoodlePad({ onInkChange, disabled }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [strokes, setStrokes] = useState<Stroke[]>([]);
    const [undone, setUndone] = useState<Stroke[]>([]);
    const [tool, setTool] = useState<Tool>("pencil");
    const [size, setSize] = useState(4);
    const [mirror, setMirror] = useState(false);
    const live = useRef<Stroke | null>(null);

    const paint = useCallback(() => {
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      render(ctx, live.current ? [...strokes, live.current] : strokes);
      if (mirror) {
        ctx.save();
        ctx.setLineDash([6, 8]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(0,0,0,0.15)";
        ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
        ctx.restore();
      }
    }, [strokes, mirror]);
    useEffect(paint, [paint]);

    const inked = strokes.some((s) => s.tool !== "eraser");
    useEffect(() => { onInkChange(inked); }, [inked]); // eslint-disable-line react-hooks/exhaustive-deps -- report changes only

    useImperativeHandle(ref, () => ({
      toFile: () => new Promise((resolve) => {
        if (!inked) { resolve(null); return; }
        // Export without the mirror guide line.
        const out = document.createElement("canvas");
        out.width = W; out.height = H;
        const ctx = out.getContext("2d");
        if (!ctx) { resolve(null); return; }
        render(ctx, strokes);
        out.toBlob((blob) => resolve(blob ? new File([blob], "drawing.png", { type: "image/png" }) : null), "image/png");
      }),
    }), [strokes, inked]);

    const at = (e: React.PointerEvent): Point => {
      const c = canvasRef.current!;
      const r = c.getBoundingClientRect();
      return [(e.clientX - r.left) * (W / r.width), (e.clientY - r.top) * (H / r.height)];
    };

    const undo = () => setStrokes((s) => { if (!s.length) return s; setUndone((u) => [...u, s[s.length - 1]]); return s.slice(0, -1); });
    const redo = () => setUndone((u) => { if (!u.length) return u; setStrokes((s) => [...s, u[u.length - 1]]); return u.slice(0, -1); });
    const clear = () => { setStrokes([]); setUndone([]); };

    // Keyboard: tool letters, M for mirror, Ctrl Z / Ctrl Shift Z.
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if (disabled || (e.target as HTMLElement)?.closest?.("input, textarea")) return;
        const mod = e.ctrlKey || e.metaKey;
        if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
        if (mod) return;
        const t = TOOLS.find(([, , , k]) => k.toLowerCase() === e.key.toLowerCase());
        if (t) setTool(t[0]);
        else if (e.key.toLowerCase() === "m") setMirror((m) => !m);
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [disabled]); // eslint-disable-line react-hooks/exhaustive-deps -- undo/redo use functional updates

    const btn = (on: boolean) => `flex h-9 w-9 items-center justify-center transition-colors disabled:opacity-40 ${on ? "bg-[hsl(var(--formanova-hero-accent)/0.15)] text-foreground" : "text-muted-foreground hover:text-foreground"}`;

    return (
      <div className="flex gap-2">
        <div role="toolbar" aria-label="Drawing tools" aria-orientation="vertical" className="flex flex-col items-center gap-0.5 self-start border border-border/60 bg-background p-1">
          {TOOLS.map(([id, name, Icon, key]) => (
            <button key={id} type="button" aria-label={name} aria-pressed={tool === id} title={`${name} (${key})`} disabled={disabled} onClick={() => setTool(id)} className={btn(tool === id)}>
              <Icon className="h-[18px] w-[18px]" strokeWidth={1} />
            </button>
          ))}
          <button type="button" aria-label="Mirror" aria-pressed={mirror} title="Mirror: draw one half (M)" disabled={disabled} onClick={() => setMirror((m) => !m)} className={btn(mirror)}>
            <FlipHorizontal2 className="h-[18px] w-[18px]" strokeWidth={1} />
          </button>
          <span className="my-1 h-px w-6 bg-border" />
          <button type="button" aria-label="Undo" title="Undo (Ctrl Z)" disabled={disabled || !strokes.length} onClick={undo} className={btn(false)}><Undo2 className="h-4 w-4" strokeWidth={1} /></button>
          <button type="button" aria-label="Redo" title="Redo (Ctrl Shift Z)" disabled={disabled || !undone.length} onClick={redo} className={btn(false)}><Redo2 className="h-4 w-4" strokeWidth={1} /></button>
          <button type="button" aria-label="Clear drawing" title="Clear" disabled={disabled || !strokes.length} onClick={clear} className={btn(false)}><Trash2 className="h-4 w-4" strokeWidth={1} /></button>
          <span className="my-1 h-px w-6 bg-border" />
          <label className="flex flex-col items-center gap-1.5 py-1" title="Size">
            <span aria-hidden="true" className="rounded-full bg-foreground" style={{ width: Math.max(3, size / 2), height: Math.max(3, size / 2) }} />
            <input type="range" min={1} max={24} value={size} disabled={disabled} onChange={(e) => setSize(+e.target.value)} aria-label="Size"
              className="h-16 w-1.5 accent-[hsl(var(--formanova-hero-accent))] [direction:rtl] [writing-mode:vertical-lr]" />
          </label>
        </div>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          aria-label="Drawing area"
          className={`aspect-[25/14] min-w-0 flex-1 touch-none border border-border bg-white ${disabled ? "opacity-60" : "cursor-crosshair"}`}
          onPointerDown={(e) => {
            if (disabled) return;
            try { canvasRef.current?.setPointerCapture(e.pointerId); } catch { /* not every pointer can be captured */ }
            live.current = { tool, size: tool === "eraser" ? size * 3 : size, points: [at(e)], mirror };
            paint();
          }}
          onPointerMove={(e) => {
            const s = live.current;
            if (!s) return;
            const p = at(e);
            s.points = s.tool === "line" || s.tool === "circle" ? [s.points[0], p] : [...s.points, p];
            paint();
          }}
          onPointerUp={() => {
            const s = live.current;
            live.current = null;
            if (!s) return;
            setStrokes((all) => [...all, s]);
            setUndone([]);
          }}
          onPointerCancel={() => { live.current = null; paint(); }}
        />
      </div>
    );
  },
);

export default DoodlePad;
