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

/** Grams without trailing zeros, for targets people typed: "28 g", "28.5 g". */
export const formatGramsShort = (grams: number): string => `${Number(grams.toFixed(2))} g`;

/** "On target", "8% over target", "21.3% under target": decided on the same 1 dp figure. */
export function formatTargetStatus(status: TargetStatus): string {
  if (status.kind === 'on') return 'On target';
  return `${Math.abs(shownPercent(status.deviation))}% ${status.kind} target`;
}

/** "Target 28 g ±5%" */
export const formatTargetChip = (target: WeightTarget): string =>
  `Target ${formatGramsShort(target.grams)} ±${target.tolerancePct}%`;

/** The After polish header's tooltip. */
export const FINISHING_TOOLTIP = `About ${FINISHING_LOSS * 100}% lost in finishing`;

/**
 * The target status for the weight in the alloy on screen, short, with the
 * exact grams for its tooltip. When the shown metal is not the one the target
 * was set in, the tooltip says so: a different metal moving the weight is the
 * whole point of the preview.
 */
export function targetSummary(
  weightG: number,
  target: WeightTarget | null,
  alloy: MetalAlloy,
): { status: TargetStatus; text: string; detail: string } | null {
  if (!target) return null;
  const status = targetStatus(weightG, target);
  if (!status) return null;
  const targetAlloy = target.alloyId === null ? null : findAlloy(target.alloyId);
  const against = `against a ${formatGramsShort(target.grams)} target`;
  const tol = `(±${target.tolerancePct}%)`;
  const detail = targetAlloy && targetAlloy.id !== alloy.id
    ? `${formatGrams(weightG)} in ${alloy.name} ${against} set in ${targetAlloy.name} ${tol}`
    : `${formatGrams(weightG)} ${against} ${tol}`;
  return { status, text: formatTargetStatus(status), detail };
}

/** "14K Yellow Gold · 27.98 g (17.99 dwt)", or null when there is no weight to stand behind. */
export function metalWeightLine(source: WeightSource, alloy: MetalAlloy): string | null {
  if (!source.available) return null;
  const grams = gramsFromVolume(source.volumeMm3, alloy);
  return grams === null ? null : `${alloy.name} · ${formatGrams(grams)} (${formatDwt(dwtFromGrams(grams))})`;
}

/** Plain words for the toolkit's casting-check flags; unknown flags are humanised. */
const FLAG_WORDS = new Map<string, string>([
  ['thin_walls', 'thin walls'],
  ['touching_edges', 'touching edges'],
  ['self_intersections', 'self-intersections'],
  ['self_intersections_not_checked', 'self-intersections not checked'],
  ['stones_not_held', 'stones not held'],
]);

const flagWords = (flag: string): string =>
  FLAG_WORDS.get(flag) ?? flag.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

/** "Estimate. Casting check flagged: thin walls, touching edges.", or null when nothing was flagged. */
export function castingCheckLine(flags: readonly string[] | null | undefined): string | null {
  if (!flags?.length) return null;
  const words = [...new Set(flags.map(flagWords))].filter(Boolean);
  return words.length ? `Estimate. Casting check flagged: ${words.join(', ')}.` : null;
}

/** "25.4 g", for the small version and history tag. */
export const formatTagWeight = (grams: number): string => `${grams.toFixed(1)} g`;
