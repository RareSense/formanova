/**
 * The always-visible strip under the 3D view: weight, metal picker, target.
 *
 *   ⚖ 25.37 g · 16.31 dwt   [10K Yellow Gold ▾]   ✓ On target +1.5%
 *
 * It wraps instead of scrolling, so a 320 px phone shows every part of it.
 * Without a measured volume it says so; it never shows a figure it cannot
 * stand behind.
 */
import { AlertTriangle, Check, Scale } from 'lucide-react';

import { formatWeight, targetSummary } from '@/lib/metal-weight/format';
import { gramsFromVolume } from '@/lib/metal-weight/weight';
import { cn } from '@/lib/utils';

import { MetalSelect } from './MetalSelect';
import type { WeightViewProps } from './types';

export interface WeightBarProps extends WeightViewProps {
  /** Opens a fix for an off-target weight. Omit while there is nothing it can open. */
  onAdjust?: () => void;
}

export function WeightBar({ source, target, alloy, setAlloyId, requestedUnavailable = false, onAdjust }: WeightBarProps) {
  const grams = source.available ? gramsFromVolume(source.volumeMm3, alloy) : null;
  const summary = grams === null ? null : targetSummary(grams, target, alloy);
  const onTarget = summary?.status.kind === 'on';

  return (
    <div
      role="group"
      aria-label="Metal weight"
      data-metal-weight-bar
      className="flex min-h-11 w-full min-w-0 flex-shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-border bg-background px-3 py-1.5 font-mono text-[11px] text-foreground"
    >
      <Scale aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
      {grams === null ? (
        <span className="min-w-0 text-muted-foreground">
          Weight not available for this model
          <span className="text-muted-foreground/70"> ({source.available ? 'no usable volume' : source.reason})</span>
        </span>
      ) : (
        <>
          <span className="whitespace-nowrap font-semibold tabular-nums">{formatWeight(grams)}</span>
          <MetalSelect label="Metal" value={alloy.id} onChange={(id) => { if (id) setAlloyId(id); }} className="max-w-[13rem]" />
          {summary && (
            <span className={cn('inline-flex min-w-0 items-center gap-1', onTarget ? 'text-emerald-500' : 'text-amber-500')}>
              {onTarget
                ? <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                : <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />}
              {summary.text}
            </span>
          )}
          {summary && !onTarget && onAdjust && (
            <button
              type="button"
              onClick={onAdjust}
              className="h-7 border border-border px-4 text-[10px] uppercase tracking-wider transition-colors hover:bg-accent/40"
            >
              Adjust
            </button>
          )}
        </>
      )}
      {requestedUnavailable && <span className="text-muted-foreground">Requested metal unavailable</span>}
    </div>
  );
}

export default WeightBar;
