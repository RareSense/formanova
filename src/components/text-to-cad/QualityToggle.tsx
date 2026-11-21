/**
 * GemToggle — A proper toggle switch between Simple and Refractive gem rendering.
 * Compact horizontal toggle for the bottom-left viewport toolbar.
 */

import { useState } from "react";
import { X } from "lucide-react";
import type { GemMode } from "./GemInstanceRenderer";

interface GemToggleProps {
  visible: boolean;
  mode: GemMode;
  onModeChange: (mode: GemMode) => void;
  /** Why real gems are off by default on this computer; shows a closable hint. */
  riskReason?: string | null;
}

const HINT_KEY = "fn_gem_hint_closed";

export default function GemToggle({ visible, mode, onModeChange, riskReason }: GemToggleProps) {
  const [hintOpen, setHintOpen] = useState(() => {
    if (!riskReason) return false;
    try { return localStorage.getItem(HINT_KEY) !== "1"; } catch { return true; }
  });
  if (!visible) return null;

  const isRefractive = mode === "refraction";

  const closeHint = () => {
    setHintOpen(false);
    try { localStorage.setItem(HINT_KEY, "1"); } catch { /* storage blocked */ }
  };

  return (
    <div className="relative">
    {hintOpen && riskReason && mode === "simple" && (
      <div role="note" className="absolute bottom-full left-0 mb-2 w-[220px] rounded-sm border border-border/60 bg-card/95 px-3 py-2 pr-7 text-left">
        <button type="button" aria-label="Close" onClick={closeHint} className="absolute right-1 top-1 p-1 text-muted-foreground/70 hover:text-foreground">
          <X className="h-3 w-3" />
        </button>
        <p className="text-[11px] leading-snug text-muted-foreground">{riskReason} Refract shows real sparkle but may be slow.</p>
      </div>
    )}
    <button
      onClick={() => onModeChange(isRefractive ? "simple" : "refraction")}
      className="flex items-center gap-2 px-2.5 py-1.5 bg-card/90 backdrop-blur-sm border border-border/50 rounded-sm shadow-sm cursor-pointer hover:bg-accent/30 transition-all duration-150 group"
      title={isRefractive ? "Refractive gems (click for Simple)" : "Simple gems (click for Refractive)"}
    >
      {/* Toggle track */}
      <div className="relative w-[28px] h-[14px] rounded-full border border-border bg-muted/50 transition-colors duration-200">
        <div
          className={`absolute top-[1px] w-[10px] h-[10px] rounded-full transition-all duration-200 ${
            isRefractive
              ? "left-[15px] bg-primary"
              : "left-[1px] bg-muted-foreground/60"
          }`}
        />
      </div>

      {/* Label */}
      <span className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-muted-foreground group-hover:text-foreground transition-colors min-w-[52px]">
        {isRefractive ? "Refract" : "Simple"}
      </span>
    </button>
    </div>
  );
}
