/**
 * StudioResultsStep
 *
 * Pure render component for the 'results' step of UnifiedStudio.
 * Displays result images in a flex grid, New Photoshoot / Regenerate action
 * buttons, and the optional feedback link + FeedbackModal.
 *
 * Generation values flow in as props from UnifiedStudio; local state is limited
 * to transient, client-only coachmark visibility.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Diamond } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ResultImageItem } from '@/components/studio/ResultImageItem';
import { FeedbackModal } from '@/components/studio/FeedbackModal';
import { AIFixModal } from '@/components/studio/AIFixModal';
import { PostGenerationCoachmark } from '@/components/studio/PostGenerationCoachmark';
import { getTooltipExperimentVariant, trackTooltipShown, trackFeedbackModalOpened, hasClickedFixButton, markFixButtonClicked } from '@/lib/posthog-events';
import { TO_SINGULAR } from '@/lib/jewelry-utils';
import { type FeedbackCategory, checkHasSubmittedFeedback } from '@/lib/feedback-api';
import creditCoinIcon from '@/assets/icons/credit-coin.png';

interface StudioResultsStepProps {
  resultImages: string[];
  workflowId: string | null;
  effectiveJewelryType: string;
  isProductShot: boolean;
  onAIFix: (prompt: string) => void;
  handleStartOver: () => void;
  feedbackOpen: boolean;
  setFeedbackOpen: (open: boolean) => void;
  jewelryUploadedUrl: string | null;
  jewelrySasUrl: string | null;
  jewelryImage: string | null;
  activeModelUrl: string | null;
  userEmail?: string | null;
  generationCost?: number | null;
  isFirstGeneration?: boolean;
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
  jewelryUploadedUrl,
  jewelrySasUrl,
  jewelryImage,
  activeModelUrl,
  userEmail,
  generationCost,
  isFirstGeneration = false,
}: StudioResultsStepProps) {
  const [fixButtonEverClicked, setFixButtonEverClicked] = useState(() => hasClickedFixButton());
  const [tooltipReady, setTooltipReady] = useState<'loading' | 'show' | 'blocked'>(() =>
    hasClickedFixButton() ? 'blocked' : 'loading'
  );
  const isTreatment = getTooltipExperimentVariant() === 'treatment';
  const showTooltip = isTreatment && tooltipReady === 'show';

  useEffect(() => {
    if (tooltipReady !== 'loading') return;
    checkHasSubmittedFeedback().then(hasSubmitted => {
      if (hasSubmitted) {
        markFixButtonClicked();
        setFixButtonEverClicked(true);
        setTooltipReady('blocked');
      } else {
        setTooltipReady('show');
      }
    });
  }, []);

  useEffect(() => {
    if (showTooltip) trackTooltipShown();
  }, [showTooltip]);
  const humanButtonLabel = 'Fix with human';
  const [aiFixOpen, setAiFixOpen] = useState(false);
  const [coachmarkVisible, setCoachmarkVisible] = useState(false);
  const [coachmarkDismissSignal, setCoachmarkDismissSignal] = useState(0);
  const actionAreaRef = useRef<HTMLDivElement>(null);
  const humanButtonRef = useRef<HTMLDivElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const generationKey = useMemo(
    () => workflowId ?? resultImages[0] ?? '',
    [workflowId, resultImages[0]],
  );

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

      {/* Action buttons directly under results */}
      <div
        ref={actionAreaRef}
        className={cn(
          "relative mx-auto flex w-full max-w-[360px] flex-col gap-4 pt-2",
          coachmarkVisible ? "z-[70]" : "z-40",
        )}
      >
        <PostGenerationCoachmark
          enabled={showTooltip && resultImages.length > 0}
          generationKey={generationKey}
          dismissSignal={coachmarkDismissSignal}
          targetRef={humanButtonRef}
          anchorRef={actionAreaRef}
          observeRef={resultsContainerRef}
          onVisibilityChange={setCoachmarkVisible}
          onPermanentDismiss={() => { markFixButtonClicked(); setFixButtonEverClicked(true); }}
        />
        <Button
          size="lg"
          onClick={handleStartOver}
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
              onClick={() => {
                markFixButtonClicked();
                setFixButtonEverClicked(true);
                dismissCoachmarkForGeneration();
                setFeedbackOpen(true);
                trackFeedbackModalOpened({
                  category: TO_SINGULAR[effectiveJewelryType] ?? effectiveJewelryType,
                  workflow_id: workflowId,
                  via_tooltip: coachmarkVisible,
                });
              }}
              className={cn(
                "relative z-10 h-10 w-full gap-2 border-2 border-[hsl(var(--formanova-hero-accent))] px-3 font-mono text-[10px] uppercase tracking-wider text-[hsl(var(--formanova-hero-accent))] hover:bg-[hsl(var(--formanova-hero-accent))]/10 hover:text-[hsl(var(--formanova-hero-accent))]",
                coachmarkVisible && "shadow-[0_0_4px_hsl(var(--formanova-hero-accent)/0.10)]"
              )}
            >
              {humanButtonLabel}
            </Button>
          </div>
          <Button
            size="sm"
            onClick={() => {
              dismissCoachmarkForGeneration();
              setAiFixOpen(true);
            }}
            className="h-10 flex-1 gap-2 border-2 border-[hsl(var(--formanova-hero-accent))] bg-background px-3 font-mono text-[10px] uppercase tracking-wider text-[hsl(var(--formanova-hero-accent))] hover:bg-[hsl(var(--formanova-hero-accent))]/10 hover:text-[hsl(var(--formanova-hero-accent))]"
          >
            Fix with AI
            <span className="ml-1 flex items-center gap-1 text-xs normal-case tracking-normal opacity-70">
              <img src={creditCoinIcon} alt="" className="h-4 w-4 object-contain" /> {generationCost ?? 10}
            </span>
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
