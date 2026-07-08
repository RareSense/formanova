/**
 * EffortIntroModal
 *
 * First-time-only popup shown when a user enters the model-shot studio. Lets them
 * pick Low (standard) vs High effort up front; the choice is saved to the same
 * studio effort toggle (localStorage 'formanova_studio_effort'), so it is not a
 * separate setting. A "Don't show this again" checkbox (default on) suppresses it
 * for good. Users can always change effort later via the in-studio EffortToggle.
 *
 * Presentation only: the parent (UnifiedStudio) owns the seen-flag + persistence.
 * Matches the existing guide-modal dialog design (see ProductShotGuideModal).
 */
import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles, Zap } from 'lucide-react';
import type { EffortLevel } from '@/components/studio/EffortToggle';

interface Props {
  open: boolean;
  defaultEffort: EffortLevel;
  onConfirm: (effort: EffortLevel, dontShowAgain: boolean) => void;
}

interface OptionCardProps {
  active: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  label: string;
  description: string;
  highlight?: boolean;
}

function OptionCard({ active, onSelect, icon, label, description, highlight }: OptionCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={`flex flex-col items-start gap-2 p-4 border-2 text-left transition-all focus:outline-none
        ${active
          ? highlight
            ? 'border-primary bg-primary/5 shadow-[0_0_16px_-6px_hsl(var(--primary)/0.6)]'
            : 'border-foreground bg-foreground/5'
          : 'border-border/60 hover:border-foreground/40'}`}
    >
      <div className="flex items-center gap-2">
        <span className={active && highlight ? 'text-primary' : 'text-foreground'}>{icon}</span>
        <span className="font-display text-lg uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-sm text-muted-foreground leading-snug">{description}</p>
    </button>
  );
}

export function EffortIntroModal({ open, defaultEffort, onConfirm }: Props) {
  const [selected, setSelected] = useState<EffortLevel>(defaultEffort);
  const [dontShowAgain, setDontShowAgain] = useState(true);

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="w-[calc(100vw-2rem)] max-w-md p-0 flex flex-col overflow-hidden gap-0 [&>button:last-of-type]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-border">
          <DialogTitle className="font-display text-xl sm:text-2xl uppercase tracking-wide">
            Standard or high effort?
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
            High effort means we try more to make a better image, but it also costs you more.
          </p>
        </div>

        {/* Options */}
        <div className="px-5 sm:px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <OptionCard
            active={selected === 'low'}
            onSelect={() => setSelected('low')}
            icon={<Zap className="h-5 w-5" />}
            label="Low"
            description="Standard effort. Faster and costs less."
          />
          <OptionCard
            active={selected === 'high'}
            onSelect={() => setSelected('high')}
            icon={<Sparkles className="h-5 w-5" />}
            label="High"
            description="We try harder for a better image. Costs more."
            highlight
          />
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-4 border-t border-border flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setDontShowAgain((v) => !v)}
            className="inline-flex items-center gap-2 focus:outline-none group"
          >
            <span className={`h-5 w-5 shrink-0 border-2 flex items-center justify-center transition-colors
              ${dontShowAgain ? 'bg-primary border-primary' : 'bg-background border-foreground group-hover:border-primary'}`}>
              {dontShowAgain && (
                <svg className="h-3 w-3 text-primary-foreground" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span className="text-sm text-muted-foreground leading-snug">Don't show this again</span>
          </button>
          <Button size="default" className="min-w-[110px]" onClick={() => onConfirm(selected, dontShowAgain)}>
            Continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
