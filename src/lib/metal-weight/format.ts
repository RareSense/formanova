/**
 * The words and figures the weight screens show. Rounding lives here and only
 * here: grams and pennyweight to 2 dp, percent to 1 dp (the compact history tag
 * shows grams to 1 dp). Every input is an unrounded value from weight.ts.
 */
import { findAlloy, type MetalAlloy } from './alloys';
import type { WeightSource } from './source';
import { FINISHING_LOSS, dwtFromGrams, gramsFromVolume, shownPercent, targetStatus, type TargetStatus, type WeightTarget } from './weight';

const MINUS = '−';

export const formatFixed2 = (value: number): string => value.toFixed(2);
export const formatGrams = (grams: number): string => `${formatFixed2(grams)} g`;
export const formatDwt = (dwt: number): string => `${formatFixed2(dwt)} dwt`;

/** "25.37 g · 16.31 dwt" */
export const formatWeight = (grams: number): string => `${formatGrams(grams)} · ${formatDwt(dwtFromGrams(grams))}`;

/** "+1.5%", "−14.6%"; anything that rounds to zero reads "0.0%". */
export function formatPercent(fraction: number): string {
  const pct = shownPercent(fraction);
  if (pct === 0) return '0.0%';
  return `${pct > 0 ? '+' : MINUS}${Math.abs(pct).toFixed(1)}%`;
}

/** "On target (+1.5%)", "14.6% over", "3.0% under" */
export function formatTargetStatus(status: TargetStatus): string {
  if (status.kind === 'on') return `On target (${formatPercent(status.deviation)})`;
  return `${Math.abs(shownPercent(status.deviation)).toFixed(1)}% ${status.kind}`;
}

/** "(−5%)", after "Finished". */
export const FINISHING_NOTE_SHORT = `(${MINUS}${FINISHING_LOSS * 100}%)`;

/**
 * The target status for the weight in the alloy on screen. When that alloy is
 * not the one the target was set in, the text says which metal it compares,
 * because a different metal moving the weight is the whole point of the preview.
 */
export function targetSummary(
  weightG: number,
  target: WeightTarget | null,
  alloy: MetalAlloy,
): { status: TargetStatus; text: string } | null {
  if (!target) return null;
  const status = targetStatus(weightG, target);
  if (!status) return null;
  const otherAlloy = target.alloyId !== null && findAlloy(target.alloyId)?.id !== alloy.id;
  const text = formatTargetStatus(status);
  return { status, text: otherAlloy ? `${text} in ${alloy.label}` : text };
}

/** "Metal: 10K Yellow Gold · Est. 25.37 g · 16.31 dwt", or null when there is no weight to stand behind. */
export function metalWeightLine(source: WeightSource, alloy: MetalAlloy): string | null {
  if (!source.available) return null;
  const grams = gramsFromVolume(source.volumeMm3, alloy);
  return grams === null ? null : `Metal: ${alloy.label} · Est. ${formatWeight(grams)}`;
}

/** "25.4 g", for the small version and history tag. */
export const formatTagWeight = (grams: number): string => `${grams.toFixed(1)} g`;
