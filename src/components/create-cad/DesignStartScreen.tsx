import { useRef, useState } from "react";
import { Layers, Shapes, Type } from "lucide-react";
import creditCoinIcon from "@/assets/icons/credit-coin.png";
import CadJewelryTypeCards from "@/components/text-to-cad/CadJewelryTypeCards";
import ReferenceImageUploader from "@/components/text-to-cad/ReferenceImageUploader";
import { useJewelryTypeGate } from "@/components/text-to-cad/useJewelryTypeGate";
import { CAD_EXAMPLE_PROMPTS } from "@/components/text-to-cad/cad-examples";
import { MAX_DESIGN_IMAGES } from "@/lib/design-image-api";
import { cadJewelryNoun, type CadJewelryType } from "@/lib/ring-cad-nurbs-api";
import DoodlePad, { type DoodlePadHandle } from "./DoodlePad";

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
}

const MODES: [StartMode, string, typeof Type][] = [["describe", "Describe it", Type], ["draw", "Draw it", Shapes], ["mix", "Mix pictures", Layers]];

/**
 * Text to CAD, step 1: what piece, and how to start the design (describe,
 * draw or mix pictures), then 4 designs to choose from or just 1. The CAD is
 * only made after the design picture is approved.
 */
export default function DesignStartScreen({ jewelryType, setJewelryType, busy, onMake, onGlbUpload }: DesignStartScreenProps) {
  const noun = jewelryType ? cadJewelryNoun(jewelryType) : "jewelry";
  const [mode, setMode] = useState<StartMode>("describe");
  const [text, setText] = useState("");
  const [hasInk, setHasInk] = useState(false);
  const [mixFiles, setMixFiles] = useState<File[]>([]);
  const [mixPreviews, setMixPreviews] = useState<string[]>([]);
  const [count, setCount] = useState<1 | 4>(4);
  const doodleRef = useRef<DoodlePadHandle>(null);
  const glbInputRef = useRef<HTMLInputElement>(null);

  const ready = mode === "describe" ? !!text.trim() : mode === "draw" ? hasInk : mixFiles.length >= 2;
  const why = mode === "describe" ? "Describe the piece to continue" : mode === "draw" ? "Draw something to continue" : "Add at least 2 pictures to continue";

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
      <div className="w-full max-w-[760px] px-4 pb-10 pt-16 sm:px-6">
        <span className="marta-label mb-1 block">Text to CAD &middot; Step 1</span>
        <h3 className="mt-2 font-display text-3xl uppercase tracking-tight text-foreground md:text-4xl">What are you making?</h3>
        <div ref={cardsRef} className="mt-4">
          <CadJewelryTypeCards value={jewelryType} onChange={setJewelryType} disabled={busy} error={typeError} />
        </div>

        <span className="marta-label mb-1 mt-10 block">Text to CAD &middot; Step 2</span>
        <h3 className="mt-2 font-display text-3xl uppercase tracking-tight text-foreground md:text-4xl">How do you want to start?</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">You'll see the design first. The CAD is only made once you're happy with it.</p>

        <div role="tablist" aria-label="How do you want to start?" className="mt-4 grid grid-cols-3 border border-border">
          {MODES.map(([id, title, Icon], i) => (
            <button key={id} type="button" role="tab" aria-selected={mode === id} onClick={() => setMode(id)} disabled={busy}
              className={`flex min-h-[48px] flex-col items-center justify-center gap-1 py-2.5 text-sm transition-colors sm:flex-row sm:gap-2 ${i > 0 ? "border-l border-border" : ""} ${mode === id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
              <Icon className="h-4 w-4" />{title}
            </button>
          ))}
        </div>

        <div className="mt-4">
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
              {textBox(2, "A few words (optional), e.g. white gold, emerald centre stone", "A few words about your drawing")}
            </>
          )}
          {mode === "mix" && (
            <>
              <ReferenceImageUploader
                referenceImagePreviewUrls={mixPreviews}
                onAddReferenceImages={addMix}
                onRemoveReferenceImage={removeMix}
                primaryLabel={`Drop 2 to ${MAX_DESIGN_IMAGES} pictures to mix`}
                browseLabel="Browse files"
                canvasClassName="h-[160px] sm:h-[180px]"
              />
              {mixFiles.length > 0 && <p className="mb-2 mt-1.5 text-xs text-muted-foreground">Pictures are lettered left to right: {mixFiles.map((_, i) => String.fromCharCode(65 + i)).join(", ")}</p>}
              {textBox(2, "What to take from each, e.g. the stone from A, the band from B", "What to take from each picture")}
            </>
          )}
        </div>

        <fieldset className="mt-8" disabled={busy}>
          <legend className="text-[15px] font-semibold text-foreground">How many designs?</legend>
          <div role="radiogroup" aria-label="How many designs?" className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {([[4, "4 to choose from", "Pick the closest, then edit it", 20], [1, "Just 1", "Straight to editing", 5]] as const).map(([n, title, sub, cost]) => {
              const on = count === n;
              return (
                <button key={n} type="button" role="radio" aria-checked={on} onClick={() => setCount(n)}
                  className={`flex items-center gap-4 border px-4 py-4 text-left transition-colors ${on ? "border-[hsl(var(--formanova-hero-accent))] bg-[hsl(var(--formanova-hero-accent)/0.06)]" : "border-border hover:border-foreground/40"}`}>
                  <span aria-hidden="true" className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-foreground" : "border-border"}`}>{on && <span className="h-2.5 w-2.5 rounded-full bg-foreground" />}</span>
                  <span className="min-w-0 flex-1"><span className="block text-[15px] font-medium text-foreground">{title}</span><span className="block text-sm text-muted-foreground">{sub}</span></span>
                  <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><img src={creditCoinIcon} alt="" className="h-4 w-4" />{cost}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
          {!ready && <span className="text-sm text-muted-foreground">{why}</span>}
          <button type="button" onClick={guardedGenerate} disabled={busy || !ready}
            className="flex h-12 items-center justify-center gap-2.5 bg-[hsl(var(--formanova-hero-accent))] px-10 font-display text-base uppercase tracking-wide text-background transition-opacity hover:opacity-90 disabled:opacity-60">
            {count === 4 ? "Make 4 designs" : "Make my design"}
            <span className="inline-flex items-center gap-1"><img src={creditCoinIcon} alt="" className="h-5 w-5" /><span className="font-mono text-sm font-semibold">{count === 4 ? 20 : 5}</span></span>
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
    </div>
  );
}
