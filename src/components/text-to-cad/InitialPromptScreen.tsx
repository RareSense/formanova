import { useRef, useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import creditCoinIcon from "@/assets/icons/credit-coin.png";
import { useEstimatedCost } from "@/hooks/use-estimated-cost";
import { RING_CAD_NURBS_WORKFLOW } from "@/lib/ring-cad-nurbs-api";

const EXAMPLE_PROMPTS = [
  "Serpentine ring with a coiled snake design",
  "Sculptural flowing gold band",
  "Botanical ring with leaves wrapping around the band",
  "Gothic ring with sharp arches and dark gemstones",
  "Twisted vine ring with small diamonds",
  "Minimalist ring with a single oval diamond",
];

interface InitialPromptScreenProps {
  model: string;
  tier: string;
  setModel: (m: string) => void;
  prompt: string;
  setPrompt: (p: string) => void;
  isGenerating: boolean;
  onGenerate: () => void;
  onGlbUpload?: (file: File) => void;
  creditBlock?: React.ReactNode;
}

export default function InitialPromptScreen({
  model, tier, setModel, prompt, setPrompt,
  isGenerating, onGenerate, onGlbUpload, creditBlock,
}: InitialPromptScreenProps) {
  const glbInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { cost: estimatedCost, loading: costLoading } = useEstimatedCost({
    workflowName: RING_CAD_NURBS_WORKFLOW,
    model,
    pricingContext: { llm_tier: tier },
  });

  const canGenerate = !!prompt.trim();

  const handleGlbUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onGlbUpload) onGlbUpload(file);
  }, [onGlbUpload]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canGenerate && !isGenerating) onGenerate();
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center bg-background overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-[1100px] px-6 py-6"
      >
        <div>
            {/* Title */}
            <div className="text-center mb-6">
              <h1 className="font-display text-4xl md:text-5xl tracking-[0.2em] text-foreground uppercase mb-2">
                Text to CAD
              </h1>
              <p className="font-mono text-[11px] text-muted-foreground tracking-[0.15em] uppercase">
                Describe your ring design
              </p>
            </div>

            {/* Prompt */}
            <div className="mb-3 relative max-w-[680px] mx-auto">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe your ring — e.g. A rose ring with three blooming roses, twisted vine band with thorns, and diamond accents"
                rows={6}
                className="w-full min-h-[220px] max-h-[60vh] px-5 py-4 pb-9 text-[15px] text-foreground placeholder:text-muted-foreground/40 resize-y font-body leading-relaxed transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-ring bg-muted/20 border border-border overflow-y-auto"
              />
              {prompt.length > 0 && (
                <button
                  onClick={() => {
                    setPrompt("");
                    textareaRef.current?.focus();
                  }}
                  className="absolute bottom-2.5 right-5 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60 hover:text-foreground transition-colors duration-150 cursor-pointer z-10"
                  aria-label="Clear prompt"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Credit block */}
            {creditBlock && <div className="mb-3 max-w-[680px] mx-auto">{creditBlock}</div>}

            {/* Generate — matches Photo Studio's Next button: right-aligned,
                gold gradient, size="lg". */}
            {!creditBlock && (
              <div className="mx-auto flex max-w-[680px] items-center justify-end gap-3">
                <Button
                  size="lg"
                  onClick={onGenerate}
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
              </div>
            )}

            {/* Example prompts. "My Prompts" (reuse a past brief) is built and
                tested but deliberately not mounted here: parked until backend
                can persist prompts as first-class saved items rather than a
                read of the generation log. See useCadHistoryLibrary. */}
            <div className="mt-6">
                <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-3">
                  Try an example
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {EXAMPLE_PROMPTS.map((ex) => (
                    <button
                      key={ex}
                      onClick={() => setPrompt(ex)}
                      className="px-3 py-2.5 text-[12px] font-body text-muted-foreground hover:text-foreground border border-border hover:border-foreground/20 hover:bg-accent/30 transition-all duration-150 cursor-pointer text-left"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
            </div>

            {/* Upload CAD File — gated for the existing Text-to-CAD allowlist. */}
            {onGlbUpload && (
              <div className="mx-auto mt-4 max-w-[680px] text-center">
                <input
                  ref={glbInputRef}
                  type="file"
                  accept=".glb,.gltf"
                  className="hidden"
                  onChange={handleGlbUpload}
                />
                <button
                  onClick={() => glbInputRef.current?.click()}
                  className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground underline decoration-border underline-offset-4 transition-colors duration-150 hover:text-foreground hover:decoration-foreground"
                >
                  Or upload a CAD file (.glb)
                </button>
              </div>
            )}

        </div>
      </motion.div>
    </div>
  );
}
