import { Undo2, Redo2, Plus, Minus, Maximize2, Maximize, Eye, Keyboard, Loader2 } from "lucide-react";
import { TRANSFORM_MODES, PROGRESS_STEPS } from "./types";
import type { StatsData } from "./types";

// ── Viewer Tool Button ──
const VT_BTN = "h-[40px] min-w-[72px] flex-1 text-[11px] font-bold uppercase tracking-[0.12em] cursor-pointer transition-all duration-150 flex items-center justify-center gap-2";
const VT_BTN_DEFAULT = `${VT_BTN} text-foreground/70 hover:text-foreground hover:bg-accent/40`;
const VT_BTN_ACTIVE = `${VT_BTN} text-primary-foreground bg-primary`;

// ── Viewport Toolbar ──
export function ViewportToolbar({
  mode,
  setMode,
  downloadSlot,
}: {
  mode: string;
  setMode: (m: string) => void;
  transformData?: unknown;
  onTransformChange?: unknown;
  onResetTransform?: unknown;
  /** Result-level action ("what I do with the finished object"), deliberately
   * separated from the mode toolbar ("how I interact with the object") and
   * from the viewport-utility strip in ViewportSideTools — see the design
   * rationale in git history for this component.
   *
   * A slot rather than an onDownload/label pair: the control is now a split
   * button whose contents depend on which artifacts exist and whether the user
   * has edited the model, and that is the page's knowledge, not the toolbar's.
   * Omit to hide it. */
  downloadSlot?: React.ReactNode;
}) {
  const isTransformActive = mode !== "orbit"; // kept for potential future use

  return (
    <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-center pt-2 pointer-events-none">
      {/* Centered mode buttons */}
      <div className="pointer-events-auto flex gap-0 bg-card border border-border shadow-lg">
        {TRANSFORM_MODES.map((tm) => (
          <button
            key={tm.id}
            onClick={() => setMode(tm.id)}
            className={mode === tm.id ? VT_BTN_ACTIVE : VT_BTN_DEFAULT}
          >
            {tm.label}
          </button>
        ))}
      </div>

      {/* Result-level action, pinned right — deliberately not adjacent to the
          mode buttons, so it doesn't read as another mode. right-14 clears the
          panel-collapse button, which occupies the first 40px of that edge. */}
      {downloadSlot && (
        <div className="pointer-events-auto absolute right-14">{downloadSlot}</div>
      )}
    </div>
  );
}



// ── Progress Overlay ──
export function ProgressOverlay({ visible, progress, currentStep }: { visible: boolean; progress: number; currentStep: string }) {
  if (!visible) return null;

  return (
    <div className="absolute inset-0 z-[100] flex items-center justify-center flex-col bg-background/95 backdrop-blur-sm">
      <div className="w-[420px] text-center">
        <div className="font-display text-[72px] text-foreground leading-none mb-2">
          {progress}%
        </div>
        <div className="w-full h-[2px] overflow-hidden mt-4 mb-5 bg-border">
          <div
            className="h-full transition-all duration-500 bg-primary"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="font-mono text-[12px] text-foreground tracking-[0.15em] mb-1.5 min-h-[22px]">
          {currentStep}
        </div>
        <div className="flex flex-col gap-0 mt-8 text-left">
          {PROGRESS_STEPS.map((s, i) => {
            const stepIdx = PROGRESS_STEPS.findIndex((ps) => ps === currentStep);
            const isDone = i < stepIdx;
            const isActive = i === stepIdx;
            return (
              <div
                key={s}
                className={`flex items-center gap-3 py-2 transition-all duration-400 ${
                  isActive ? "opacity-100" : isDone ? "opacity-50" : "opacity-25"
                }`}
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 border-[1.5px] ${
                  isActive ? "bg-primary border-primary animate-pulse" : isDone ? "bg-green-500 border-green-500" : "bg-muted border-muted-foreground/30"
                }`} />
                <span className={`font-mono text-[11px] tracking-wide ${
                  isActive ? "text-foreground" : isDone ? "text-muted-foreground line-through" : "text-muted-foreground"
                }`}>
                  {s}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Stats Bar ──
export function StatsBar({ visible, stats }: { visible: boolean; stats: StatsData }) {
  if (!visible) return null;
  const items = [
    { val: stats.meshes.toString(), label: "Meshes" },
    { val: `${stats.sizeKB}`, label: "KB" },
    { val: `${stats.timeSec}s`, label: "Time" },
  ];

  return (
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-50 flex gap-6 px-7 py-3.5 bg-card/95 backdrop-blur-sm border border-border rounded-sm">
      {items.map((item) => (
        <div key={item.label} className="text-center">
          <div className="font-display text-xl text-foreground">{item.val}</div>
          <div className="font-mono text-[8px] uppercase tracking-[0.15em] text-muted-foreground mt-0.5">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Viewport Side Tools (unified vertical strip) ──
const SIDE_BTN = "w-9 h-9 flex items-center justify-center text-muted-foreground/80 hover:text-foreground hover:bg-accent/50 transition-all duration-150 cursor-pointer active:scale-95 disabled:opacity-25 disabled:cursor-not-allowed relative group";

function SideDivider() {
  return <div className="mx-2 h-px bg-border/30" />;
}

function SideTooltip({ label }: { label: string }) {
  return (
    <span className="absolute right-full mr-2 px-2 py-1 text-[9px] font-mono uppercase tracking-wider text-foreground bg-card border border-border rounded-sm shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
      {label}
    </span>
  );
}

export function ViewportSideTools({ visible, onZoomIn, onZoomOut, onResetView, onUndo, onRedo, undoCount, redoCount, onFullscreen, onDisplayMenu, onKeyboardShortcuts  }: {
  visible: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onUndo: () => void;
  onRedo: () => void;
  undoCount: number;
  redoCount: number;
  onFullscreen?: () => void;
  onDisplayMenu?: () => void;
  onKeyboardShortcuts?: () => void;
}) {
  if (!visible) return null;

  return (
    <div className="absolute right-8 top-1/2 -translate-y-1/2 z-50 flex flex-col bg-card/85 backdrop-blur-sm border border-border/40 rounded-sm shadow-lg overflow-visible">
      {/* Zoom */}
      <button onClick={onZoomIn} className={SIDE_BTN} title="Zoom in">
        <SideTooltip label="Zoom In" />
        <Plus className="w-4 h-4" />
      </button>
      <button onClick={onZoomOut} className={SIDE_BTN} title="Zoom out">
        <SideTooltip label="Zoom Out" />
        <Minus className="w-4 h-4" />
      </button>

      <SideDivider />

      {/* History */}
      <button onClick={onUndo} disabled={undoCount === 0} className={SIDE_BTN} title="Undo">
        <SideTooltip label={`Undo${undoCount > 0 ? ` (${undoCount})` : ""}`} />
        <Undo2 className="w-3.5 h-3.5" />
      </button>
      <button onClick={onRedo} disabled={redoCount === 0} className={SIDE_BTN} title="Redo">
        <SideTooltip label={`Redo${redoCount > 0 ? ` (${redoCount})` : ""}`} />
        <Redo2 className="w-3.5 h-3.5" />
      </button>

      <SideDivider />

      {/* View */}
      <button onClick={onResetView} className={SIDE_BTN} title="Reset view">
        <SideTooltip label="Reset View" />
        <Maximize2 className="w-3.5 h-3.5" />
      </button>
      {onFullscreen && (
        <button onClick={onFullscreen} className={SIDE_BTN} title="Fullscreen">
          <SideTooltip label="Fullscreen" />
          <Maximize className="w-3.5 h-3.5" />
        </button>
      )}

      <SideDivider />

      {/* Display & Shortcuts */}
      {onDisplayMenu && (
        <button onClick={onDisplayMenu} className={SIDE_BTN} title="Display options">
          <SideTooltip label="Display" />
          <Eye className="w-3.5 h-3.5" />
        </button>
      )}
      {onKeyboardShortcuts && (
        <button onClick={onKeyboardShortcuts} className={SIDE_BTN} title="Keyboard shortcuts">
          <SideTooltip label="Shortcuts" />
          <Keyboard className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Download 3DM lives in ViewportToolbar, top-right: it is a
          result-level action rather than a viewport utility. */}
    </div>
  );
}
