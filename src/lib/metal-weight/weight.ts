/**
 * Metal weight maths. Pure and unrounded: rounding happens only where a number
 * is shown (format.ts), so a weight converted twice never drifts.
 *
 * weight (g) = metal volume (mm³) × alloy density (g/cm³) ÷ 1000 (Stuller).
 * Gems are not in the volume: it is the fused casting body, metal only.
 */
import type { MetalAlloy } from './alloys';

/** One troy pennyweight in grams. */
export const GRAMS_PER_DWT = 1.55517384;

/** Metal removed by finishing and polishing, as CAD metals tables show it. */
export const FINISHING_LOSS = 0.05;

/** The request form's tolerance, and the one a stored target without one gets. */
export const DEFAULT_TOLERANCE_PCT = 5;

/**
 * The weights a piece can plausibly have. Under 0.01 g rounds to "0.00 g" and
 * over 10 kg is no jewellery anyone casts, so either one means the measured
 * volume is wrong: neither is ever shown as a weight.
 */
export const MIN_WEIGHT_G = 0.01;
export const MAX_WEIGHT_G = 10_000;

/** A target weight a piece could have: 0.01 g to 10 kg. */
export function isTargetGrams(value: unknown): value is number {
  return isPositiveFinite(value) && value >= MIN_WEIGHT_G && value <= MAX_WEIGHT_G;
}

/** A tolerance in 0–100 %; a missing or non-numeric one is the default 5 %. */
export function clampTolerancePct(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_TOLERANCE_PCT;
  return Math.min(100, Math.max(0, value));
}

/** A target weight in grams, held in the alloy it was set for (null: the displayed one). */
export interface WeightTarget {
  grams: number;
  tolerancePct: number;
  alloyId: string | null;
}

/** `deviation` is (weight − target) ÷ target, unrounded. */
export interface TargetStatus {
  kind: 'on' | 'over' | 'under';
  deviation: number;
}

export function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** Null for anything that is not a real, plausible weight: never NaN, never 0 g, never tonnes. */
export function gramsFromVolume(volumeMm3: number, alloy: Pick<MetalAlloy, 'density_g_cm3'>): number | null {
  if (!isPositiveFinite(volumeMm3) || !isPositiveFinite(alloy?.density_g_cm3)) return null;
  const grams = (volumeMm3 * alloy.density_g_cm3) / 1000;
  return grams >= MIN_WEIGHT_G && grams <= MAX_WEIGHT_G ? grams : null;
}

export const dwtFromGrams = (grams: number): number => grams / GRAMS_PER_DWT;
export const gramsFromDwt = (dwt: number): number => dwt * GRAMS_PER_DWT;
export const finishedGrams = (grams: number): number => grams * (1 - FINISHING_LOSS);

/** The volume behind a mass the backend computed with a known density. */
export function volumeFromMass(massG: unknown, densityGCm3: unknown): number | null {
  if (!isPositiveFinite(massG) || !isPositiveFinite(densityGCm3)) return null;
  const volume = (massG * 1000) / densityGCm3;
  return Number.isFinite(volume) ? volume : null;
}

/** The deviation as the screen shows it: percent to 1 dp. */
export const shownPercent = (deviation: number): number => Number((deviation * 100).toFixed(1));

/**
 * On target when the shown |deviation| ≤ tolerance, boundary included;
 * otherwise over or under. Decided on the shown percent, not the raw one, so
 * the word and the figure beside it can never disagree ("5.0% over" against a
 * 5% tolerance cannot happen).
 */
export function targetStatus(
  weightG: number,
  target: Pick<WeightTarget, 'grams' | 'tolerancePct'> | null,
): TargetStatus | null {
  if (!isPositiveFinite(weightG) || !target || !isPositiveFinite(target.grams)) return null;
  const deviation = (weightG - target.grams) / target.grams;
  if (!Number.isFinite(deviation)) return null;
  const shown = shownPercent(deviation);
  if (Math.abs(shown) <= clampTolerancePct(target.tolerancePct)) return { kind: 'on', deviation };
  return { kind: shown > 0 ? 'over' : 'under', deviation };
}
