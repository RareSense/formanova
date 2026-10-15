import { Redo2, Trash2, Undo2 } from "lucide-react";
import { MARK_COLOURS, MAX_BRUSH, MIN_BRUSH } from "@/lib/design-markup";
import type { MarkupTool } from "./MarkupCanvas";
import { MARKUP_TOOLS } from "./markup-tools";


interface MarkupToolPanelProps {
  tool: MarkupTool;
  onTool: (t: MarkupTool) => void;
  brush: number;
  onBrush: (w: number) => void;
  colour: string;
  onColour: (c: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  canClear: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  disabled?: boolean;
}

const toolBtn = "flex h-9 w-9 items-center justify-center transition-colors disabled:opacity-40";
const quietBtn = "flex h-8 w-9 items-center justify-center text-foreground transition-colors hover:bg-muted disabled:text-muted-foreground disabled:opacity-30 disabled:hover:bg-transparent";

/**
 * The optional markup tools as a small floating column inside the canvas,
 * like Figma: icons with tooltips, the active one in gold, undo / redo / clear
 * as quiet icons underneath. The brush size appears beside it only while
 * painting or erasing.
 */
export default function MarkupToolPanel({ tool, onTool, brush, onBrush, colour, onColour, canUndo, canRedo, canClear, onUndo, onRedo, onClear, disabled }: MarkupToolPanelProps) {
  const sized = tool === "brush" || tool === "erase";
  const painting = tool === "brush" || tool === "box" || tool === "arrow";
  return (
    <div className="flex items-start gap-2">
      <div role="toolbar" aria-label="Mark what to change" aria-orientation="vertical" className="flex flex-col items-center border border-border/60 bg-background/95 p-1 backdrop-blur">
        {MARKUP_TOOLS.map(({ id, name, hint, key, Icon }) => {
          const active = tool === id;
          return (
            <button
              key={id}
              type="button"
              disabled={disabled}
              onClick={() => onTool(id)}
              aria-pressed={active}
              aria-label={name}
              aria-keyshortcuts={key}
              title={`${name}: ${hint} (${key})`}
              className={`${toolBtn} ${active ? "bg-[hsl(var(--formanova-hero-accent)/0.12)] text-[hsl(var(--formanova-hero-accent))]" : "text-foreground hover:bg-muted"}`}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={1} />
            </button>
          );
        })}
        <span className="my-1 h-px w-6 bg-border" aria-hidden="true" />
        <button type="button" onClick={onUndo} disabled={disabled || !canUndo} title="Undo (Ctrl Z)" aria-label="Undo" className={quietBtn}>
          <Undo2 className="h-4 w-4" strokeWidth={1} />
        </button>
        <button type="button" onClick={onRedo} disabled={disabled || !canRedo} title="Redo (Ctrl Shift Z)" aria-label="Redo" className={quietBtn}>
          <Redo2 className="h-4 w-4" strokeWidth={1} />
        </button>
        <button type="button" onClick={onClear} disabled={disabled || !canClear} title="Clear all marks" aria-label="Clear all marks" className={quietBtn}>
          <Trash2 className="h-4 w-4" strokeWidth={1} />
        </button>
        {/* Colour and size in the same column, so nothing sits on the picture. */}
        {painting && (
          <>
            <span className="my-1 h-px w-6 bg-border" aria-hidden="true" />
            <div role="radiogroup" aria-label="Mark colour" className="flex flex-col items-center gap-1.5 py-1">
              {MARK_COLOURS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={colour === c.value}
                  aria-label={c.name}
                  title={c.name}
                  disabled={disabled}
                  onClick={() => onColour(c.value)}
                  className={`h-4 w-4 rounded-full border border-border transition-transform hover:scale-110 ${colour === c.value ? "ring-1 ring-foreground ring-offset-2 ring-offset-background" : ""}`}
                  style={{ background: c.value }}
                />
              ))}
            </div>
          </>
        )}
        {sized && (
          <label className="flex flex-col items-center gap-1 py-1" title={tool === "erase" ? "Eraser size" : "Brush size"}>
            <input
              type="range"
              min={MIN_BRUSH}
              max={MAX_BRUSH}
              value={brush}
              onChange={(e) => onBrush(Number(e.target.value))}
              aria-label={tool === "erase" ? "Eraser size" : "Brush size"}
              className="h-16 w-1.5 accent-[hsl(var(--formanova-hero-accent))] [direction:rtl] [writing-mode:vertical-lr]"
            />
          </label>
        )}
      </div>

    </div>
  );
}
