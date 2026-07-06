/**
 * EffortToggle
 *
 * Standard <-> High effort switch for Step 1 of the studio.
 *
 * Design (per product spec):
 * - The state word lives INSIDE the track ("Low" when off, "High" when on),
 *   sitting in the space opposite the knob (mirrors a native OFF/ON switch).
 * - When ON (High), the track gets a `primary` border + glow so it pops on screen.
 *   Uses the theme `primary` token (not a fixed colour) so it adapts across all
 *   12 themes.
 * - A small mono "Effort" field label sits to the left, consistent with the
 *   "SHOW ALL" control it aligns to.
 */
import { cn } from '@/lib/utils';

export type EffortLevel = 'standard' | 'high';

interface EffortToggleProps {
  value: EffortLevel;
  onChange: (v: EffortLevel) => void;
  className?: string;
}

export function EffortToggle({ value, onChange, className }: EffortToggleProps) {
  const on = value === 'high';
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Effort
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`Effort mode: ${on ? 'High' : 'Low'}`}
        onClick={() => onChange(on ? 'standard' : 'high')}
        className={cn(
          'relative inline-flex h-7 w-[120px] shrink-0 items-center rounded-full border transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          on
            ? 'border-primary bg-primary/10 shadow-[0_0_16px_-4px_hsl(var(--primary)/0.5)]'
            : 'border-border/60 bg-muted',
        )}
      >
        {/* State word inside the track, centred in the space opposite the knob */}
        <span
          className={cn(
            'pointer-events-none absolute inset-y-0 flex items-center justify-center font-mono text-[10px] font-bold uppercase tracking-widest transition-all',
            on ? 'left-0 right-7 text-primary' : 'left-7 right-0 text-muted-foreground',
          )}
        >
          {on ? 'High' : 'Low'}
        </span>
        {/* Knob */}
        <span
          className={cn(
            'pointer-events-none absolute left-1 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-background shadow transition-transform',
            on ? 'translate-x-[92px]' : 'translate-x-0',
          )}
        />
      </button>
    </div>
  );
}
