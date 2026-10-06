import { Redo2, Trash2, Undo2 } from "lucide-react";
import { MAX_BRUSH, MIN_BRUSH } from "@/lib/design-markup";
import type { MarkupTool } from "./MarkupCanvas";
import { MARKUP_TOOLS } from "./markup-tools";


interface MarkupToolPanelProps {
  tool: MarkupTool;
  onTool: (t: MarkupTool) => void;
  brush: number;
  onBrush: (w: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  canClear: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  disabled?: boolean;
}

const kbd = "border border-border px-1.5 py-px font-mono text-[10px] leading-4 text-muted-foreground";
const iconBtn = "flex h-10 flex-1 items-center justify-center gap-1.5 border border-border text-xs text-foreground transition-colors hover:border-foreground/40 disabled:opacity-40 disabled:hover:border-border";

/**
 * "Mark what to change": optional markup tools. A column of labelled tools
 * with their keyboard keys on desktop; a compact row of icons on phones.
 */
export default function MarkupToolPanel({ tool, onTool, brush, onBrush, canUndo, canRedo, canClear, onUndo, onRedo, onClear, disabled }: MarkupToolPanelProps) {
  const sized = tool === "brush" || tool === "erase";
  return (
    <div className="flex flex-col gap-3" role="toolbar" aria-label="Mark what to change">
      <div className="hidden lg:block">
        <h2 className="text-[15px] font-semibold text-foreground">Mark what to change</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Optional.</span> Choose a tool and highlight the part you want to change.
        </p>
      </div>

      <div className="grid grid-cols-5 gap-1.5 lg:grid-cols-1 lg:gap-2">
        {MARKUP_TOOLS.map(({ id, name, hint, key, Icon }) => {
          const active = tool === id;
          return (
            <button
              key={id}
              type="button"
              disabled={disabled}
              onClick={() => onTool(id)}
              aria-pressed={active}
              aria-keyshortcuts={key}
              title={`${name} (${key})`}
              className={`flex flex-col items-center gap-1 border px-1 py-2 text-left transition-colors disabled:opacity-50 lg:flex-row lg:gap-3 lg:px-3 lg:py-2.5 ${
                active
                  ? "border-[hsl(var(--formanova-hero-accent))] bg-[hsl(var(--formanova-hero-accent)/0.08)]"
                  : "border-border bg-background hover:border-foreground/40"
              }`}
            >
              <Icon className="h-5 w-5 flex-shrink-0 text-foreground" />
              <span className="min-w-0 flex-1 text-center lg:text-left">
                <span className="block text-[11px] font-medium text-foreground lg:text-sm">{name}</span>
                <span className="hidden text-xs text-muted-foreground lg:block">{hint}</span>
              </span>
              <span className={`hidden lg:inline ${kbd}`}>{key}</span>
            </button>
          );
        })}
      </div>

      {sized && (
        <label className="flex items-center gap-3 border border-border px-3 py-2">
          <span className="text-xs text-muted-foreground">Size</span>
          <input
            type="range"
            min={MIN_BRUSH}
            max={MAX_BRUSH}
            value={brush}
            onChange={(e) => onBrush(Number(e.target.value))}
            aria-label={tool === "erase" ? "Eraser size" : "Brush size"}
            className="h-1 flex-1 accent-[hsl(var(--formanova-hero-accent))]"
          />
          <span className={`hidden lg:inline ${kbd}`}>[ ]</span>
        </label>
      )}

      <div className="flex gap-1.5">
        <button type="button" onClick={onUndo} disabled={disabled || !canUndo} title="Undo (Ctrl Z)" aria-label="Undo" className={iconBtn}>
          <Undo2 className="h-4 w-4" /><span className="hidden lg:inline">Undo</span>
        </button>
        <button type="button" onClick={onRedo} disabled={disabled || !canRedo} title="Redo (Ctrl Shift Z)" aria-label="Redo" className={iconBtn}>
          <Redo2 className="h-4 w-4" /><span className="hidden lg:inline">Redo</span>
        </button>
        <button type="button" onClick={onClear} disabled={disabled || !canClear} title="Clear all marks" aria-label="Clear all marks" className={iconBtn}>
          <Trash2 className="h-4 w-4" /><span className="hidden lg:inline">Clear</span>
        </button>
      </div>
    </div>
  );
}
