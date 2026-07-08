/**
 * EffortIntroModal
 *
 * First-time-only popup shown when a user enters Step 1 of the studio (model or
 * product shot). Lets them pick Low (standard) vs High effort up front; the choice
 * is saved to the same studio effort toggle (localStorage 'formanova_studio_effort'),
 * so it is not a separate setting. A "Don't show this again" checkbox (default on)
 * suppresses it for good. Users can always change effort later via the in-studio
 * EffortToggle.
 *
 * Presentation only: the parent (UnifiedStudio) owns the seen-flag + persistence.
 *
 * Layout: a single centered column with equal horizontal padding on every row, so
 * the two divider rules, the title/subtitle, the effort selector, the checkbox and
 * the CTA all share one alignment spine. Colors come from theme tokens (primary for
 * the active High segment + CTA), so it reads correctly across all 12 themes.
 */
import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Info, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EffortLevel } from '@/components/studio/EffortToggle';

interface Props {
  open: boolean;
  defaultEffort: EffortLevel;
  onConfirm: (effort: EffortLevel, dontShowAgain: boolean) => void;
}

const LEVELS: EffortLevel[] = ['low', 'high'];

export function EffortIntroModal({ open, defaultEffort, onConfirm }: Props) {
  const [selected, setSelected] = useState<EffortLevel>(defaultEffort);
  const [dontShowAgain, setDontShowAgain] = useState(true);

  const confirm = () => onConfirm(selected, dontShowAgain);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) confirm(); }}>
      <DialogContent className="max-w-lg w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto p-0 rounded-none sm:rounded-none shadow-none">
        <div className="flex flex-col px-6 sm:px-12 pt-12 pb-10">
          {/* Title */}
          <DialogTitle className="text-center font-display text-2xl sm:text-3xl uppercase tracking-wide leading-[1.15] [text-shadow:none]">
            Do you want to generate with low effort or high effort?
          </DialogTitle>

          {/* Subtitle */}
          <p className="mx-auto mt-5 max-w-sm text-center text-sm sm:text-base leading-relaxed text-muted-foreground">
            High effort means we try more to make a better image, but also cost you more.
          </p>

          {/* Effort selector — label + segmented pill, centered as one unit.
              Wraps to two centered rows only on the narrowest phones. */}
          <div className="mt-9 flex flex-wrap items-center justify-center gap-x-4 gap-y-3 sm:gap-5">
            <span className="font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Effort
            </span>
            <div
              role="radiogroup"
              aria-label="Effort mode"
              className="inline-flex items-center rounded-full border border-border/60 bg-muted p-1"
            >
              {LEVELS.map((level) => {
                const active = selected === level;
                return (
                  <button
                    key={level}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setSelected(level)}
                    className={cn(
                      'min-w-[84px] sm:min-w-[100px] rounded-full px-5 sm:px-6 py-2.5 text-sm font-bold uppercase tracking-widest transition-all',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      active
                        ? level === 'high'
                          ? 'bg-primary text-primary-foreground shadow-[0_0_16px_-4px_hsl(var(--primary)/0.6)]'
                          : 'bg-background text-foreground shadow'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {level === 'high' ? 'High' : 'Low'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Helper line */}
          <div className="mt-4 flex items-center justify-center gap-2">
            <Info className="h-4 w-4 shrink-0 text-primary" />
            <span className="text-sm text-muted-foreground">You can always change this setting in Studio.</span>
          </div>

          {/* Don't show again */}
          <button
            type="button"
            onClick={() => setDontShowAgain((v) => !v)}
            className="group mx-auto mt-9 flex items-center gap-3 focus:outline-none"
          >
            <span
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center border-2 transition-colors',
                dontShowAgain
                  ? 'border-primary bg-primary'
                  : 'border-foreground/40 bg-background group-hover:border-primary',
              )}
            >
              {dontShowAgain && <Check className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={3} />}
            </span>
            <span className="text-sm text-foreground">Don't show this again</span>
          </button>

          {/* CTA */}
          <Button size="lg" className="mt-6 h-12 w-full text-base font-semibold" onClick={confirm}>
            Continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
