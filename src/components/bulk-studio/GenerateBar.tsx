/**
 * Bottom Generate bar: aspect ratio, resolution, batch cost, Results toggle and
 * the gold "Generate N Shots" CTA. Pieces without a model/scene are skipped,
 * never blocking the rest of the batch.
 */
import { Images, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AspectRatioPill, ResolutionPill, type Resolution } from '@/components/studio/OutputSettingsPills';
import creditCoinIcon from '@/assets/icons/credit-coin.webp';

const MONO = 'font-mono text-[10px] uppercase tracking-wider';

interface GenerateBarProps {
  aspectRatio: string;
  onAspectRatio: (v: string) => void;
  resolution: Resolution;
  onResolution: (v: Resolution) => void;
  cost: number | null;
  costLoading: boolean;
  cta: string;
  hint: string | null;
  canGenerate: boolean;
  submitting: boolean;
  onGenerate: () => void;
  /** Results toggle (hidden when the results panel is docked). */
  results?: { active: number; total: number; onOpen: () => void };
}

export function GenerateBar({
  aspectRatio, onAspectRatio, resolution, onResolution, cost, costLoading,
  cta, hint, canGenerate, submitting, onGenerate, results,
}: GenerateBarProps) {
  return (
    <div className="pointer-events-auto border-t border-border bg-background px-4 md:px-6 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <AspectRatioPill value={aspectRatio} onChange={onAspectRatio} />
          <ResolutionPill value={resolution} onChange={onResolution} />
          {results && results.total > 0 && (
            <Button variant="outline" onClick={results.onOpen} className={`h-10 px-4 xl:hidden ${MONO}`}>
              <Images className="h-4 w-4" />
              Results
              <span className="border border-border px-1.5 py-0.5 text-[9px]">
                {results.active ? `${results.active} rendering` : results.total}
              </span>
            </Button>
          )}
        </div>

        <div className="flex min-w-0 items-center gap-3 lg:ml-auto">
          <div className="flex min-w-0 flex-1 flex-col items-start lg:items-end">
            <span className="flex items-center gap-1 font-mono text-sm text-foreground" aria-live="polite">
              {costLoading && cost == null ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : (
                <>
                  <img src={creditCoinIcon} alt="" className="h-4 w-4 object-contain" />
                  {cost ?? '–'}
                  <span className={`${MONO} text-foreground/50`}>credits</span>
                </>
              )}
            </span>
            {hint && <span className={`truncate ${MONO} max-w-full text-foreground/50`}>{hint}</span>}
          </div>
          <Button
            disabled={!canGenerate || submitting}
            onClick={onGenerate}
            className="h-11 shrink-0 px-6 font-display text-lg uppercase tracking-wide text-primary-foreground bg-gradient-to-r from-[hsl(var(--formanova-hero-accent))] to-[hsl(var(--formanova-glow))] hover:opacity-90"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {cta}
          </Button>
        </div>
      </div>
    </div>
  );
}
