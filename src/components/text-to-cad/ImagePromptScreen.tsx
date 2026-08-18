import { useRef, useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import creditCoinIcon from "@/assets/icons/credit-coin.png";
import { useEstimatedCost } from "@/hooks/use-estimated-cost";
import { RING_CAD_NURBS_WORKFLOW } from "@/lib/ring-cad-nurbs-api";
import { authenticatedFetch } from "@/lib/authenticated-fetch";
import ReferenceImageUploader from "./ReferenceImageUploader";
import CadHistoryLibrary from "./CadHistoryLibrary";
import { CATEGORY_EXAMPLES } from "@/components/studio/StudioVaultUploadStep";

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

function RingReferenceExamples() {
  return (
    <div className={`grid grid-cols-2 gap-3 overflow-hidden border border-border/30 p-3 ${PANEL_H}`}>
      {CATEGORY_EXAMPLES.rings.allowed.map((image, index) => (
        <div key={image} className="min-h-0 overflow-hidden border border-border/20 bg-muted/10">
          <img src={image} alt={`Ring reference example ${index + 1}`} className="h-full w-full object-cover" />
        </div>
      ))}
    </div>
  );
}

interface ImagePromptScreenProps {
  model: string;
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
  model, prompt, setPrompt,
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
  const { cost: estimatedCost, loading: costLoading } = useEstimatedCost({ workflowName: RING_CAD_NURBS_WORKFLOW, model });

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
                  <span className="marta-label block mb-1">Step 1</span>
                  <h3 className="mt-2 font-display text-3xl uppercase tracking-tight text-foreground md:text-4xl">Upload Your Ring</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">Upload a photo or sketch of your ring</p>
                </div>
              </div>

            <div className="flex flex-col gap-3">
              <ReferenceImageUploader
                referenceImagePreviewUrls={referenceImagePreviewUrls}
                onAddReferenceImages={onAddReferenceImages}
                onRemoveReferenceImage={onRemoveReferenceImage}
                canvasClassName={PANEL_H}
              />

              {/* Text prompt — secondary */}
              <div className={`relative flex-shrink-0 transition-opacity duration-200 ${primaryPreviewUrl ? "opacity-100" : "opacity-40"}`}>
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Add optional description"
                  rows={2}
                  className={`w-full min-h-[52px] max-h-[200px] px-5 py-2.5 pb-7 text-[14px] text-foreground placeholder:text-muted-foreground/50 resize-none font-body leading-relaxed transition-all duration-200 focus:outline-none bg-muted/20 border overflow-y-auto ${primaryPreviewUrl ? "border-border focus:ring-1 focus:ring-border" : "border-border/30 pointer-events-none"}`}
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
                          <span className="text-[13px] font-mono font-semibold">≤</span>
                          <img src={creditCoinIcon} alt="" className="w-5 h-5" />
                          <span className="text-[13px] font-mono font-semibold">{costLoading ? '…' : (estimatedCost !== null ? estimatedCost : '—')}</span>
                        </span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Example designs — replaced by "My Rings" once the user has history */}
            {!hasImageHistory && (
              <div className="mt-6">
                <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-3">
                  Try an example
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {EXAMPLE_DESIGNS.map((ex, i) => (
                    <button
                      key={i}
                      onClick={() => handleExampleClick(ex)}
                      className="relative aspect-square border border-border hover:border-foreground/20 overflow-hidden transition-all duration-150 bg-muted/10 group"
                    >
                      <img src={ex.image} alt={`Ring example ${i + 1}`} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-background/85 flex items-center justify-center p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <p className="font-mono text-[10px] text-foreground/80 leading-[1.6] text-center">{ex.prompt}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

          </div>

          <div>
            {hasImageHistory ? (
              <CadHistoryLibrary variant="images" panelH={PANEL_H} onSelectImages={handleLibraryImageSelect} onHasHistoryChange={setHasImageHistory} />
            ) : (
              <>
                <div className="mb-2">
                  <span className="marta-label block mb-1 invisible" aria-hidden="true">Step 1</span>
                  <h3 className="mt-2 font-display text-3xl uppercase tracking-tight text-foreground md:text-4xl">Upload Guide</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">For best results, use clear ring photos</p>
                </div>
                <RingReferenceExamples />
              </>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
