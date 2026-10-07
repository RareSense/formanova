import type { ReactNode } from "react";
import { ArrowRight, Plus } from "lucide-react";
import type { CadJewelryType } from "@/lib/ring-cad-nurbs-api";
import { MAX_ANGLES, type EditorPicture } from "./angle-suggestions";
import CreditTag from "./CreditTag";

const DIMENSION_EXAMPLE: Record<CadJewelryType, string> = {
  ring: "e.g. ring size US 7, band 2 mm wide, centre stone 9 × 7 mm",
  necklace: "e.g. pendant 22 mm tall, chain 1.5 mm, centre stone 8 × 6 mm",
  bracelet: "e.g. 17 cm inner length, 5 mm wide, stones 3 mm",
  earring: "e.g. 24 mm long, centre stone 7 × 5 mm",
  other: "e.g. 30 mm tall, 20 mm wide, stones 3 mm",
};

interface ReadyForCadProps {
  /** Main picture first, then the angles. */
  pictures: EditorPicture[];
  jewelryType: CadJewelryType | null;
  dimensions: string;
  onDimensions: (text: string) => void;
  /** The CAD price from the backend estimate; null while unknown. */
  cost: number | null;
  costLoading: boolean;
  /** Open the angles step to add another view. */
  onAddAngle: () => void;
  onGenerate: () => void;
  generating: boolean;
  /** Admin-only model choice, shown beside Create CAD. */
  modelPicker?: ReactNode;
}

/**
 * The last step in the editor window: the reference pictures (the design and
 * any angles, five at most), optional dimensions, and Create CAD, which starts
 * the normal Image to CAD run.
 */
export default function ReadyForCad({ pictures, jewelryType, dimensions, onDimensions, cost, costLoading, onAddAngle, onGenerate, generating, modelPicker }: ReadyForCadProps) {
  const canAddAngle = pictures.length < MAX_ANGLES + 1;

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-6">
        <section>
          <h2 className="font-display text-lg uppercase tracking-[0.06em] text-foreground">Reference images</h2>
          <p className="mt-1 text-sm text-muted-foreground">These will be used to create your CAD.</p>
          <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5">
            {pictures.map((p, i) => (
              <figure key={p.display} className={`relative border ${i === 0 ? "border-[hsl(var(--formanova-hero-accent))]" : "border-border/60"}`}>
                <img src={p.display} alt={i === 0 ? "Your approved design" : `${p.label} view`} className="aspect-square w-full bg-muted/20 object-contain" />
                <figcaption className="truncate border-t border-border/60 px-2 py-1.5 text-xs text-foreground">{i === 0 ? "Main design" : p.label}</figcaption>
              </figure>
            ))}
            {canAddAngle && (
              <button
                type="button"
                onClick={onAddAngle}
                disabled={generating}
                className="flex aspect-square flex-col items-center justify-center gap-2 border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-50"
              >
                <Plus className="h-5 w-5" strokeWidth={1.5} />
                Add another angle
              </button>
            )}
          </div>
        </section>

        <section>
          <label htmlFor="ready-dimensions" className="block text-sm font-medium text-foreground">
            Dimensions <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <p id="ready-dimensions-hint" className="mb-2 mt-0.5 text-sm text-muted-foreground">
            Add any measurements you want us to follow. Don't know them? That's okay.
          </p>
          <textarea
            id="ready-dimensions"
            aria-describedby="ready-dimensions-hint"
            value={dimensions}
            onChange={(e) => onDimensions(e.target.value)}
            rows={2}
            placeholder={DIMENSION_EXAMPLE[jewelryType ?? "ring"]}
            className="w-full resize-y border border-border bg-background px-4 py-3 text-[14px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-foreground/60"
          />
        </section>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-4">
        <span className="flex-1 text-center text-xs text-muted-foreground sm:text-left">Ready in 30–40 min · Rhino 3DM, STL, STEP</span>
        {modelPicker}
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating}
          className="flex h-12 items-center justify-center gap-3 bg-[hsl(var(--formanova-hero-accent))] px-8 font-display text-base uppercase tracking-[0.08em] text-background transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {generating ? "Starting…" : <>Create CAD <ArrowRight className="h-4 w-4" strokeWidth={1.5} /><CreditTag value={costLoading ? "…" : cost ?? "—"} /></>}
        </button>
        </div>
      </div>
    </>
  );
}
