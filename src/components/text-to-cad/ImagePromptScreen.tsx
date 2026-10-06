import { useRef, useCallback, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import creditCoinIcon from "@/assets/icons/credit-coin.png";
import { useEstimatedCost } from "@/hooks/use-estimated-cost";
import { RING_CAD_NURBS_WORKFLOW, cadJewelryNoun, type CadJewelryType } from "@/lib/ring-cad-nurbs-api";
import CadJewelryTypeCards from "@/components/text-to-cad/CadJewelryTypeCards";
import { useJewelryTypeGate } from "@/components/text-to-cad/useJewelryTypeGate";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import ReferenceImageUploader from "./ReferenceImageUploader";
import CadHistoryLibrary from "./CadHistoryLibrary";
import { CAD_EXAMPLE_DESIGNS, type CadExampleDesign } from "./cad-examples";
import DesignUseChoice, { type DesignUse } from "./DesignUseChoice";
import { ArrowRight } from "lucide-react";

// Shared fixed height for the upload workspace box and the "My Pieces" panel,
// so the two columns frame identically — same top edge (both start right
// below their own header) and same bottom edge, matching Photo Studio's
// CANVAS_H technique (StudioVaultUploadStep.tsx).
const PANEL_H = "h-[500px] md:h-[640px]";

// The box asks for the spec only: no examples, no promise about the result.
const DIMENSION_PLACEHOLDER = "Sizes, widths and stone sizes in mm";

function ReferenceExamples({ examples, noun, onSelect }: { examples: CadExampleDesign[]; noun: string; onSelect: (example: CadExampleDesign) => void }) {
  return (
    <div className={`grid grid-cols-2 gap-3 overflow-hidden border border-border/30 p-3 ${PANEL_H}`}>
      {examples.map((example, index) => (
        <button
          key={example.image}
          type="button"
          onClick={() => onSelect(example)}
          className="group relative min-h-0 overflow-hidden border border-border/20 bg-muted/10 transition-colors hover:border-foreground/30"
          aria-label={`Use ${noun} example ${index + 1}`}
        >
          <img src={example.image} alt={`${noun} example ${index + 1}`} className="h-full w-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center bg-background/85 p-4 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
            <p className="text-center font-mono text-[10px] leading-[1.6] text-foreground/80">{example.prompt}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

interface ImagePromptScreenProps {
  model: string;
  tier: string;
  prompt: string;
  setPrompt: (p: string) => void;
  jewelryType: CadJewelryType | null;
  setJewelryType: (t: CadJewelryType) => void;
  isGenerating: boolean;
  onGenerate: () => void;
  /** Ordered previews; index 0 is the primary reference. Length 0..MAX_RING_CAD_REFERENCE_IMAGES. */
  referenceImagePreviewUrls: string[];
  /** Appends images, respecting the max. Caller owns File state and object-URL lifetime. */
  onAddReferenceImages: (files: File[]) => void;
  onRemoveReferenceImage: (index: number) => void;
  /** Replaces the whole set (used by the example designs). */
  onReplaceReferenceImages: (files: File[]) => void;
  onGlbUpload?: (file: File) => void;
  /**
   * Opens the design editor with the uploaded pictures. When provided, a
   * "Use as is / Edit before CAD" choice appears once a picture is uploaded;
   * when omitted the screen is exactly the plain upload-and-generate flow.
   */
  onEditFirst?: () => void;
}

export default function ImagePromptScreen({
  model, tier, prompt, setPrompt, jewelryType, setJewelryType,
  isGenerating, onGenerate,
  referenceImagePreviewUrls,
  onAddReferenceImages, onRemoveReferenceImage, onReplaceReferenceImages,
  onGlbUpload,
  onEditFirst,
}: ImagePromptScreenProps) {
  const glbInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const noun = jewelryType ? cadJewelryNoun(jewelryType) : "jewelry";
  const { cardsRef, guardedGenerate, typeError } = useJewelryTypeGate(jewelryType, onGenerate);
  const [hasImageHistory, setHasImageHistory] = useState(false);

  const primaryPreviewUrl = referenceImagePreviewUrls[0] ?? null;
  const imageCount = referenceImagePreviewUrls.length;

  // ring_cad_nurbs_v1 handles every input mode (text-only, one image, 2-5
  // images) — the workflow name never changes, only the payload shape does.
  const { cost: estimatedCost, loading: costLoading } = useEstimatedCost({
    workflowName: RING_CAD_NURBS_WORKFLOW,
    model,
    pricingContext: { llm_tier: tier },
  });

  const handleExampleClick = useCallback(async (example: CadExampleDesign) => {
    setPrompt(example.prompt);
    try {
      const res = await fetch(example.image);
      const blob = await res.blob();
      const file = new File([blob], `example-${jewelryType ?? "piece"}.webp`, { type: "image/webp" });
      onReplaceReferenceImages([file]);
    } catch {
      // image load failed -- just set prompt
    }
  }, [setPrompt, onReplaceReferenceImages, jewelryType]);

  // "My Pieces" reuse — urls are same-origin, auth-gated /api/artifacts proxy
  // URLs (see useCadHistoryLibrary), so these must go through authenticatedFetch,
  // unlike the bundled example assets above. A multi-angle entry reuses as a
  // whole set in one call, so all its images land together (respecting the
  // existing 5-image cap in useReferenceImages).
  const handleLibraryImageSelect = useCallback(async (urls: string[]) => {
    try {
      const files = await Promise.all(urls.map(async (url, index) => {
        const res = await authenticatedFetch(url);
        if (!res.ok) throw new Error(`${res.status}`);
        const blob = await res.blob();
        return new File([blob], `reused-reference-${index}.webp`, { type: blob.type || "image/webp" });
      }));
      onAddReferenceImages(files);
    } catch {
      // reuse failed -- silently no-op, same as the example-click failure path
    }
  }, [onAddReferenceImages]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canGenerate && !isGenerating) guardedGenerate();
    }
  };

  const canGenerate = imageCount > 0;
  const [designUse, setDesignUse] = useState<DesignUse>("as_is");
  // Editing only applies once there is a picture to edit.
  const editing = !!onEditFirst && imageCount > 0 && designUse === "edit";

  return (
    <div className="w-full flex items-start justify-center bg-background">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full px-3 pb-6 pt-20 sm:px-6 lg:px-3"
      >
        {/* Step 1: which piece. Above the two-column grid so the upload box
            and the right-hand panel still start and end on the same lines. */}
        <div className="mb-8 max-w-[680px]">
          <span className="marta-label block mb-1">Image to CAD &middot; Step 1</span>
          <h3 className="mt-2 font-display text-3xl uppercase tracking-tight text-foreground md:text-4xl">What are you making?</h3>
          <div className="mt-4">
            <div ref={cardsRef}>
              <CadJewelryTypeCards value={jewelryType} onChange={setJewelryType} disabled={isGenerating} error={typeError} />
            </div>
          </div>
        </div>

        <div className="grid gap-8 lg:gap-10 lg:grid-cols-3">
          <div className="lg:col-span-2">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <span className="marta-label block mb-1">Image to CAD &middot; Step 2</span>
                  <h3 className="mt-2 font-display text-3xl uppercase tracking-tight text-foreground md:text-4xl">Upload your {noun} images</h3>
                  {/* Sets the expectation before the upload, not after the
                      result. Weight and colour carry the emphasis rather than
                      a warning colour: this is how the tool works, not a
                      caution. */}
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    Upload 1&ndash;5 reference images. We&rsquo;ll use them as{" "}
                    <span className="font-medium text-foreground">inspiration, not recreate the design exactly.</span>
                  </p>
                </div>
              </div>

            <div className="flex flex-col gap-3">
              <ReferenceImageUploader
                referenceImagePreviewUrls={referenceImagePreviewUrls}
                onAddReferenceImages={onAddReferenceImages}
                onRemoveReferenceImage={onRemoveReferenceImage}
                primaryLabel={`Drop your ${noun} images or sketches here`}
                browseLabel={`Browse ${noun} files`}
                canvasClassName={PANEL_H}
                photoStudioEmptyState
              />

              {onEditFirst && imageCount > 0 && (
                <DesignUseChoice value={designUse} onChange={setDesignUse} disabled={isGenerating} />
              )}

              {/* Text prompt — secondary. The ask for dimensions is a visible
                  label, not placeholder text: a placeholder vanishes on the
                  first keystroke. The copy names what to enter and nothing
                  else. Same weight-and-colour emphasis as the upload note. */}
              {!editing && (
              <div className="relative flex-shrink-0">
                <label htmlFor="image-to-cad-details" className="mb-1.5 flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium text-foreground">Provide dimensions</span>
                  <span className="text-muted-foreground">(optional)</span>
                  <span className="text-muted-foreground">&middot; sizes, widths and stone sizes in mm</span>
                </label>
                <textarea
                  id="image-to-cad-details"
                  ref={textareaRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={DIMENSION_PLACEHOLDER}
                  rows={3}
                  /* Full-strength border, not a faded one: this is an input and
                     needs to read as an editable field at a glance. */
                  className="min-h-[96px] max-h-[240px] w-full resize-y overflow-y-auto border border-border bg-background px-5 py-3 pb-7 font-body text-[14px] leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-foreground/60 focus:ring-1 focus:ring-border"
                />
                {prompt.length > 0 && (
                  <button
                    onClick={() => { setPrompt(""); textareaRef.current?.focus(); }}
                    className="absolute bottom-2.5 right-8 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60 hover:text-foreground transition-colors duration-150 cursor-pointer z-10"
                  >
                    Clear
                  </button>
                )}
              </div>
              )}

            </div>

            {/* Action area — matches Photo Studio's Next button exactly:
                right-aligned below the canvas, gold gradient, size="lg". */}
            {(
              <div className="mt-3 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
                {editing ? (
                <Button
                  size="lg"
                  onClick={onEditFirst}
                  disabled={isGenerating}
                  className="gap-2.5 border-0 bg-gradient-to-r from-[hsl(var(--formanova-hero-accent))] to-[hsl(var(--formanova-glow))] px-10 font-display text-base uppercase tracking-wide text-background transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  Edit design
                  <ArrowRight className="h-4 w-4" />
                </Button>
                ) : (
                <Button
                  size="lg"
                  onClick={guardedGenerate}
                  disabled={isGenerating || !canGenerate}
                  className="gap-2.5 border-0 bg-gradient-to-r from-[hsl(var(--formanova-hero-accent))] to-[hsl(var(--formanova-glow))] px-10 font-display text-base uppercase tracking-wide text-background transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {isGenerating ? "Generating…" : (
                    <>
                      Generate CAD
                      <span className="inline-flex items-center gap-1 opacity-90">
                        <img src={creditCoinIcon} alt="" className="w-5 h-5" />
                        <span className="font-mono text-sm font-semibold">{costLoading ? '…' : (estimatedCost !== null ? estimatedCost : '—')}</span>
                      </span>
                    </>
                  )}
                </Button>
                )}
              </div>
            )}

          </div>

          <div>
            {/* My Pieces must stay mounted even while hidden: it is what reports
                whether any history exists, so gating its render on
                hasImageHistory would deadlock — the flag could never flip
                because nothing would ever fetch and report back. */}
            <div className={hasImageHistory ? "" : "hidden"}>
              <CadHistoryLibrary variant="images" panelH={PANEL_H} onSelectImages={handleLibraryImageSelect} onHasHistoryChange={setHasImageHistory} />
            </div>

            {!hasImageHistory && (
              <>
                <div className="mb-2">
                  <span className="marta-label block mb-1 invisible" aria-hidden="true">Step 2</span>
                  <h3 className="mt-2 font-display text-3xl uppercase tracking-tight text-foreground md:text-4xl">Try an Example</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">Choose one to load its image and prompt</p>
                </div>
                {jewelryType ? (
                  <ReferenceExamples examples={CAD_EXAMPLE_DESIGNS[jewelryType]} noun={noun} onSelect={handleExampleClick} />
                ) : (
                  <div className={`flex items-center justify-center border border-border/30 p-6 text-center text-sm text-muted-foreground ${PANEL_H}`}>
                    Choose what you are making to see examples
                  </div>
                )}
                {/* Below the panel, not in the header: the header must stay the
                    same height as the upload column's, so both panels share a
                    top and bottom edge. First run only: this whole block is
                    gated on having no history, so it retires itself once
                    someone has generated once. */}
                <p className="mt-2 text-xs text-muted-foreground/80">
                  Examples are for inspiration. Your CAD will be a new interpretation, not an exact copy.
                </p>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
