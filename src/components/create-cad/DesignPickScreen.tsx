import { ArrowLeft, Diamond, RotateCcw } from "lucide-react";
import creditCoinIcon from "@/assets/icons/credit-coin.png";

export interface PickSlot {
  status: "making" | "ready" | "failed";
  /** Local object URL once ready. */
  display?: string;
  message?: string;
}

interface DesignPickScreenProps {
  slots: PickSlot[];
  onPick: (index: number) => void;
  onMakeMore: () => void;
  onBack: () => void;
}

/**
 * Text to CAD, step 2: the designs made from the brief. Each fills in as soon
 * as it is ready; picking one opens it in the editor.
 */
export default function DesignPickScreen({ slots, onPick, onMakeMore, onBack }: DesignPickScreenProps) {
  const making = slots.some((s) => s.status === "making");
  const single = slots.length === 1;
  return (
    <div className="flex w-full items-start justify-center bg-background">
      <div className="w-full max-w-[1000px] px-4 pb-10 pt-16 sm:px-6">
        <button type="button" onClick={onBack} disabled={making} className="mb-3 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground disabled:opacity-50">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <span className="marta-label mb-1 block">Text to CAD &middot; Step 3</span>
        <h3 className="mt-2 font-display text-3xl uppercase tracking-tight text-foreground md:text-4xl">{single ? "Your design" : "Pick the closest"}</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">{single ? "It opens in the editor as soon as it's ready." : "You can change anything on the next screen."}</p>

        <div className={`mt-5 grid gap-3 ${single ? "max-w-[420px] grid-cols-1" : "grid-cols-2 md:grid-cols-4"}`}>
          {slots.map((slot, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onPick(i)}
              disabled={slot.status !== "ready"}
              aria-label={slot.status === "ready" ? `Use design ${i + 1}` : `Design ${i + 1}`}
              className="group relative aspect-square overflow-hidden border border-border bg-muted/20 text-left transition-colors enabled:hover:border-[hsl(var(--formanova-hero-accent))]"
            >
              {slot.display && <img src={slot.display} alt={`Design ${i + 1}`} className="h-full w-full object-cover" />}
              {slot.status === "making" && (
                <span role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/40 text-center backdrop-blur-sm">
                  <span className="relative h-12 w-12" aria-hidden="true">
                    <span className="block h-12 w-12 animate-spin rounded-full border-4 border-border/40 border-t-[hsl(var(--formanova-hero-accent))]" />
                    <Diamond className="absolute inset-0 m-auto h-5 w-5 text-foreground" strokeWidth={1.8} />
                  </span>
                  <span className="text-xs text-muted-foreground">Making design {single ? "" : i + 1}<br />a few seconds</span>
                </span>
              )}
              {slot.status === "failed" && <span className="absolute inset-0 flex items-center justify-center p-3 text-center text-xs text-destructive">{slot.message ?? "Couldn't make this design."}</span>}
              {slot.status === "ready" && (
                <span className="absolute inset-x-0 bottom-0 bg-foreground py-2 text-center font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-background">
                  Use this one
                </span>
              )}
              {!single && <span className="absolute left-2 top-2 bg-background/90 px-1.5 text-xs text-foreground">{i + 1}</span>}
            </button>
          ))}
        </div>

        {!single && (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" onClick={onMakeMore} disabled={making} className="flex h-11 items-center gap-2 border border-border px-5 text-sm text-foreground hover:border-foreground/40 disabled:opacity-50">
              <RotateCcw className="h-4 w-4" /> Make 4 more
              <span className="inline-flex items-center gap-1"><img src={creditCoinIcon} alt="" className="h-4 w-4" /><span className="font-mono text-sm">20</span></span>
            </button>
            <span className="text-sm text-muted-foreground">None close? Make 4 more, or go back and add detail.</span>
          </div>
        )}
      </div>
    </div>
  );
}
