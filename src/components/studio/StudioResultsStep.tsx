import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Diamond } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResultImageItem } from '@/components/studio/ResultImageItem';
import { FeedbackModal } from '@/components/studio/FeedbackModal';
import { AIFixModal } from '@/components/studio/AIFixModal';
import { PostGenerationCoachmark } from '@/components/studio/PostGenerationCoachmark';
import { TO_SINGULAR } from '@/lib/jewelry-utils';
import { type FeedbackCategory } from '@/lib/feedback-api';
import { trackAIFixModalOpened, getEligibleCoachmarkVariant, suppressCoachmark } from '@/lib/posthog-events';
import { cn } from '@/lib/utils';

interface StudioResultsStepProps {
  resultImages: string[];
  workflowId: string | null;
  effectiveJewelryType: string;
  isProductShot: boolean;
  onAIFix: (prompt: string) => void;
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
      <div className="text-center">
        <span className="font-mono text-[9px] tracking-[0.3em] text-muted-foreground uppercase block mb-1">Complete</span>
        <h2 className="font-display text-4xl uppercase tracking-tight">Your Result{resultImages.length !== 1 ? 's' : ''}</h2>
      </div>

      {resultImages.length > 0 ? (
        <div ref={resultsContainerRef} className="flex flex-wrap justify-center gap-4 max-w-5xl mx-auto">
          {resultImages.map((url, i) => (
            <ResultImageItem key={i} url={url} index={i} workflowId={workflowId} jewelryType={effectiveJewelryType} naturalAspect />
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <p className="text-muted-foreground">No result images found. The workflow may still be processing.</p>
        </div>
      )}

      {/* Action area. While the coachmark is visible we lift this block above the
          rest of the page so the highlighted "Fix it with human" button sits on top. */}
      <div
        ref={actionAreaRef}
        className={cn(
          "relative mx-auto flex w-full max-w-[360px] flex-col gap-4 pt-2",
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
        <Button
          size="lg"
          onClick={() => { dismissCoachmarkForGeneration(); handleStartOver(); }}
          className="h-12 w-full gap-2 border-0 bg-gradient-to-r from-[hsl(var(--formanova-hero-accent))] to-[hsl(var(--formanova-glow))] px-6 font-display text-base uppercase tracking-wide text-background transition-opacity hover:opacity-90"
        >
          <Diamond className="h-4 w-4" />
          New Photoshoot
        </Button>
        <div className="flex items-center justify-center gap-3">
          <div ref={humanButtonRef} className="relative flex-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { dismissCoachmarkForGeneration(); onRequestHumanFix(); }}
              className={cn(
                "relative z-10 h-10 w-full gap-2 border-2 border-[hsl(var(--formanova-hero-accent))] px-3 font-mono text-[10px] uppercase tracking-wider text-[hsl(var(--formanova-hero-accent))] hover:bg-[hsl(var(--formanova-hero-accent))]/10 hover:text-[hsl(var(--formanova-hero-accent))]",
                coachmarkVisible && "shadow-[0_0_4px_hsl(var(--formanova-hero-accent)/0.10)]"
              )}
            >
              Fix it with human
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
            className="h-10 flex-1 gap-2 border-2 border-[hsl(var(--formanova-hero-accent))] bg-background px-3 font-mono text-[10px] uppercase tracking-wider text-[hsl(var(--formanova-hero-accent))] hover:bg-[hsl(var(--formanova-hero-accent))]/10 hover:text-[hsl(var(--formanova-hero-accent))]"
          >
            Fix it with AI
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
