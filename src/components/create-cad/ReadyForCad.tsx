import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import type { CadJewelryType } from "@/lib/ring-cad-nurbs-api";
import type { EditorPicture } from "./angle-suggestions";
import CreditTag from "./CreditTag";

const DIMENSION_EXAMPLE: Record<CadJewelryType, string> = {
  ring: "e.g. ring size US 7, band 2 mm wide, centre stone 9 × 7 mm",
  necklace: "e.g. pendant 22 mm tall, chain 1.5 mm, centre stone 8 × 6 mm",
  bracelet: "e.g. 17 cm inner length, 5 mm wide, stones 3 mm",
  earring: "e.g. 24 mm long, centre stone 7 × 5 mm",
  other: "e.g. 30 mm tall, 20 mm wide, stones 3 mm",
};

interface ReadyForCadProps {
  approved: EditorPicture;
  /** The extra views row (optional views, other uploads). */
  views: ReactNode;
  jewelryType: CadJewelryType | null;
  dimensions: string;
  onDimensions: (text: string) => void;
  /** The CAD price from the backend estimate; null while unknown. */
  cost: number | null;
  costLoading: boolean;
  onGenerate: () => void;
  generating: boolean;
  /** Views are still being made: wait before starting the CAD. */
  waiting?: boolean;
  /** Admin-only model choice, shown beside Create CAD. */
  modelPicker?: ReactNode;
}

/**
 * One screen after "Looks right": the approved design with optional extra
 * views under it, and on the right optional dimensions and Create CAD.
 */
export default function ReadyForCad({ approved, views, jewelryType, dimensions, onDimensions, cost, costLoading, onGenerate, generating, waiting, modelPicker }: ReadyForCadProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-6 lg:flex-row lg:gap-8">
      <div className="min-w-0 flex-1">
        <div className="flex aspect-[4/3] max-h-[340px] w-full items-center justify-center border border-[hsl(var(--formanova-hero-accent))] bg-muted/20">
          <img src={approved.display} alt="Your approved design" className="h-full w-full object-contain" />
        </div>
        <div className="mt-5">{views}</div>
      </div>

      <aside className="flex flex-shrink-0 flex-col gap-5 lg:w-[300px] lg:border-l lg:border-border/60 lg:pl-8">
        <div>
          <label htmlFor="ready-dimensions" className="block text-sm font-medium text-foreground">
            Dimensions <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <p id="ready-dimensions-hint" className="mb-2 mt-0.5 text-sm text-muted-foreground">Any sizes you want us to follow.</p>
          <textarea
            id="ready-dimensions"
            aria-describedby="ready-dimensions-hint"
            value={dimensions}
            onChange={(e) => onDimensions(e.target.value)}
            rows={3}
            placeholder={DIMENSION_EXAMPLE[jewelryType ?? "ring"]}
            className="w-full resize-y border border-border bg-background px-3 py-2.5 text-[14px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-foreground/60"
          />
        </div>
        <div className="mt-auto flex flex-col gap-3">
          {modelPicker}
          <button
            type="button"
            onClick={onGenerate}
            disabled={generating || waiting}
            className="flex h-12 items-center justify-center gap-3 bg-[hsl(var(--formanova-hero-accent))] px-6 font-display text-base uppercase tracking-[0.08em] text-background transition-opacity hover:opacity-90 disabled:bg-muted disabled:text-muted-foreground"
          >
            {generating ? "Starting…" : <>Create CAD <ArrowRight className="h-4 w-4" strokeWidth={1.5} /><CreditTag value={costLoading ? "…" : cost ?? "—"} /></>}
          </button>
          <span className="text-center text-xs text-muted-foreground">{waiting ? "Waiting for your views…" : "Ready in 30–40 min · Rhino 3DM, STL, STEP"}</span>
        </div>
      </aside>
    </div>
  );
}
