import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export interface DoodlePadHandle {
  /** The drawing as a PNG file, or null when nothing has been drawn. */
  toFile: () => Promise<File | null>;
}

/**
 * A plain drawing area for "Draw it": black pen on white, mouse, pen or
 * finger. A rough shape is enough; the design picture is made from it.
 */
const DoodlePad = forwardRef<DoodlePadHandle, { onInkChange: (hasInk: boolean) => void; disabled?: boolean }>(
  function DoodlePad({ onInkChange, disabled }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const inked = useRef(false);

    const clear = () => {
      const c = canvasRef.current;
      const ctx = c?.getContext("2d");
      if (!c || !ctx) return;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#1a1a1a";
      inked.current = false;
      onInkChange(false);
    };
    // Paint the white background once the canvas exists.
    useEffect(clear, []); // eslint-disable-line react-hooks/exhaustive-deps -- runs once on mount; onInkChange identity changes must not wipe the drawing

    useImperativeHandle(ref, () => ({
      toFile: () => new Promise((resolve) => {
        const c = canvasRef.current;
        if (!c || !inked.current) { resolve(null); return; }
        c.toBlob((blob) => resolve(blob ? new File([blob], "drawing.png", { type: "image/png" }) : null), "image/png");
      }),
    }));

    const at = (e: React.PointerEvent) => {
      const c = canvasRef.current!;
      const r = c.getBoundingClientRect();
      return [(e.clientX - r.left) * (c.width / r.width), (e.clientY - r.top) * (c.height / r.height)] as const;
    };

    return (
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={1000}
          height={560}
          aria-label="Drawing area"
          className={`aspect-[25/14] w-full touch-none border border-border bg-white ${disabled ? "opacity-60" : "cursor-crosshair"}`}
          onPointerDown={(e) => {
            if (disabled) return;
            const ctx = canvasRef.current?.getContext("2d");
            if (!ctx) return;
            try { canvasRef.current?.setPointerCapture(e.pointerId); } catch { /* not every pointer can be captured */ }
            drawing.current = true;
            const [x, y] = at(e);
            ctx.beginPath();
            ctx.moveTo(x, y);
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const ctx = canvasRef.current?.getContext("2d");
            if (!ctx) return;
            const [x, y] = at(e);
            ctx.lineTo(x, y);
            ctx.stroke();
            if (!inked.current) { inked.current = true; onInkChange(true); }
          }}
          onPointerUp={() => { drawing.current = false; }}
          onPointerCancel={() => { drawing.current = false; }}
        />
        <button type="button" onClick={clear} disabled={disabled} className="absolute right-2 top-2 border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">
          Clear
        </button>
      </div>
    );
  },
);

export default DoodlePad;
