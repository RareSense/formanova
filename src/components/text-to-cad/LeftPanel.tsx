import { useRef, useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Diamond, RotateCcw, X, Maximize2 } from "lucide-react";
import creditCoinIcon from "@/assets/icons/credit-coin.png";
import { useEstimatedCost } from "@/hooks/use-estimated-cost";
import { RING_CAD_NURBS_WORKFLOW } from "@/lib/ring-cad-nurbs-api";

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
  onGlbUpload: (file: File) => void;
  onReset?: () => void;
  creditBlock?: React.ReactNode;
  referenceImagePreviewUrl?: string | null;
  onClearReferenceImage?: () => void;
  pageTitle?: string;
}

export default function LeftPanel({
  model, setModel, prompt, setPrompt,
  isGenerating, hasModel,
  onGenerate, magicTexturing, onMagicTexturingChange, onGlbUpload,
  onReset,
  creditBlock,
  referenceImagePreviewUrl,
  onClearReferenceImage,
  pageTitle,
}: LeftPanelProps) {
  const glbInputRef = useRef<HTMLInputElement>(null);
  const { cost: generationCost, loading: generationCostLoading } = useEstimatedCost({ workflowName: RING_CAD_NURBS_WORKFLOW, model });
  const [imageLightboxOpen, setImageLightboxOpen] = useState(false);

  const handleGlbUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onGlbUpload(file);
  }, [onGlbUpload]);

  const isImageMode = !!(referenceImagePreviewUrl || pageTitle);

  return (
    <div className="flex flex-col bg-card border-r border-border h-full min-w-0 overflow-hidden">
      {/* Image lightbox */}
      <AnimatePresence>
        {imageLightboxOpen && referenceImagePreviewUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setImageLightboxOpen(false)}
          >
            <motion.img
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              src={referenceImagePreviewUrl}
              alt="Reference design"
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={() => setImageLightboxOpen(false)}
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
        {/* Reference image — image-to-cad mode */}
        {referenceImagePreviewUrl && (
          <section>
            <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">Reference Image</h3>
            <div className="relative border border-border bg-muted/10 overflow-hidden">
              <img
                src={referenceImagePreviewUrl}
                alt="Reference design"
                className="w-full object-contain cursor-pointer"
                style={{ maxHeight: 180 }}
                onClick={() => setImageLightboxOpen(true)}
              />
              <button
                onClick={() => setImageLightboxOpen(true)}
                className="absolute top-1.5 right-8 w-6 h-6 flex items-center justify-center bg-card/80 border border-border hover:bg-accent/60 transition-colors"
                aria-label="Expand image"
              >
                <Maximize2 className="w-3 h-3 text-foreground/70" />
              </button>
              {onClearReferenceImage && (
                <button
                  onClick={onClearReferenceImage}
                  className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center bg-card/80 border border-border hover:bg-accent/60 transition-colors"
                  aria-label="Remove image"
                >
                  <X className="w-3 h-3 text-foreground/70" />
                </button>
              )}
            </div>
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
            className="w-full min-h-[80px] px-4 py-3 text-[13px] text-foreground placeholder:text-muted-foreground/50 resize-y font-body leading-relaxed transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-ring bg-muted/30 border border-border"
          />

          {/* Insufficient credits inline block */}
          {creditBlock && <div className="mt-4">{creditBlock}</div>}

          {/* Generate button */}
          {!creditBlock && (
            <button
              onClick={onGenerate}
              disabled={isGenerating || (!prompt.trim() && !referenceImagePreviewUrl)}
              className="w-full py-3 lg:py-4 px-3 lg:px-4 mt-4 text-[11px] lg:text-[13px] font-bold uppercase tracking-[0.1em] lg:tracking-[0.2em] cursor-pointer transition-all duration-200 bg-primary text-primary-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 active:scale-[0.99] flex items-center justify-center gap-2 flex-wrap"
            >
              {isGenerating ? "Generating…" : (
                <>
                  <span>Generate Ring</span>
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
          <input type="file" ref={glbInputRef} accept=".glb,.gltf" className="hidden" onChange={handleGlbUpload} />
          {hasModel && (
            <button
              onClick={() => glbInputRef.current?.click()}
              disabled={isGenerating}
              className="w-full py-2.5 lg:py-3.5 px-3 lg:px-4 mt-3 text-[11px] lg:text-[12px] font-bold uppercase tracking-[0.1em] lg:tracking-[0.2em] cursor-pointer transition-all duration-200 text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:text-foreground flex items-center justify-center gap-2 bg-muted/30 border border-border flex-wrap"
            >
              <span className="w-6 h-6 rounded-full border border-primary/60 flex items-center justify-center shrink-0 shadow-[0_0_8px_hsl(var(--primary)/0.4)] text-primary">
                <Diamond className="w-3 h-3" />
              </span>
              <span>Upload Ring Part</span>
            </button>
          )}

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

        {/* Image mode — show prompt text before model loads (read-only, no header) */}
        {isImageMode && !hasModel && prompt.trim() && (
          <section>
            <p className="font-body text-[13px] text-foreground/70 leading-relaxed">{prompt}</p>
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
