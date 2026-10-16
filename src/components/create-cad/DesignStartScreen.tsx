import { useRef, useState } from "react";
import { Shapes, Type } from "lucide-react";
import creditCoinIcon from "@/assets/icons/credit-coin.png";
import CadJewelryTypeCards from "@/components/text-to-cad/CadJewelryTypeCards";
import ReferenceImageUploader from "@/components/text-to-cad/ReferenceImageUploader";
import { useJewelryTypeGate } from "@/components/text-to-cad/useJewelryTypeGate";
import { CAD_EXAMPLE_PROMPTS } from "@/components/text-to-cad/cad-examples";
import { DESIGN_IMAGE_CREDITS, MAX_DESIGN_IMAGES } from "@/lib/design-image-api";
import { cadJewelryNoun, type CadJewelryType } from "@/lib/ring-cad-nurbs-api";
import DoodlePad, { type DoodlePadHandle } from "./DoodlePad";
import ladybugExample from "@/assets/inspiration-examples/ladybug.webp";
import flowerExample from "@/assets/inspiration-examples/flower.webp";
import spiderWebExample from "@/assets/inspiration-examples/spider-web.webp";
import teddyExample from "@/assets/inspiration-examples/teddy-bear.webp";

const INSPIRATION_EXAMPLES: [string, string][] = [["Ladybug", ladybugExample], ["Flower", flowerExample], ["Spider web", spiderWebExample], ["Teddy bear", teddyExample]];

// Same panel height as CAD from Image, so the upload box and the examples share a top and bottom edge.
const PANEL_H = "h-[500px] md:h-[640px]";

export type StartMode = "describe" | "draw" | "mix";

export interface DesignBrief {
  mode: StartMode;
  /** What the customer wrote (or said). May be empty for Draw and Mix. */
  text: string;
  /** The drawing (Draw) or the pictures to mix (Mix). */
  images: File[];
  count: 1 | 4;
}

interface DesignStartScreenProps {
  jewelryType: CadJewelryType | null;
  setJewelryType: (t: CadJewelryType) => void;
  busy: boolean;
  onMake: (brief: DesignBrief) => void;
  onGlbUpload?: (file: File) => void;
  /** Idea: describe or draw. Inspiration: one or more pictures. */
  variant?: DesignStartVariant;
}

export type DesignStartVariant = "idea" | "inspiration";

const MODES: [StartMode, string, typeof Type][] = [["describe", "Describe it", Type], ["draw", "Draw it", Shapes]];

/**
 * Text to CAD, step 1: what piece, and how to start the design (describe,
 * draw or mix pictures), then 4 designs to choose from or just 1. The CAD is
 * only made after the design picture is approved.
 */
export default function DesignStartScreen({ jewelryType, setJewelryType, busy, onMake, onGlbUpload, variant = "idea" }: DesignStartScreenProps) {
  const noun = jewelryType ? cadJewelryNoun(jewelryType) : "jewelry";
  const inspiration = variant === "inspiration";
  const flowName = inspiration ? "CAD from Inspiration" : "CAD from Idea";
  const [mode, setMode] = useState<StartMode>(inspiration ? "mix" : "describe");
  const [text, setText] = useState("");
  const [hasInk, setHasInk] = useState(false);
  const [mixFiles, setMixFiles] = useState<File[]>([]);
  const [mixPreviews, setMixPreviews] = useState<string[]>([]);
  // One design, straight to the editor; Regenerate there covers "another".
  const count = 1 as const;
  const doodleRef = useRef<DoodlePadHandle>(null);
  const glbInputRef = useRef<HTMLInputElement>(null);

  const ready = mode === "describe" ? !!text.trim() : mode === "draw" ? hasInk : mixFiles.length >= 1;

  const make = async () => {
    const images = mode === "draw" ? [await doodleRef.current?.toFile()].filter((f): f is File => !!f) : mode === "mix" ? mixFiles : [];
    onMake({ mode, text: text.trim(), images, count });
  };
  const { cardsRef, guardedGenerate, typeError } = useJewelryTypeGate(jewelryType, () => { void make(); });

  const addMix = (files: File[]) => {
    const room = MAX_DESIGN_IMAGES - mixFiles.length;
    const accepted = files.slice(0, Math.max(0, room));
    setMixFiles((f) => [...f, ...accepted]);
    setMixPreviews((p) => [...p, ...accepted.map((f) => URL.createObjectURL(f))]);
  };
  const removeMix = (i: number) => {
    URL.revokeObjectURL(mixPreviews[i]);
    setMixFiles((f) => f.filter((_, k) => k !== i));
    setMixPreviews((p) => p.filter((_, k) => k !== i));
  };

  const textBox = (rows: number, placeholder: string, label: string) => (
    <div className="relative">
      <label htmlFor="design-start-text" className="sr-only">{label}</label>
      <textarea
        id="design-start-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={rows}
        disabled={busy}
        placeholder={placeholder}
        className="w-full resize-y border border-border bg-background py-3 px-4 text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-foreground/60 disabled:opacity-60"
      />
    </div>
  );

  return (
    <div className="flex w-full items-start justify-center bg-background">
      <div className={inspiration ? "w-full px-3 pb-6 pt-20 sm:px-6 lg:px-3" : "w-full max-w-[760px] px-4 pb-10 pt-16 sm:px-6"}>
        <div className={inspiration ? "mb-8 max-w-[680px]" : ""}>
        <span className="marta-label mb-1 block">{flowName} &middot; Step 1</span>
        <h3 className="mt-2 font-display text-3xl uppercase tracking-tight text-foreground md:text-4xl">What are you making?</h3>
        <div ref={cardsRef} className="mt-4">
          <CadJewelryTypeCards value={jewelryType} onChange={setJewelryType} disabled={busy} error={typeError} />
        </div>
        </div>

        {/* Inspiration lays out like CAD from Image: upload on the left, examples on the right. */}
        <div className={inspiration ? "grid gap-8 lg:grid-cols-3 lg:gap-10" : ""}>
        <div className={inspiration ? "lg:col-span-2" : ""}>
        <span className={`marta-label mb-1 block ${inspiration ? "" : "mt-10"}`}>{flowName} &middot; Step 2</span>
        <h3 className="mt-2 font-display text-3xl uppercase tracking-tight text-foreground md:text-4xl">{inspiration ? "Add your inspiration" : "How do you want to start?"}</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">You'll see the design first. The CAD is only made once you're happy with it.</p>

        {!inspiration && <div role="tablist" aria-label="How do you want to start?" className="mt-4 grid grid-cols-2 border border-border">
          {MODES.map(([id, title, Icon], i) => (
            <button key={id} type="button" role="tab" aria-selected={mode === id} onClick={() => setMode(id)} disabled={busy}
              className={`flex min-h-[48px] flex-col items-center justify-center gap-1 py-2.5 text-sm transition-colors sm:flex-row sm:gap-2 ${i > 0 ? "border-l border-border" : ""} ${mode === id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
              <Icon className="h-4 w-4" />{title}
            </button>
          ))}
        </div>}

        <div className={inspiration ? "mt-2" : "mt-4"}>
          {mode === "describe" && (
            <>
              {textBox(5, jewelryType === "ring"
                ? "Describe your ring, e.g. a rose ring with three blooming roses, twisted vine band with thorns, and diamond accents"
                : `Describe your ${noun}: shape, stones, metal details and any motif`, `Describe your ${noun}`)}
              {jewelryType && (
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {CAD_EXAMPLE_PROMPTS[jewelryType].slice(0, 3).map((ex) => (
                    <button key={ex} type="button" onClick={() => setText(ex)} disabled={busy}
                      className="border border-border px-3 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground">
                      {ex}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {mode === "draw" && (
            <>
              <DoodlePad ref={doodleRef} onInkChange={setHasInk} disabled={busy} />
              <p className="mb-2 mt-1.5 text-xs text-muted-foreground">A rough shape is enough.</p>
              {textBox(2, "Tell us about your drawing (optional), e.g. this is the top view of a ring, the circles are stones", "About your drawing")}
            </>
          )}
          {mode === "mix" && (
            <>
              <ReferenceImageUploader
                referenceImagePreviewUrls={mixPreviews}
                onAddReferenceImages={addMix}
                onRemoveReferenceImage={removeMix}
                primaryLabel={`Drop 1–${MAX_DESIGN_IMAGES} pictures`}
                primaryHint="A spider web, a flower, a toy, other jewelry"
                browseLabel="Browse files"
                maxImages={MAX_DESIGN_IMAGES}
                canvasClassName={PANEL_H}
                photoStudioEmptyState
              />
              {mixFiles.length > 1 && <p className="mt-2 text-xs text-muted-foreground">Pictures are lettered left to right: {mixFiles.map((_, i) => String.fromCharCode(65 + i)).join(", ")}</p>}
              {/* Asked only once there is a picture to take from. */}
              {mixFiles.length > 0 && (
                <>
                  <label htmlFor="design-start-text" className="mb-2 mt-6 block text-sm font-medium text-foreground">
                    How should {mixFiles.length > 1 ? "they" : "it"} show in your piece? <span className="font-normal text-muted-foreground">(optional)</span>
                  </label>
                  {textBox(2, mixFiles.length > 1 ? "e.g. the petals from A around the top, the curve from B as the band" : "e.g. use the web pattern as the band", "How it should show in your piece")}
                </>
              )}
            </>
          )}
        </div>


        <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
          <button type="button" onClick={guardedGenerate} disabled={busy || !ready}
            className="flex h-12 items-center justify-center gap-2.5 bg-[hsl(var(--formanova-hero-accent))] px-10 font-display text-base uppercase tracking-wide text-background transition-opacity hover:opacity-90 disabled:bg-muted disabled:text-muted-foreground disabled:hover:opacity-100">
            Make my design
            <span className="inline-flex items-center gap-1"><img src={creditCoinIcon} alt="" className="h-5 w-5" /><span className="font-mono text-sm font-semibold">{DESIGN_IMAGE_CREDITS}</span></span>
          </button>
        </div>

        {onGlbUpload && (
          <div className="mt-6 text-center">
            <input ref={glbInputRef} type="file" accept=".glb,.gltf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onGlbUpload(f); }} />
            <button type="button" onClick={() => glbInputRef.current?.click()} className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground">
              Or upload a CAD file (.glb)
            </button>
          </div>
        )}
        </div>

        {inspiration && (
          <div>
            <div className="mb-2">
              <span className="marta-label invisible mb-1 block" aria-hidden="true">Step 2</span>
              <h3 className="mt-2 font-display text-3xl uppercase tracking-tight text-foreground md:text-4xl">Try an Example</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">Choose one to load its picture</p>
            </div>
            <div className={`grid grid-cols-2 gap-3 overflow-hidden border border-border/30 p-3 ${PANEL_H}`}>
              {INSPIRATION_EXAMPLES.map(([name, src]) => (
                <button key={name} type="button" disabled={busy || mixFiles.length >= MAX_DESIGN_IMAGES} aria-label={`Use the ${name.toLowerCase()} example`}
                  onClick={async () => { const blob = await (await fetch(src)).blob(); addMix([new File([blob], `${name.toLowerCase().replace(/ /g, "-")}.webp`, { type: "image/webp" })]); }}
                  className="group relative min-h-0 overflow-hidden border border-border/20 bg-muted/10 transition-colors hover:border-foreground/30 disabled:opacity-50">
                  <img src={src} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                  <span className="absolute inset-x-0 bottom-0 bg-background/85 px-2 py-1.5 text-xs text-foreground">{name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
