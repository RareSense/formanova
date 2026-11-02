/**
 * The request form's "Metal & weight" step: the metal to build and weigh the
 * piece in, and an optional target weight with a tolerance. Three equal
 * controls on one grid (one row on desktop, stacked on phone), all h-10:
 *
 *   Metal [● 14K Yellow Gold ▾]   Target weight [ 25 ][ g | dwt ]   Tolerance (±%) [ 5 ]
 *   Optional. The model is built to land within this range.
 *
 * The target can be typed in grams or pennyweight; it is always held in grams.
 * Switching the unit converts the number on screen and leaves the grams alone.
 */
import { useId, useState } from 'react';

import MaterialSphere from '@/components/cad-studio/MaterialSphere';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ALLOY_GROUPS, type MetalAlloy } from '@/lib/metal-weight/alloys';
import type { MetalRequest } from '@/lib/metal-weight/request';
import { DEFAULT_TOLERANCE_PCT, clampTolerancePct, dwtFromGrams, gramsFromDwt, isPositiveFinite, isTargetGrams } from '@/lib/metal-weight/weight';
import { cn } from '@/lib/utils';

import { appearanceForAlloy } from './appearance';

type Unit = 'g' | 'dwt';

/** Radix Select cannot hold an empty value, so "no metal" has its own. */
const NONE = 'none';
const LABEL = 'text-sm text-foreground';
const FIELD = 'h-10 font-mono text-[13px]';

/** A positive number typed in a field, or null. */
function readPositive(text: string): number | null {
  const n = Number(text);
  return text.trim() !== '' && isPositiveFinite(n) ? n : null;
}

function Swatch({ alloy }: { alloy: MetalAlloy }) {
  return (
    <span data-metal-swatch className="inline-flex shrink-0">
      <MaterialSphere category="metal" preview={appearanceForAlloy(alloy).preview} size={14} />
    </span>
  );
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
      <legend className="mb-2 block text-[15px] font-medium text-foreground">Metal &amp; weight</legend>
      <div data-testid="metal-weight-grid" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={`${ids}-metal`} className={LABEL}>Metal</label>
          <Select
            value={value.alloyId ?? NONE}
            onValueChange={(id) => onChange({ ...value, alloyId: id === NONE ? null : id })}
            disabled={disabled}
          >
            <SelectTrigger id={`${ids}-metal`} aria-label="Metal" className={FIELD}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE} className="font-mono text-[12px]">Not set</SelectItem>
              {ALLOY_GROUPS.map((group) => (
                <SelectGroup key={group.family}>
                  <SelectLabel className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{group.label}</SelectLabel>
                  {group.alloys.map((alloy) => (
                    <SelectItem key={alloy.id} value={alloy.id} className="font-mono text-[12px]">
                      <span className="flex items-center gap-2">
                        <Swatch alloy={alloy} />
                        {alloy.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={`${ids}-target`} className={LABEL}>Target weight</label>
          <div className="flex min-w-0 gap-2">
            <Input
              id={`${ids}-target`}
              type="number"
              inputMode="decimal"
              min="0"
              max="10000"
              step="0.01"
              placeholder="—"
              value={targetText}
              onChange={(e) => { setTargetText(e.target.value); emitTarget(e.target.value, unit, toleranceText); }}
              className={cn(FIELD, 'min-w-0 flex-1')}
            />
            <div role="group" aria-label="Weight unit" className="flex w-28 shrink-0 overflow-hidden rounded-md border border-input">
              {(['g', 'dwt'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  aria-pressed={unit === u}
                  onClick={() => switchUnit(u)}
                  className={cn(
                    'h-10 flex-1 font-mono text-[13px] transition-colors',
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
          <label htmlFor={`${ids}-tolerance`} className={LABEL}>Tolerance (±%)</label>
          <Input
            id={`${ids}-tolerance`}
            type="number"
            inputMode="decimal"
            min="0"
            max="100"
            step="0.5"
            value={toleranceText}
            onChange={(e) => { setToleranceText(e.target.value); emitTarget(targetText, unit, e.target.value); }}
            className={FIELD}
          />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">Optional. The model is built to land within this range.</p>
    </fieldset>
  );
}

export default MetalWeightStep;
