import { Check } from "lucide-react";
import type { StartMode } from "./DesignStartScreen";

export type CadFlowStep = 0 | 1 | 2;

/** Step 1 is named after how the design starts; steps 2 and 3 are the same in every design flow. */
export function cadFlowStepLabels(mode: StartMode): [string, string, string] {
  const first = mode === "draw" ? "Draw" : mode === "mix" ? "Choose inspiration" : "Describe";
  return [first, "Pick your design", "Create CAD"];
}

interface CadFlowStepsProps {
  labels: readonly string[];
  /** Index of the step the customer is on; earlier steps show as done. */
  current: number;
  className?: string;
}

/**
 * Where you are in a design-first CAD flow: design picture first, CAD after.
 * Same look as the editor's Design / CAD steps (numbered dots, done in green).
 * On a phone the labels of other steps hide, so it never scrolls sideways.
 */
export default function CadFlowSteps({ labels, current, className = "" }: CadFlowStepsProps) {
  return (
    <ol aria-label="Steps" className={`flex min-w-0 items-center justify-center gap-1.5 text-xs sm:gap-2 sm:text-sm ${className}`}>
      {labels.map((name, i) => {
        const isCurrent = i === current;
        const done = i < current;
        return (
          <li key={name} aria-current={isCurrent ? "step" : undefined} className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            {i > 0 && <span aria-hidden="true" className="h-px w-3 flex-shrink-0 bg-border sm:w-6" />}
            <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${isCurrent ? "bg-foreground text-background" : done ? "bg-emerald-700 text-white" : "border border-border text-muted-foreground"}`}>
              {done ? <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" /> : i + 1}
              {done && <span className="sr-only">{i + 1}, done</span>}
            </span>
            <span className={`truncate font-display uppercase tracking-[0.06em] ${isCurrent ? "text-foreground" : "sr-only text-muted-foreground sm:not-sr-only"}`}>{name}</span>
          </li>
        );
      })}
    </ol>
  );
}
