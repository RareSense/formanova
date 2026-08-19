import { useRef, useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import creditCoinIcon from "@/assets/icons/credit-coin.png";
import { useEstimatedCost } from "@/hooks/use-estimated-cost";
import { RING_CAD_NURBS_WORKFLOW } from "@/lib/ring-cad-nurbs-api";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import ReferenceImageUploader from "./ReferenceImageUploader";
import CadHistoryLibrary from "./CadHistoryLibrary";

import cadExample1 from "@/assets/examples/cad-example-1.webp";
import cadExample2 from "@/assets/examples/cad-example-2.webp";
import cadExample3 from "@/assets/examples/cad-example-3.webp";
import cadExample4 from "@/assets/examples/cad-example-4.webp";

// Shared fixed height for the upload workspace box and the "My Rings" panel,
// so the two columns frame identically — same top edge (both start right
// below their own header) and same bottom edge, matching Photo Studio's
// CANVAS_H technique (StudioVaultUploadStep.tsx).
const PANEL_H = "h-[500px] md:h-[640px]";

const EXAMPLE_DESIGNS = [
  {
    image: cadExample1,
    prompt: "Oval center stone with ball-tip prong setting, flanked by marquise side stones and small round accent clusters, tapered rounded band",
  },
  {
    image: cadExample2,
    prompt: "Asymmetric botanical ring with two large leaf forms rising from a split flowing band, small round center stone nestled between the leaves, accent stones along leaf edges",
  },
  {
    image: cadExample3,
    prompt: "Large oval center stone in four-prong setting surrounded by round halo, split shank band with accent stones running along each shank",
  },
  {
    image: cadExample4,
    prompt: "Wide dome cluster ring, oval center stone surrounded by six oval accents, filigree openwork shoulders",
  },
];

function RingReferenceExamples({ onSelect }: { onSelect: (example: typeof EXAMPLE_DESIGNS[0]) => void }) {
  return (
    <div className={`grid grid-cols-2 gap-3 overflow-hidden border border-border/30 p-3 ${PANEL_H}`}>
      {EXAMPLE_DESIGNS.map((example, index) => (
        <button
          key={example.image}
          type="button"
          onClick={() => onSelect(example)}
          className="group relative min-h-0 overflow-hidden border border-border/20 bg-muted/10 transition-colors hover:border-foreground/30"
          aria-label={`Use ring example ${index + 1}`}
        >
          <img src={example.image} alt={`Ring example ${index + 1}`} className="h-full w-full object-cover" />
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
  isGenerating: boolean;
  onGenerate: () => void;
  creditBlock?: React.ReactNode;
  /** Ordered previews; index 0 is the primary reference. Length 0..MAX_RING_CAD_REFERENCE_IMAGES. */
  referenceImagePreviewUrls: string[];
  /** Appends images, respecting the max. Caller owns File state and object-URL lifetime. */
  onAddReferenceImages: (files: File[]) => void;
  onRemoveReferenceImage: (index: number) => void;
  /** Replaces the whole set (used by the example designs). */
  onReplaceReferenceImages: (files: File[]) => void;
  onGlbUpload?: (file: File) => void;
}

export default function ImagePromptScreen({
  model, tier, prompt, setPrompt,
  isGenerating, onGenerate, creditBlock,
  referenceImagePreviewUrls,
  onAddReferenceImages, onRemoveReferenceImage, onReplaceReferenceImages,
  onGlbUpload,
}: ImagePromptScreenProps) {
  const glbInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  const handleExampleClick = useCallback(async (example: typeof EXAMPLE_DESIGNS[0]) => {
    setPrompt(example.prompt);
    try {
      const res = await fetch(example.image);
      const blob = await res.blob();
      const file = new File([blob], "example-ring.webp", { type: "image/webp" });
      onReplaceReferenceImages([file]);
    } catch {
      // image load failed -- just set prompt
    }
  }, [setPrompt, onReplaceReferenceImages]);

  // "My Rings" reuse — urls are same-origin, auth-gated /api/artifacts proxy
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
      if (canGenerate && !isGenerating) onGenerate();
    }
  };

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [prompt]);

  const canGenerate = imageCount > 0;

  return (
    <div className="w-full flex items-start justify-center bg-background">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full px-3 pb-6 pt-20 sm:px-6 lg:px-3"
      >
        <div className="grid gap-8 lg:gap-10 lg:grid-cols-3">
          <div className="lg:col-span-2">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <span className="marta-label block mb-1">Image to CAD &middot; Step 1</span>
                  <h3 className="mt-2 font-display text-3xl uppercase tracking-tight text-foreground md:text-4xl">Upload Your Ring Images</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    Upload 1&ndash;5 photos or sketches of the same ring to inspire your CAD design.
                  </p>
                </div>
              </div>

            <div className="flex flex-col gap-3">
              <ReferenceImageUploader
                referenceImagePreviewUrls={referenceImagePreviewUrls}
                onAddReferenceImages={onAddReferenceImages}
                onRemoveReferenceImage={onRemoveReferenceImage}
                primaryLabel="Drop your ring images or sketches here"
                canvasClassName={PANEL_H}
                photoStudioEmptyState
              />

              {/* Text prompt — secondary */}
              <div className="relative flex-shrink-0">
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Add optional description"
                  rows={2}
                  className="min-h-[64px] max-h-[200px] w-full resize-none overflow-y-auto border border-border/60 bg-background px-5 py-3 pb-7 font-body text-[14px] leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-foreground/40 focus:ring-1 focus:ring-border"
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

              {/* Credit block / Generate button — pinned to the bottom of the
                  box via mt-auto, so it bottom-aligns with My Rings' own
                  pagination row regardless of how much room the textarea took. */}
              <div className="mt-auto">
                {creditBlock && <div className="mb-3">{creditBlock}</div>}
                {!creditBlock && (
                  <button
                    onClick={onGenerate}
                    disabled={isGenerating || !canGenerate}
                    className="w-full py-4 text-[13px] font-bold uppercase tracking-[0.2em] cursor-pointer transition-all duration-200 bg-primary text-primary-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 active:scale-[0.99] flex items-center justify-center gap-2"
                  >
                    {isGenerating ? "Generating…" : (
                      <>
                        Generate 3D Ring
                        <span className="inline-flex items-center gap-1 ml-1 opacity-80">
                          <img src={creditCoinIcon} alt="" className="w-5 h-5" />
                          <span className="text-[13px] font-mono font-semibold">{costLoading ? '…' : (estimatedCost !== null ? estimatedCost : '—')}</span>
                        </span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

          </div>

          <div>
            {hasImageHistory ? (
              <CadHistoryLibrary variant="images" panelH={PANEL_H} onSelectImages={handleLibraryImageSelect} onHasHistoryChange={setHasImageHistory} />
            ) : (
              <>
                <div className="mb-2">
                  <span className="marta-label block mb-1 invisible" aria-hidden="true">Step 1</span>
                  <h3 className="mt-2 font-display text-3xl uppercase tracking-tight text-foreground md:text-4xl">Try an Example</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">Choose one to load its image and prompt</p>
                </div>
                <RingReferenceExamples onSelect={handleExampleClick} />
              </>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
