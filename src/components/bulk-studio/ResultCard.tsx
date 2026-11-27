/**
 * One result in the Bulk Studio queue: shimmer while preparing/rendering, the
 * image when done, and Upscale / Fix with AI / Fix with Human on every
 * completed card (always visible; no hover-only actions).
 */
import { AlertTriangle, Sparkles, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useAuthenticatedImage } from '@/hooks/useAuthenticatedImage';
import { useUpscaleLauncher } from '@/hooks/useUpscaleLauncher';
import { UpscaleControl } from '@/components/studio/UpscaleControl';
import { CreditPreflightModal } from '@/components/CreditPreflightModal';
import type { QueueView } from '@/hooks/useBulkQueue';

const MONO = 'font-mono text-[10px] uppercase tracking-wider';

const STATUS_LABEL: Record<QueueView['status'], string> = {
  preparing: 'Uploading',
  rendering: 'Rendering',
  completed: 'Ready',
  failed: 'Failed',
};

interface ResultCardProps {
  item: QueueView;
  onFixAI: () => void;
  onFixHuman: () => void;
  onUpscaled: (url: string) => void;
}

function aspectClass(ratio: string): React.CSSProperties {
  const [w, h] = ratio.split(':').map(Number);
  return w && h ? { aspectRatio: `${w} / ${h}` } : { aspectRatio: '3 / 4' };
}

export function ResultCard({ item, onFixAI, onFixHuman, onUpscaled }: ResultCardProps) {
  const src = useAuthenticatedImage(item.resultUrl);
  const upscale = useUpscaleLauncher();
  const done = item.status === 'completed' && !!item.resultUrl;
  const is4K = item.resolution === '4K' || !!item.upscaledUrl;
  const noun = item.isProductShot ? 'Scene' : 'Model';
  const label = `Piece ${item.pieceNumber} · ${item.assigneeName}`;

  return (
    <article className="flex min-w-0 flex-col border border-border bg-background" aria-label={label}>
      <div className="relative w-full overflow-hidden bg-muted" style={aspectClass(item.aspectRatio)}>
        {done && src ? (
          <img src={src} alt={label} className="h-full w-full object-cover" />
        ) : item.status === 'failed' ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-foreground/60">
            <AlertTriangle className="h-6 w-6" />
            <span className={MONO}>Couldn't generate</span>
          </div>
        ) : (
          <div className="h-full w-full animate-pulse bg-gradient-to-br from-muted via-background to-muted" />
        )}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {item.origin === 'fix' && <span className={`bg-background/90 px-1.5 py-0.5 ${MONO}`}>AI Fix</span>}
          {is4K && done && <span className={`bg-formanova-hero-accent px-1.5 py-0.5 text-primary-foreground ${MONO}`}>4K</span>}
          {item.humanReview && <span className={`bg-background/90 px-1.5 py-0.5 text-formanova-hero-accent ${MONO}`}>In Human Review</span>}
        </div>
      </div>

      <div className="flex flex-col gap-2 p-3">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className={`truncate ${MONO}`} title={label}>{label}</span>
          <span className={`shrink-0 ${MONO} ${item.status === 'failed' ? 'text-destructive' : 'text-foreground/50'}`}>
            {STATUS_LABEL[item.status]}
          </span>
        </div>
        {(item.status === 'preparing' || item.status === 'rendering') && (
          <Progress value={item.progress} className="h-1" aria-label={`${noun} shot ${item.progress}%`} />
        )}

        {done && (
          <div className="flex flex-col gap-2">
            {!is4K && (
              <UpscaleControl
                compact
                resultImageUrl={item.resultUrl}
                resolution={item.resolution}
                runStatus={upscale.status}
                error={upscale.error}
                onUpscale={(factor) => void upscale.launch({
                  imageUri: item.resultUrl!, resolution: item.resolution, factor,
                  isProductShot: item.isProductShot, jewelryType: item.category,
                  onCompleted: (imgs) => { if (imgs[0]) onUpscaled(imgs[0]); },
                })}
              />
            )}
            <div className="grid grid-cols-1 gap-2">
              <Button variant="outline" onClick={onFixAI} className={`h-10 px-3 ${MONO}`}>
                <Sparkles className="h-4 w-4" />
                Fix with AI
              </Button>
              <Button variant="outline" onClick={onFixHuman} disabled={item.humanReview} className={`h-10 px-3 ${MONO}`}>
                <UserCheck className="h-4 w-4" />
                {item.humanReview ? 'Requested' : 'Fix with Human'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {upscale.showInsufficientModal && upscale.preflightResult && (
        <CreditPreflightModal
          open
          onOpenChange={(o) => { if (!o) upscale.dismissModal(); }}
          estimatedCredits={upscale.preflightResult.estimatedCredits}
          currentBalance={upscale.preflightResult.currentBalance}
        />
      )}
    </article>
  );
}
