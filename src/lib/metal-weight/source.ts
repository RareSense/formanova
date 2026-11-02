/**
 * Where a model's metal volume comes from, and the target that goes with it.
 *
 * Volume is the only measured input to every weight on screen. In order:
 *   1. the version's metal_volume_mm3 (the toolkit's fused casting body);
 *   2. the run result's metal_volume_mm3;
 *   3. a run that predates the field: its estimated_metal_mass_g divided back
 *      by the density that mass was computed with, known only for a run this
 *      session started, because /result does not echo the density.
 * With none of those the weight is "not available", and the screen says so.
 *
 * Everything here reads untrusted payloads, so every value is checked rather
 * than cast.
 */
import { METAL_ALLOYS } from './alloys';
import { DEFAULT_TOLERANCE_PCT, MAX_WEIGHT_G, MIN_WEIGHT_G, isPositiveFinite, volumeFromMass, type WeightTarget } from './weight';

export const NO_VOLUME_REASON = 'model has no closed metal volume';
export const OUT_OF_RANGE_REASON = 'measured volume is out of range';

const LIGHTEST = Math.min(...METAL_ALLOYS.map((a) => a.density_g_cm3));
const HEAVIEST = Math.max(...METAL_ALLOYS.map((a) => a.density_g_cm3));

/**
 * A volume that weighs between 0.01 g and 10 kg in EVERY metal in the table,
 * so switching metal can never turn a shown weight into "not available".
 */
function isPlausibleVolume(volumeMm3: number): boolean {
  return (volumeMm3 * LIGHTEST) / 1000 >= MIN_WEIGHT_G && (volumeMm3 * HEAVIEST) / 1000 <= MAX_WEIGHT_G;
}

export type WeightSource =
  | { available: true; volumeMm3: number; from: 'version' | 'result' | 'mass' }
  | { available: false; reason: string };

export interface WeightSourceInput {
  versionVolumeMm3?: unknown;
  resultVolumeMm3?: unknown;
  resultMassG?: unknown;
  resultDensityGCm3?: unknown;
}

export function pickWeightSource(input: WeightSourceInput): WeightSource {
  const candidates: Array<[unknown, 'version' | 'result' | 'mass']> = [
    [input.versionVolumeMm3, 'version'],
    [input.resultVolumeMm3, 'result'],
    [volumeFromMass(input.resultMassG, input.resultDensityGCm3), 'mass'],
  ];
  let outOfRange = false;
  for (const [volume, from] of candidates) {
    if (!isPositiveFinite(volume)) continue;
    if (isPlausibleVolume(volume)) return { available: true, volumeMm3: volume, from };
    outOfRange = true;
  }
  return { available: false, reason: outOfRange ? OUT_OF_RANGE_REASON : NO_VOLUME_REASON };
}

/** A stored weight_target ({grams, tolerance_pct, alloy_id}), or null when it has no usable gram figure. */
export function readWeightTarget(raw: unknown): WeightTarget | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  if (!isPositiveFinite(record.grams)) return null;
  const tolerance = record.tolerance_pct;
  return {
    grams: record.grams,
    tolerancePct: typeof tolerance === 'number' && Number.isFinite(tolerance) && tolerance >= 0 ? tolerance : DEFAULT_TOLERANCE_PCT,
    alloyId: typeof record.alloy_id === 'string' && record.alloy_id ? record.alloy_id : null,
  };
}

/** What this session sent with a generate run, kept for the fallback and the display alloy. */
export interface SentMetal {
  workflowId: string;
  alloyId: string | null;
  densityGCm3: number | null;
  target: WeightTarget | null;
}

/** Everything the weight screens need for the model on screen, except the alloy choice. */
export interface MetalWeightInput {
  /** Which model the alloy choice belongs to: the version, else the run. */
  key: string | null;
  source: WeightSource;
  target: WeightTarget | null;
  requestedAlloyId: string | null;
}

export interface ShownVersionWeight {
  asset_id: string;
  source_workflow_id?: string | null;
  metal_volume_mm3?: unknown;
  weight_target?: unknown;
}

export function resolveMetalWeight({ shownVersion, workflowId, resultVolumeMm3, resultMassG, sent }: {
  shownVersion: ShownVersionWeight | null;
  workflowId: string | null;
  resultVolumeMm3: unknown;
  resultMassG: unknown;
  sent: SentMetal | null;
}): MetalWeightInput {
  // A run's own result describes only the version that run made; an earlier
  // version picked from the strip must never borrow it.
  const resultIsShown = !shownVersion || (!!workflowId && shownVersion.source_workflow_id === workflowId);
  const sentHere = resultIsShown && sent && sent.workflowId === workflowId ? sent : null;
  return {
    key: shownVersion?.asset_id ?? workflowId,
    source: pickWeightSource({
      versionVolumeMm3: shownVersion?.metal_volume_mm3,
      resultVolumeMm3: resultIsShown ? resultVolumeMm3 : null,
      resultMassG: resultIsShown ? resultMassG : null,
      resultDensityGCm3: sentHere?.densityGCm3,
    }),
    target: readWeightTarget(shownVersion?.weight_target) ?? sentHere?.target ?? null,
    requestedAlloyId: sentHere?.alloyId ?? null,
  };
}
