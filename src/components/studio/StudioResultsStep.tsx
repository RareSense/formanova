import { useState } from 'react';
import { motion } from 'framer-motion';
import { Diamond } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResultImageItem } from '@/components/studio/ResultImageItem';
import { FeedbackModal } from '@/components/studio/FeedbackModal';
import { AIFixModal } from '@/components/studio/AIFixModal';
import { TO_SINGULAR } from '@/lib/jewelry-utils';
import { type FeedbackCategory } from '@/lib/feedback-api';
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
  onRequestHumanFix: () => void;
  jewelryUploadedUrl: string | null;
  jewelrySasUrl: string | null;
  jewelryImage: string | null;
  activeModelUrl: string | null;
  userEmail?: string | null;
  generationCost?: number | null;
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
}: StudioResultsStepProps) {
  const [aiFixOpen, setAiFixOpen] = useState(false);

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
        <div className="flex flex-wrap justify-center gap-4 max-w-5xl mx-auto">
          {resultImages.map((url, i) => (
            <ResultImageItem key={i} url={url} index={i} workflowId={workflowId} jewelryType={effectiveJewelryType} naturalAspect />
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <p className="text-muted-foreground">No result images found. The workflow may still be processing.</p>
        </div>
      )}

      <div className="relative z-40 mx-auto flex w-full max-w-[360px] flex-col gap-4 pt-2">
        <Button
          size="lg"
          onClick={handleStartOver}
          className="h-12 w-full gap-2 border-0 bg-gradient-to-r from-[hsl(var(--formanova-hero-accent))] to-[hsl(var(--formanova-glow))] px-6 font-display text-base uppercase tracking-wide text-background transition-opacity hover:opacity-90"
        >
          <Diamond className="h-4 w-4" />
          New Photoshoot
        </Button>
        <div className="flex items-center justify-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRequestHumanFix}
            className="h-10 flex-1 gap-2 border-2 border-[hsl(var(--formanova-hero-accent))] px-3 font-mono text-[10px] uppercase tracking-wider text-[hsl(var(--formanova-hero-accent))] hover:bg-[hsl(var(--formanova-hero-accent))]/10 hover:text-[hsl(var(--formanova-hero-accent))]"
          >
            Fix it with human
          </Button>
          <Button
            size="sm"
            onClick={() => setAiFixOpen(true)}
            className="h-10 flex-1 gap-2 border-2 border-[hsl(var(--formanova-hero-accent))] bg-background px-3 font-mono text-[10px] uppercase tracking-wider text-[hsl(var(--formanova-hero-accent))] hover:bg-[hsl(var(--formanova-hero-accent))]/10 hover:text-[hsl(var(--formanova-hero-accent))]"
          >
            Fix it with AI
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
