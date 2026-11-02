/**
 * The request form's "Metal & weight" step: which metal to build and weigh the
 * piece in, and an optional target weight with a tolerance.
 *
 * The target can be typed in grams or pennyweight; it is always held in grams.
 * Switching the unit converts the number on screen and leaves the grams alone.
 */
import { useId, useState } from 'react';

import type { MetalRequest } from '@/lib/metal-weight/request';
import { DEFAULT_TOLERANCE_PCT, clampTolerancePct, dwtFromGrams, gramsFromDwt, isPositiveFinite, isTargetGrams } from '@/lib/metal-weight/weight';
import { cn } from '@/lib/utils';

import { MetalSelect } from './MetalSelect';

type Unit = 'g' | 'dwt';

const INPUT = 'h-11 border border-border bg-background px-3 font-mono text-[14px] text-foreground outline-none transition-colors focus:border-foreground/60 focus:ring-1 focus:ring-border';

/** A positive number typed in a field, or null. */
function readPositive(text: string): number | null {
  const n = Number(text);
  return text.trim() !== '' && isPositiveFinite(n) ? n : null;
}

export interface MetalWeightStepProps {
  value: MetalRequest;
  onChange: (next: MetalRequest) => void;
  disabled?: boolean;
}

export function MetalWeightStep({ value, onChange, disabled = false }: MetalWeightStepProps) {
  const ids = useId();
  const [unit, setUnit] = useState<Unit>('g');
  const [targetText, setTargetText] = useState(() => (value.target ? value.target.grams.toFixed(2) : ''));
  const [toleranceText, setToleranceText] = useState(() => String(value.target?.tolerancePct ?? DEFAULT_TOLERANCE_PCT));

  const emitTarget = (text: string, inUnit: Unit, tolText: string) => {
    const typed = readPositive(text);
    const tolerancePct = clampTolerancePct(tolText.trim() === '' ? NaN : Number(tolText));
    const grams = typed === null ? null : inUnit === 'g' ? typed : gramsFromDwt(typed);
    onChange({ ...value, target: isTargetGrams(grams) ? { grams, tolerancePct } : null });
  };

  const switchUnit = (next: Unit) => {
    if (next === unit) return;
    const typed = readPositive(targetText);
    if (typed !== null) {
      const grams = unit === 'g' ? typed : gramsFromDwt(typed);
      setTargetText((next === 'g' ? grams : dwtFromGrams(grams)).toFixed(2));
    }
    setUnit(next);
  };

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-2">
      <legend className="block text-[15px] font-medium text-foreground">
        Metal &amp; weight <span className="font-normal">(optional)</span>
      </legend>
      <p className="text-sm text-muted-foreground">
        Choose the metal, and a target weight if the piece has to hit one.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={`${ids}-metal`} className="text-sm text-foreground">Metal</label>
          <MetalSelect
            id={`${ids}-metal`}
            label="Metal"
            noneLabel="Not set"
            value={value.alloyId}
            onChange={(alloyId) => onChange({ ...value, alloyId })}
            className="h-11 w-full text-[13px] sm:w-64"
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={`${ids}-target`} className="text-sm text-foreground">Target weight</label>
          <div className="flex">
            <input
              id={`${ids}-target`}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="—"
              value={targetText}
              onChange={(e) => { setTargetText(e.target.value); emitTarget(e.target.value, unit, toleranceText); }}
              className={cn(INPUT, 'w-28 min-w-0')}
            />
            <div role="group" aria-label="Weight unit" className="flex">
              {(['g', 'dwt'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  aria-pressed={unit === u}
                  onClick={() => switchUnit(u)}
                  className={cn(
                    'h-11 border border-l-0 border-border px-4 font-mono text-[12px] transition-colors',
                    unit === u ? 'bg-foreground text-background' : 'bg-background text-muted-foreground hover:text-foreground',
                  )}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={`${ids}-tolerance`} className="text-sm text-foreground">Tolerance (±%)</label>
          <input
            id={`${ids}-tolerance`}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.5"
            value={toleranceText}
            onChange={(e) => { setToleranceText(e.target.value); emitTarget(targetText, unit, e.target.value); }}
            className={cn(INPUT, 'w-24')}
          />
        </div>
      </div>
    </fieldset>
  );
}

export default MetalWeightStep;
