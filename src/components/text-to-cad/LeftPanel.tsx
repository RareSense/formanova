import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RotateCcw, X, Maximize2 } from "lucide-react";
import creditCoinIcon from "@/assets/icons/credit-coin.png";
import { useEstimatedCost } from "@/hooks/use-estimated-cost";
import { RING_CAD_NURBS_WORKFLOW, MAX_RING_CAD_REFERENCE_IMAGES } from "@/lib/ring-cad-nurbs-api";

interface LeftPanelProps {
  model: string;
  setModel: (m: string) => void;
  prompt: string;
  setPrompt: (p: string) => void;
  isGenerating: boolean;
  hasModel: boolean;
  onGenerate: () => void;
  magicTexturing: boolean;
  onMagicTexturingChange: (on: boolean) => void;
  onReset?: () => void;
  creditBlock?: React.ReactNode;
  referenceImagePreviewUrls?: string[];
  pageTitle?: string;
}

export default function LeftPanel({
  model, setModel, prompt, setPrompt,
  isGenerating, hasModel,
  onGenerate, magicTexturing, onMagicTexturingChange,
  onReset,
  creditBlock,
  referenceImagePreviewUrls = [],
  pageTitle,
}: LeftPanelProps) {
  const { cost: generationCost, loading: generationCostLoading } = useEstimatedCost({ workflowName: RING_CAD_NURBS_WORKFLOW, model });
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const primaryPreviewUrl = referenceImagePreviewUrls[0] ?? null;
  const imageCount = referenceImagePreviewUrls.length;
  const isImageMode = !!(primaryPreviewUrl || pageTitle);

  return (
    <div className="flex flex-col bg-card border-r border-border h-full min-w-0 overflow-hidden">
      {/* Image lightbox */}
      <AnimatePresence>
        {lightboxIndex !== null && referenceImagePreviewUrls[lightboxIndex] && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setLightboxIndex(null)}
          >
            <motion.img
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              src={referenceImagePreviewUrls[lightboxIndex]}
              alt="Reference design"
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={() => setLightboxIndex(null)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-card/80 border border-border hover:bg-accent/60 transition-colors"
            >
              <X className="w-4 h-4 text-foreground/70" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="px-4 lg:px-6 pt-6 pb-5 border-b border-border min-w-0">
        <h1 className="font-display text-xl lg:text-2xl tracking-[0.15em] text-foreground uppercase truncate">
          {pageTitle ?? "Generate CAD Design"}
        </h1>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-6 space-y-6 scrollbar-thin min-w-0"
        style={{ scrollbarWidth: "thin" }}
      >
        {/* Reference image(s) — image-to-cad mode */}
        {primaryPreviewUrl && (
          <section>
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Reference Image</h3>
              {imageCount > 1 && (
                <span className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground/60 tabular-nums">
                  {imageCount}/{MAX_RING_CAD_REFERENCE_IMAGES}
                </span>
              )}
            </div>
            <div className="relative border border-border bg-muted/10 overflow-hidden">
              <img
                src={primaryPreviewUrl}
                alt="Reference design"
                className="w-full object-contain cursor-pointer"
                style={{ maxHeight: 180 }}
                onClick={() => setLightboxIndex(0)}
              />
              {/* Enlarge, not remove. This panel is the workspace, where the
                  run has already been sent with these images, so removing one
                  changes nothing about the result. */}
              <button
                onClick={() => setLightboxIndex(0)}
                className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center bg-card/80 border border-border hover:bg-accent/60 transition-colors"
                aria-label="Expand image"
              >
                <Maximize2 className="w-3 h-3 text-foreground/70" />
              </button>
            </div>

            {/* Additional angles, if any were uploaded */}
            {imageCount > 1 && (
              <div className="grid grid-cols-4 gap-2 mt-2">
                {referenceImagePreviewUrls.slice(1).map((url, i) => {
                  const index = i + 1;
                  return (
                    <div key={index} className="group relative aspect-square border border-border bg-muted/10 overflow-hidden">
                      {/* The tile is the expand control, matching the primary
                          image above. On a thumbnail this size a second button
                          would cover most of the ring. */}
                      <button
                        type="button"
                        onClick={() => setLightboxIndex(index)}
                        aria-label={`Expand reference angle ${index}`}
                        className="block h-full w-full"
                      >
                        <img src={url} alt={`Reference angle ${index}`} className="h-full w-full object-cover" />
                      </button>
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute top-1 right-1 flex h-5 w-5 items-center justify-center border border-border bg-card/80 opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <Maximize2 className="h-2.5 w-2.5 text-foreground/70" />
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* AI Model - hidden until model selection is ready to ship.
        <section>
          <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-3">Generation Quality</h3>
          <div className="flex gap-0 border border-border min-w-0">
            {AI_MODELS.filter((m) => !m.hidden).map((m) => (
              <button
                key={m.id}
                onClick={() => !m.comingSoon && setModel(m.id)}
                disabled={m.comingSoon}
                className={`flex-1 min-w-0 py-3 px-2 text-[11px] lg:text-[12px] font-semibold uppercase tracking-[0.05em] lg:tracking-[0.1em] transition-colors duration-150 border-r border-border last:border-r-0 ${
                  m.comingSoon
                    ? "text-muted-foreground/30 cursor-not-allowed bg-transparent opacity-40"
                    : model === m.id
                      ? "text-primary-foreground bg-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50 cursor-pointer"
                }`}
              >
                <span className="block text-center">{m.label}</span>
                {m.comingSoon && <span className="block font-mono text-[7px] lg:text-[8px] mt-0.5 normal-case tracking-wide text-center">Soon</span>}
                {!m.comingSoon && m.tier && <span className={`block font-mono text-[7px] lg:text-[8px] mt-0.5 normal-case tracking-wide text-center ${model === m.id ? "text-primary-foreground/60" : "text-muted-foreground/50"}`}>{m.tier}</span>}
              </button>
            ))}
          </div>
        </section>
        */}

        {/* Prompt */}
        {/* In image mode before model loads: show prompt as static text (if any), no textarea */}
        {!(isImageMode && !hasModel) && (
        <section>
          <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-3">Prompt</h3>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={isImageMode ? "Add optional description" : "Example: Create a rose ring with three blooming roses, twisted vine band with thorns, and diamond accents"}
            rows={4}
            /* Fixed, modest default with a hard ceiling; the user can still drag
               the corner grip to grow it. Without max-h a long brief expands the
               textarea until it pushes the Generate button out of the panel. */
            className="w-full min-h-[96px] max-h-[240px] resize-y overflow-y-auto border border-border bg-muted/30 px-4 py-3 font-body text-[13px] leading-relaxed text-foreground transition-all duration-200 placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
          />

          {/* Insufficient credits inline block */}
          {creditBlock && <div className="mt-4">{creditBlock}</div>}

          {/* Generate button */}
          {!creditBlock && (
            <button
              onClick={onGenerate}
              disabled={isGenerating || (!prompt.trim() && !primaryPreviewUrl)}
              className="w-full py-3 lg:py-4 px-3 lg:px-4 mt-4 text-[11px] lg:text-[13px] font-bold uppercase tracking-[0.1em] lg:tracking-[0.2em] cursor-pointer transition-all duration-200 bg-primary text-primary-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 active:scale-[0.99] flex items-center justify-center gap-2 flex-wrap"
            >
              {isGenerating ? "Generating…" : (
                <>
                  <span>Generate CAD</span>
                  <span className="inline-flex items-center gap-1 opacity-80 flex-shrink-0">
                    <span className="text-[11px] lg:text-[13px] font-mono font-semibold">≤</span>
                    <img src={creditCoinIcon} alt="" className="w-5 h-5" />
                    <span className="text-[11px] lg:text-[13px] font-mono font-semibold">{generationCostLoading ? '…' : (generationCost !== null ? generationCost : '—')}</span>
                  </span>
                </>
              )}
            </button>
          )}

          {/* Magic Texture removed — materials managed via right panel */}

          {/* Upload GLB — only shown when a model exists */}
          {/* Magic Texturing checkbox — hidden, keep for future re-enable
          {hasModel && (
            <label className="w-full mt-3 flex items-center gap-2.5 py-3 px-1 cursor-pointer select-none group">
              <input
                type="checkbox"
                checked={magicTexturing}
                onChange={(e) => onMagicTexturingChange(e.target.checked)}
                disabled={isGenerating}
                className="w-4 h-4 rounded border-border accent-primary cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              />
              <span className="text-[11px] lg:text-[12px] font-bold uppercase tracking-[0.1em] lg:tracking-[0.15em] text-muted-foreground group-hover:text-foreground transition-colors">
                Magic Texturing
              </span>
            </label>
          )}
          */}
        </section>
        )}

        {/* Image mode — show prompt text before model loads (read-only, no header).
            Bounded and scrollable: a long brief would otherwise run for hundreds
            of pixels and push everything below it out of the panel. */}
        {isImageMode && !hasModel && prompt.trim() && (
          <section>
            <div className="max-h-[140px] overflow-y-auto overscroll-contain border border-border/40 bg-muted/20 px-3 py-2.5">
              <p className="font-body text-[13px] leading-relaxed text-foreground/70 [overflow-wrap:anywhere]">{prompt}</p>
            </div>
          </section>
        )}
      </div>


      {/* Start Over button — pinned at bottom, bottom-aligned with viewport gem toggle (bottom-4 = 16px) */}
      {hasModel && !isGenerating && onReset && (
        <div className="px-4 lg:px-6 pb-4 pt-3 bg-card">
          <button
            onClick={onReset}
            className="w-full py-2.5 lg:py-3.5 px-3 lg:px-4 text-[11px] lg:text-[12px] font-bold uppercase tracking-[0.1em] lg:tracking-[0.2em] cursor-pointer transition-all duration-200 flex items-center justify-center gap-2 bg-muted/30 border border-border text-muted-foreground hover:text-foreground hover:bg-accent active:scale-[0.98] flex-wrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Start Over</span>
          </button>
        </div>
      )}
    </div>
  );
}
