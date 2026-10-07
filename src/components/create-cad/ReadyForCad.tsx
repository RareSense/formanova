import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Ruler } from "lucide-react";
import creditCoinIcon from "@/assets/icons/credit-coin.png";
import type { CadJewelryType } from "@/lib/ring-cad-nurbs-api";
import type { EditorPicture } from "./angle-suggestions";

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
  onBack: () => void;
  onGenerate: () => void;
  generating: boolean;
  /** Admin-only model choice, shown beside Generate CAD. */
  modelPicker?: ReactNode;
}

/**
 * The last step in the editor window: the approved pictures, optional
 * dimensions, and Generate CAD, which starts the normal Image to CAD run.
 */
export default function ReadyForCad({ pictures, jewelryType, dimensions, onDimensions, cost, costLoading, onBack, onGenerate, generating, modelPicker }: ReadyForCadProps) {
  const [main, ...angles] = pictures;

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3 sm:p-5 lg:flex-row">
        <aside className="flex-shrink-0 lg:w-[280px] lg:border lg:border-border lg:p-4">
          <h2 className="font-display text-lg uppercase tracking-[0.06em] text-foreground">Your approved design</h2>
          {main && (
            <div className="relative mt-3 border-2 border-[hsl(var(--formanova-hero-accent))]">
              <img src={main.display} alt="Approved design" className="aspect-square w-full object-cover" />
              <span className="absolute left-2 top-2 flex items-center gap-1 bg-background px-2 py-0.5 text-xs"><Check className="h-3 w-3 text-emerald-700" /> Approved</span>
            </div>
          )}
        </aside>

        <main className="flex min-w-0 flex-1 flex-col gap-4">
          {angles.length > 0 && (
            <div>
              <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Angles</h3>
              <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
                {angles.map((a) => (
                  <figure key={a.display} className="border border-border">
                    <img src={a.display} alt={`${a.label} view`} className="aspect-square w-full object-cover" />
                    <figcaption className="flex items-center justify-between border-t border-border px-2.5 py-1.5 text-sm">
                      <span className="truncate font-medium text-foreground">{a.label}</span>
                      <Check className="h-3.5 w-3.5 text-emerald-700" />
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          )}

          <div>
            <label htmlFor="ready-dimensions" className="block text-[15px] font-medium text-foreground">
              Dimensions <span className="font-normal">(optional)</span>
            </label>
            <p id="ready-dimensions-hint" className="mb-2 mt-0.5 text-sm text-muted-foreground">
              Provide sizes, widths and stone sizes in mm. Leave empty for standard proportions.
            </p>
            <div className="relative">
              <Ruler aria-hidden="true" className="pointer-events-none absolute left-4 top-4 h-4 w-4 text-muted-foreground" />
              <textarea
                id="ready-dimensions"
                aria-describedby="ready-dimensions-hint"
                value={dimensions}
                onChange={(e) => onDimensions(e.target.value)}
                rows={1}
                placeholder={DIMENSION_EXAMPLE[jewelryType ?? "ring"]}
                className="min-h-[72px] w-full resize-y border border-border bg-background py-3 pl-11 pr-4 text-[14px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-foreground/60 sm:min-h-[48px]"
              />
            </div>
          </div>
        </main>
      </div>

      <footer className="flex flex-shrink-0 flex-col-reverse gap-2 border-t border-border px-3 py-3 sm:flex-row sm:items-center sm:px-5">
        <button type="button" onClick={onBack} disabled={generating} className="flex h-12 items-center justify-center gap-2 border border-border px-5 text-sm text-foreground hover:border-foreground/40 disabled:opacity-50">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <span className="flex-1 text-center text-xs text-muted-foreground">Ready in 30–40 min · Rhino 3DM, STL, STEP</span>
        {modelPicker}
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating}
          className="flex h-12 items-center justify-center gap-2.5 bg-[hsl(var(--formanova-hero-accent))] px-8 font-display text-base uppercase tracking-wide text-background transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {generating ? "Starting…" : <>Generate CAD <ArrowRight className="h-4 w-4" />
            <span className="inline-flex items-center gap-1"><img src={creditCoinIcon} alt="" className="h-5 w-5" /><span className="font-mono text-sm font-semibold">{costLoading ? "…" : cost ?? "—"}</span></span></>}
        </button>
      </footer>
    </>
  );
}
