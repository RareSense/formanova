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

/** Null for anything that is not a real, positive volume: never NaN, never 0 g. */
export function gramsFromVolume(volumeMm3: number, alloy: Pick<MetalAlloy, 'density_g_cm3'>): number | null {
  if (!isPositiveFinite(volumeMm3) || !isPositiveFinite(alloy?.density_g_cm3)) return null;
  const grams = (volumeMm3 * alloy.density_g_cm3) / 1000;
  return Number.isFinite(grams) ? grams : null;
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

// A weight that sits on the boundary in decimal (21 g against 20 g ±5%) can
// land a hair outside it in binary. The boundary is on target, so it gets this.
const BOUNDARY_EPSILON = 1e-9;

/** On target when |deviation| ≤ tolerance, boundary included; otherwise over or under. */
export function targetStatus(
  weightG: number,
  target: Pick<WeightTarget, 'grams' | 'tolerancePct'> | null,
): TargetStatus | null {
  if (!isPositiveFinite(weightG) || !target || !isPositiveFinite(target.grams)) return null;
  const pct = Number.isFinite(target.tolerancePct) && target.tolerancePct >= 0 ? target.tolerancePct : DEFAULT_TOLERANCE_PCT;
  const deviation = (weightG - target.grams) / target.grams;
  if (Math.abs(deviation) <= pct / 100 + BOUNDARY_EPSILON) return { kind: 'on', deviation };
  return { kind: deviation > 0 ? 'over' : 'under', deviation };
}
