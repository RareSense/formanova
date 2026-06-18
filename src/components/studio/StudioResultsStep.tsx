import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Diamond, Gem, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResultImageItem, type ResultImageMeta } from '@/components/studio/ResultImageItem';
import { FeedbackModal } from '@/components/studio/FeedbackModal';
import { AIFixModal } from '@/components/studio/AIFixModal';
import { UpscaleControl, type UpscaleRunStatus } from '@/components/studio/UpscaleControl';
import { PostGenerationCoachmark } from '@/components/studio/PostGenerationCoachmark';
import { upscaleEtaLabel } from '@/lib/upscale-api';
import { TO_SINGULAR } from '@/lib/jewelry-utils';
import { type FeedbackCategory } from '@/lib/feedback-api';
import { type Resolution } from '@/components/studio/OutputSettingsPills';
import { trackAIFixModalOpened, getEligibleCoachmarkVariant, suppressCoachmark } from '@/lib/posthog-events';
import { cn } from '@/lib/utils';
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
  effectiveJewelryType: string;
  isProductShot: boolean;
  onAIFix: (prompt: string) => void;
  onUpscale: (factor: number) => void;
  /** The generation's tier — drives upscale billing and the factor menu. */
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
  userEmail?: string | null;
  generationCost?: number | null;
  humanFixCost?: number | null;
}

export function StudioResultsStep({
  resultImages,
  workflowId,
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
  userEmail,
  generationCost,
  humanFixCost,
}: StudioResultsStepProps) {
  const [aiFixOpen, setAiFixOpen] = useState(false);

  // Remember which factor the user launched so the in-progress overlay can show
  // an accurate ETA for that (source tier, factor) pair.
  const [activeFactor, setActiveFactor] = useState<number | null>(null);
  // Pixel meta of the primary result, reported by ResultImageItem on load, used
  // for the details line below the preview (tier . W x H . shot type).
  const [primaryMeta, setPrimaryMeta] = useState<ResultImageMeta | null>(null);
  const upscaling = upscaleRunStatus === 'starting' || upscaleRunStatus === 'processing';
  const etaLabel = activeFactor ? upscaleEtaLabel(upscaleResolution, activeFactor) : null;

  // --- Post-generation coachmark ---------------------------------------------
  // A small floating card that points at the "Fix it with human" button once a
  // result renders, nudging unhappy users toward a fix. It shows once per
  // generation and remembers its dismissal in localStorage (handled inside
  // PostGenerationCoachmark).
  const [coachmarkVisible, setCoachmarkVisible] = useState(false);
  // Bumping this signal tells the coachmark to dismiss and remember the current
  // generation so it does not reappear once the user has acted on it.
  const [coachmarkDismissSignal, setCoachmarkDismissSignal] = useState(0);
  const actionAreaRef = useRef<HTMLDivElement>(null);       // positioning anchor + z-index host
  const humanButtonRef = useRef<HTMLDivElement>(null);      // element the card points at
  const resultsContainerRef = useRef<HTMLDivElement>(null); // observed so the card re-positions as images load
  // Stable per-generation id used to scope the "already dismissed" memory.
  const generationKey = useMemo(
    () => workflowId ?? resultImages[0] ?? '',
    [workflowId, resultImages],
  );
  // A/B experiment: only eligible users (starter-pack buyers on their first
  // generation) are bucketed, and only the 'treatment' bucket sees the coachmark.
  // The read records the PostHog exposure for the eligible population (control
  // included). Ineligible / logged-out users get undefined and are never bucketed.
  const coachmarkVariant = useMemo(
    () => (generationKey ? getEligibleCoachmarkVariant() : undefined),
    [generationKey],
  );

  // The coachmark appears on the first generation only. Once it has been shown,
  // suppress it permanently on this browser so it never returns.
  const handleCoachmarkVisibility = (visible: boolean) => {
    setCoachmarkVisible(visible);
    if (visible) suppressCoachmark();
  };

  // Dismiss the coachmark for this generation whenever the user takes an action.
  const dismissCoachmarkForGeneration = () => {
    setCoachmarkDismissSignal(signal => signal + 1);
    setCoachmarkVisible(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative space-y-8"
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
          <p className="mb-6 font-mono text-[11px] italic text-muted-foreground">
            This usually takes {etaLabel ?? 'a few minutes'}.
          </p>
          <button
            onClick={onKeepBrowsing}
            className="mb-4 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-foreground transition-colors hover:text-foreground/70"
          >
            Keep browsing
            <ArrowRight className="h-3 w-3 shrink-0" />
          </button>
          <p className="max-w-xs font-mono text-[10px] leading-relaxed text-muted-foreground">
            Grab a coffee or keep browsing. We'll save your result in your generations history.
          </p>
        </div>
      )}

      <div className="text-center">
        <span className="font-mono text-[9px] tracking-[0.3em] text-muted-foreground uppercase block mb-1">Complete</span>
        <h2 className="font-display text-4xl uppercase tracking-tight">Your Result{resultImages.length !== 1 ? 's' : ''}</h2>
      </div>

      {resultImages.length > 0 ? (
        <div ref={resultsContainerRef} className="flex flex-wrap justify-center gap-4 max-w-5xl mx-auto">
          {resultImages.map((url, i) => (
            <ResultImageItem
              key={i}
              url={url}
              index={i}
              workflowId={workflowId}
              jewelryType={effectiveJewelryType}
              naturalAspect
              hero={resultImages.length === 1}
              onMeta={i === 0 ? setPrimaryMeta : undefined}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <p className="text-muted-foreground">No result images found. The workflow may still be processing.</p>
        </div>
      )}

      {/* Details line below the preview: tier . dimensions . shot type. */}
      {resultImages.length === 1 && primaryMeta && (
        <p className="text-center font-mono text-[11px] tracking-wider text-muted-foreground">
          {primaryMeta.tier && <>{primaryMeta.tier} &middot; </>}
          {primaryMeta.width} x {primaryMeta.height} &middot; {isProductShot ? 'Product shot' : 'Model shot'}
        </p>
      )}

      {/* Action area. While the coachmark is visible we lift this block above the
          rest of the page so the highlighted "Fix it with human" button sits on top. */}
      <div
        ref={actionAreaRef}
        className={cn(
          "relative mx-auto flex w-full max-w-2xl flex-col gap-4 pt-2",
          coachmarkVisible ? "z-[70]" : "z-40",
        )}
      >
        <PostGenerationCoachmark
          enabled={resultImages.length > 0 && coachmarkVariant === 'treatment'}
          generationKey={generationKey}
          dismissSignal={coachmarkDismissSignal}
          targetRef={humanButtonRef}
          anchorRef={actionAreaRef}
          observeRef={resultsContainerRef}
          onVisibilityChange={handleCoachmarkVisibility}
        />
        {/* Inline upscale: pick a multiplier and start, no modal, directly below
            the generated image. Hides itself when the image can't be enlarged. */}
        {resultImages.length > 0 && (
          <UpscaleControl
            resultImageUrl={resultImages[0]}
            resolution={upscaleResolution}
            onUpscale={(factor) => { setActiveFactor(factor); dismissCoachmarkForGeneration(); onUpscale(factor); }}
            runStatus={upscaleRunStatus}
            error={upscaleError}
          />
        )}
        <Button
          size="lg"
          onClick={() => { dismissCoachmarkForGeneration(); handleStartOver(); }}
          className="h-12 w-full gap-2 border-0 bg-gradient-to-r from-[hsl(var(--formanova-hero-accent))] to-[hsl(var(--formanova-glow))] px-6 font-display text-base uppercase tracking-wide text-background transition-opacity hover:opacity-90"
        >
          <Diamond className="h-4 w-4" />
          New Photoshoot
        </Button>
        <div className="grid grid-cols-2 items-center gap-3">
          <div ref={humanButtonRef} className="relative min-w-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { dismissCoachmarkForGeneration(); onRequestHumanFix(); }}
              className={cn(
                "relative z-10 h-11 w-full gap-2 border-2 border-[hsl(var(--formanova-hero-accent))] px-4 font-mono text-[10px] uppercase tracking-wider text-[hsl(var(--formanova-hero-accent))] hover:bg-[hsl(var(--formanova-hero-accent))]/10 hover:text-[hsl(var(--formanova-hero-accent))]",
                coachmarkVisible && "shadow-[0_0_4px_hsl(var(--formanova-hero-accent)/0.10)]"
              )}
            >
              Fix it with human
              <ButtonCost cost={humanFixCost} />
            </Button>
          </div>
          <Button
            size="sm"
            onClick={() => {
              dismissCoachmarkForGeneration();
              setAiFixOpen(true);
              trackAIFixModalOpened({
                category: TO_SINGULAR[effectiveJewelryType] ?? effectiveJewelryType,
                workflow_id: workflowId,
              });
            }}
            className="h-11 w-full gap-2 border-2 border-[hsl(var(--formanova-hero-accent))] bg-background px-4 font-mono text-[10px] uppercase tracking-wider text-[hsl(var(--formanova-hero-accent))] hover:bg-[hsl(var(--formanova-hero-accent))]/10 hover:text-[hsl(var(--formanova-hero-accent))]"
          >
            Fix it with AI
            <ButtonCost cost={generationCost} />
          </Button>
        </div>
      </div>

      <FeedbackModal
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        workflowId={workflowId}
        jewelryImageUrl={jewelryUploadedUrl}
        jewelryDisplayUrl={jewelrySasUrl || jewelryImage}
        modelImageUrl={activeModelUrl}
        resultImageUrl={resultImages[0] ?? null}
        category={(TO_SINGULAR[effectiveJewelryType] ?? 'other') as FeedbackCategory}
        userEmail={userEmail}
        humanFixCost={humanFixCost}
      />

      <AIFixModal
        open={aiFixOpen}
        onClose={() => setAiFixOpen(false)}
        onConfirm={onAIFix}
        jewelryDisplayUrl={jewelrySasUrl || jewelryImage}
        resultImageUrl={resultImages[0] ?? null}
        isProductShot={isProductShot}
        generationCost={generationCost}
      />
    </motion.div>
  );
}
