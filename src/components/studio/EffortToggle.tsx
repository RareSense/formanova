/**
 * EffortToggle
 *
 * Low <-> High effort selector for Step 1 of the studio.
 *
 * Design:
 * - A two-segment control: "Low" and "High" are both always visible and centered
 *   in their own segment, so the choice reads at a glance (clearer than a single
 *   word opposite a knob).
 * - The active segment is filled; High uses the theme `primary` token + glow so it
 *   pops, and adapts across all 12 themes. Low uses a neutral raised fill.
 * - A mono "Effort" field label sits to the left, consistent with the "SHOW ALL"
 *   control it aligns to.
 */
import { cn } from '@/lib/utils';

export type EffortLevel = 'low' | 'high';

interface EffortToggleProps {
  value: EffortLevel;
  onChange: (v: EffortLevel) => void;
  className?: string;
}

const LEVELS: EffortLevel[] = ['low', 'high'];

export function EffortToggle({ value, onChange, className }: EffortToggleProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="font-mono text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
        Effort
      </span>
      <div
        role="radiogroup"
        aria-label="Effort mode"
        className="inline-flex items-center gap-0.5 rounded-full border border-border/60 bg-muted p-0.5"
      >
        {LEVELS.map((level) => {
          const active = value === level;
          return (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(level)}
              className={cn(
                'flex h-6 min-w-[48px] items-center justify-center rounded-full px-3',
                'font-mono text-[11px] font-bold uppercase tracking-widest transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
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
  );
}
