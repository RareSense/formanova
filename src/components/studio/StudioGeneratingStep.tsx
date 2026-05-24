/**
 * StudioGeneratingStep
 *
 * Pure render component for the 'generating' step of UnifiedStudio.
 * Displays a spinner, progress bar (model-shot) or rotating messages (product-shot),
 * thumbnail previews of the input images, and an error overlay when generation fails.
 *
 * Has NO state of its own — all values flow in as props from UnifiedStudio.
 */
import { motion, AnimatePresence } from 'framer-motion';
import { Gem, AlertTriangle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

type StudioStep = 'upload' | 'model' | 'generating' | 'results';

interface StudioGeneratingStepProps {
  isProductShot: boolean;
  generationStep: string;
  generationProgress: number;
  rotatingMsgIdx: number;
  jewelryImage: string | null;
  resolvedJewelryImage: string | null;
  activeModelUrl: string | null;
  resolvedActiveModelUrl: string | null;
  generationError: string | null;
  handleStartOver: () => void;
  onKeepBrowsing: () => void;
}

const PRODUCT_SHOT_MSGS = [
  'Analysing your jewelry...',
  'Matching inspiration style...',
  'Composing the scene...',
  'Rendering your shot...',
  'Almost there...',
];

const MODEL_SHOT_MSGS = [
  'Analysing your jewelry...',
  'Selecting the best pose...',
  'Placing jewelry on model...',
  'Refining the details...',
  'Almost there...',
];

export function StudioGeneratingStep({
  isProductShot,
  generationStep,
  generationProgress,
  rotatingMsgIdx,
  jewelryImage,
  resolvedJewelryImage,
  activeModelUrl,
  resolvedActiveModelUrl,
  generationError,
  handleStartOver,
  onKeepBrowsing,
}: StudioGeneratingStepProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center justify-center min-h-[70vh]"
    >
      {/* Dashed frame — centered on screen */}
      <div className="border border-dashed border-border/40 px-16 py-14 flex flex-col items-center w-full max-w-md">
        <div className="relative mb-8">
          <div className="w-24 h-24 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
          <Gem className="absolute inset-0 m-auto h-10 w-10 text-primary" />
        </div>

        <h2 className="font-display text-3xl uppercase tracking-tight mb-3">Generating</h2>

        {/* Both modes: rotating messages + time estimate */}
        {(() => {
          const msgs = isProductShot ? PRODUCT_SHOT_MSGS : MODEL_SHOT_MSGS;
          const isFetching = generationStep === 'Fetching results...';
          const displayMsg = isFetching
            ? 'Fetching result...'
            : msgs[Math.min(rotatingMsgIdx, msgs.length - 1)];
          return (
            <>
              <AnimatePresence mode="wait">
                <motion.p
                  key={displayMsg}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.4 }}
                  className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground uppercase mb-6 text-center"
                >
                  {displayMsg}
                </motion.p>
              </AnimatePresence>
              <p className="font-mono text-[10px] italic text-muted-foreground mb-8">This can take up to 90 seconds</p>
            </>
          );
        })()}

        <button
          onClick={onKeepBrowsing}
          className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.2em] uppercase text-foreground hover:text-foreground/70 transition-colors mb-6"
        >
          Keep browsing
          <ArrowRight className="h-3 w-3 shrink-0" />
        </button>

        <div className="flex gap-4">
          {jewelryImage && (
            <div className="w-16 h-16 border border-border/30 overflow-hidden">
              <img src={resolvedJewelryImage ?? undefined} alt="Jewelry" className="w-full h-full object-cover opacity-50" />
            </div>
          )}
          {activeModelUrl && (
            <div className="w-16 h-16 border border-border/30 overflow-hidden">
              <img src={resolvedActiveModelUrl ?? undefined} alt="Model" className="w-full h-full object-cover opacity-50" />
            </div>
          )}
        </div>

        {generationError && (
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center bg-background/60 backdrop-blur-sm"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="bg-card border border-border shadow-2xl max-w-md w-full mx-6 p-8 text-center"
              >
                <div className="mx-auto w-12 h-12 border border-border flex items-center justify-center mb-5">
                  <AlertTriangle className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="font-display text-lg uppercase tracking-[0.15em] text-foreground mb-3">
                  AI is overwhelmed
                </h3>
                <p className="font-mono text-[11px] leading-relaxed tracking-wide text-muted-foreground mb-4">
                  Due to a high number of requests, AI is overwhelmed. This is temporary. Do not worry. Please try again in a few hours. Thanks.
                </p>
                <p className="font-mono text-[11px] leading-relaxed tracking-wide text-muted-foreground mb-6">
                  If this does not resolve, please contact{' '}
                  <a
                    href="mailto:studio@formanova.ai"
                    className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                  >
                    studio@formanova.ai
                  </a>
                  .
                </p>
                <Button
                  onClick={handleStartOver}
                  className="w-full font-mono text-[11px] tracking-[0.2em] uppercase"
                >
                  Got It
                </Button>
              </motion.div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );
}
