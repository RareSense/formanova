import { useState } from 'react';
import { motion } from 'framer-motion';
import { Diamond, Gem, ArrowRight, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResultImageItem, type ResultImageMeta } from '@/components/studio/ResultImageItem';
import { FeedbackModal } from '@/components/studio/FeedbackModal';
import { AIFixModal } from '@/components/studio/AIFixModal';
import { UpscaleControl, type UpscaleRunStatus } from '@/components/studio/UpscaleControl';
import { UpscaleModal } from '@/components/studio/UpscaleModal';
import { upscaleEtaLabel } from '@/lib/upscale-api';
import { TO_SINGULAR } from '@/lib/jewelry-utils';
import { type FeedbackCategory } from '@/lib/feedback-api';
import { type Resolution } from '@/components/studio/OutputSettingsPills';
import { trackAIFixModalOpened } from '@/lib/posthog-events';
import creditCoinIcon from '@/assets/icons/credit-coin.png';

/** Inline coin + credit cost shown on a credit-spending action button. */
function ButtonCost({ cost }: { cost?: number | null }) {
  if (cost == null) return null;
  return (
    <span className="flex items-center gap-1 normal-case">
      <img src={creditCoinIcon} alt="" className="h-3.5 w-3.5 object-contain" />
      {cost}
    </span>
  );
}

interface StudioResultsStepProps {
  resultImages: string[];
  workflowId: string | null;
  outputAssetId?: string | null;
  effectiveJewelryType: string;
  isProductShot: boolean;
  onAIFix: (prompt: string) => void;
  onUpscale: (factor: number) => void;
  /** The generation's tier - drives upscale billing and the factor menu. */
  upscaleResolution: Resolution;
  upscaleRunStatus: UpscaleRunStatus;
  upscaleError?: string | null;
  /** Mirror of the generation "keep browsing" action, used by the upscale overlay. */
  onKeepBrowsing: () => void;
  handleStartOver: () => void;
  feedbackOpen: boolean;
  setFeedbackOpen: (open: boolean) => void;
  onRequestHumanFix: () => void;
  jewelryUploadedUrl: string | null;
  jewelrySasUrl: string | null;
  jewelryImage: string | null;
  activeModelUrl: string | null;
  /** High Effort: the jewelry angles used (cover first), for the AI Fix modal preview. */
  fixJewelryDisplayUrls?: string[];
  /** High Effort: the model (model shot) / inspiration (product shot) reference used. */
  fixReferenceUrl?: string | null;
  userEmail?: string | null;
  generationCost?: number | null;
  humanFixCost?: number | null;
}

export function StudioResultsStep({
  resultImages,
  workflowId,
  outputAssetId,
  effectiveJewelryType,
  isProductShot,
  onAIFix,
  onUpscale,
  upscaleResolution,
  upscaleRunStatus,
  upscaleError,
  onKeepBrowsing,
  handleStartOver,
  feedbackOpen,
  setFeedbackOpen,
  onRequestHumanFix,
  jewelryUploadedUrl,
  jewelrySasUrl,
  jewelryImage,
  activeModelUrl,
  fixJewelryDisplayUrls,
  fixReferenceUrl,
  userEmail,
  generationCost,
  humanFixCost,
}: StudioResultsStepProps) {
  const [aiFixOpen, setAiFixOpen] = useState(false);
  const [upscaleModalOpen, setUpscaleModalOpen] = useState(false);

  // Remember which factor the user launched so the in-progress overlay can show
  // an accurate ETA for that (source tier, factor) pair.
  const [activeFactor, setActiveFactor] = useState<number | null>(null);
  // Pixel meta of the primary result, reported by ResultImageItem on load, used
  // for the details line below the preview (tier . W x H . shot type).
  const [primaryMeta, setPrimaryMeta] = useState<ResultImageMeta | null>(null);
  const upscaling = upscaleRunStatus === 'starting' || upscaleRunStatus === 'processing';
  const etaLabel = activeFactor ? upscaleEtaLabel(upscaleResolution, activeFactor) : null;
  // Once the result has been upscaled, the on-screen image is an upscale output.
  // Only native 1K/2K/4K generations can be fixed (backend 422s otherwise), so we
  // hide both fix actions until the user starts a new photoshoot. See Pricing
  // Restructure handoff — "no fixing an upscaled image".
  const isUpscaledResult = upscaleRunStatus === 'completed';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative space-y-6"
    >
      {/* Non-blocking upscale overlay. Mirrors the generation spinner: the result
          stays visible but dimmed behind it, and the user can keep browsing while
          the job finishes in the background (tracked via the header indicator). */}
      {upscaling && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/70 px-6 text-center backdrop-blur-sm">
          <div className="relative mb-8">
            <div className="h-24 w-24 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
            <Gem className="absolute inset-0 m-auto h-10 w-10 text-primary" />
          </div>
          <h2 className="mb-3 font-display text-3xl uppercase tracking-tight">Upscaling</h2>
          <p className="mb-6 font-mono text-xs italic text-foreground/80">
            This usually takes {etaLabel ?? 'a few minutes'}.
          </p>
          <button
            onClick={onKeepBrowsing}
            className="mb-4 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-foreground transition-colors hover:text-foreground/70"
          >
            Keep creating
            <ArrowRight className="h-3 w-3 shrink-0" />
          </button>
          <p className="max-w-xs font-mono text-[11px] leading-relaxed text-foreground/70">
            It's saved to your generations history, so you can grab a coffee or keep creating.
          </p>
        </div>
      )}

      <div className="text-center">
        <span className="font-mono text-[9px] tracking-[0.3em] text-muted-foreground uppercase block mb-1">Complete</span>
        <h2 className="font-display text-4xl uppercase tracking-tight">Your Result{resultImages.length !== 1 ? 's' : ''}</h2>
      </div>

      {resultImages.length > 0 ? (
        <div className="space-y-2.5">
          <div className="flex flex-wrap justify-center gap-4 max-w-5xl mx-auto">
            {/* The workflow has ONE linked output asset. Tile 0 gets it, or
                undefined to trigger the workflow lookup. Other tiles get null
                (known to have no per-image asset) so exporting them can never
                publish tile 0's image to the store. */}
            {resultImages.map((url, i) => (
              <ResultImageItem
                key={i}
                url={url}
                index={i}
                workflowId={workflowId}
                outputAssetId={i === 0 ? (outputAssetId ?? undefined) : null}
                jewelryType={effectiveJewelryType}
                naturalAspect
                hero={resultImages.length === 1}
                onMeta={i === 0 ? setPrimaryMeta : undefined}
              />
            ))}
          </div>

          {/* Details row directly under the preview: tier . dimensions . shot type,
              with a plain Upscale pill attached - the moment the user reads the
              resolution is the moment they decide whether it's big enough. The
              pill carries no factor or price; those live in the size-picker modal. */}
          {resultImages.length === 1 && primaryMeta && (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <p className="text-center font-mono text-xs font-bold tracking-wider text-foreground">
                {primaryMeta.tier && <>{primaryMeta.tier} &middot; </>}
                {primaryMeta.width} x {primaryMeta.height} &middot; {isProductShot ? 'Product shot' : 'Model shot'}
              </p>
              <button
                type="button"
                onClick={() => setUpscaleModalOpen(true)}
                disabled={upscaling}
                className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--formanova-hero-accent))] bg-background px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[hsl(var(--formanova-hero-accent))] transition-colors hover:bg-[hsl(var(--formanova-hero-accent))]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <Maximize2 className="h-3 w-3 shrink-0" />
                Upscale
              </button>
              {upscaleRunStatus === 'error' && upscaleError && (
                <p className="w-full text-center text-xs text-destructive">{upscaleError}</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-16">
          <p className="text-muted-foreground">No result images found. The workflow may still be processing.</p>
        </div>
      )}

      {/* Action area. */}
      <div className="relative z-40 mx-auto flex w-full max-w-2xl flex-col gap-4 pt-2">
        {/* Multi-result grids have no details row, so the upscale keeps its own
            row there. Single results carry it inline next to the metadata above. */}
        {resultImages.length > 1 && (
          <UpscaleControl
            resultImageUrl={resultImages[0]}
            resolution={upscaleResolution}
            onUpscale={(factor) => { setActiveFactor(factor); onUpscale(factor); }}
            runStatus={upscaleRunStatus}
            error={upscaleError}
          />
        )}
        <Button
          size="lg"
          onClick={() => { handleStartOver(); }}
          className="h-12 w-full gap-2 border-0 bg-gradient-to-r from-[hsl(var(--formanova-hero-accent))] to-[hsl(var(--formanova-glow))] px-6 font-display text-base uppercase tracking-wide text-background transition-opacity hover:opacity-90"
        >
          <Diamond className="h-4 w-4" />
          New Photoshoot
        </Button>
        {!isUpscaledResult && (
          <div className="grid grid-cols-2 items-center gap-3">
            <div className="relative min-w-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => { onRequestHumanFix(); }}
                className="relative z-10 h-11 w-full gap-2 border-2 border-[hsl(var(--formanova-hero-accent))] px-4 font-mono text-[10px] uppercase tracking-wider text-[hsl(var(--formanova-hero-accent))] hover:bg-[hsl(var(--formanova-hero-accent))]/10 hover:text-[hsl(var(--formanova-hero-accent))]"
              >
                Fix it with human
                <ButtonCost cost={humanFixCost} />
              </Button>
            </div>
            <Button
              size="sm"
              onClick={() => {
                setAiFixOpen(true);
                trackAIFixModalOpened({
                  category: TO_SINGULAR[effectiveJewelryType] ?? effectiveJewelryType,
                  workflow_id: workflowId,
                });
              }}
              className="h-11 w-full min-w-0 gap-2 border-2 border-[hsl(var(--formanova-hero-accent))] bg-background px-4 font-mono text-[10px] uppercase tracking-wider text-[hsl(var(--formanova-hero-accent))] hover:bg-[hsl(var(--formanova-hero-accent))]/10 hover:text-[hsl(var(--formanova-hero-accent))]"
            >
              Fix it with AI
              <ButtonCost cost={generationCost} />
            </Button>
          </div>
        )}
      </div>

      <FeedbackModal
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        workflowId={workflowId}
        jewelryImageUrl={jewelryUploadedUrl}
        jewelryDisplayUrl={jewelrySasUrl || jewelryImage}
        jewelryInputUrls={fixJewelryDisplayUrls}
        modelImageUrl={activeModelUrl}
        resultImageUrl={resultImages[0] ?? null}
        category={(TO_SINGULAR[effectiveJewelryType] ?? 'other') as FeedbackCategory}
        userEmail={userEmail}
        humanFixCost={humanFixCost}
      />

      <UpscaleModal
        open={upscaleModalOpen}
        onOpenChange={setUpscaleModalOpen}
        resultImageUrl={resultImages[0] ?? null}
        resolution={upscaleResolution}
        onUpscale={(factor) => { setActiveFactor(factor); onUpscale(factor); }}
      />

      <AIFixModal
        open={aiFixOpen}
        onClose={() => setAiFixOpen(false)}
        onConfirm={onAIFix}
        jewelryDisplayUrl={jewelrySasUrl || jewelryImage}
        jewelryDisplayUrls={fixJewelryDisplayUrls}
        referenceUrl={fixReferenceUrl}
        resultImageUrl={resultImages[0] ?? null}
        isProductShot={isProductShot}
        generationCost={generationCost}
      />
    </motion.div>
  );
}
