import { CLOSED_ENOUGH, measureRing, meshVolume, type Axis } from './measure';
import { formatSchedule, stoneSchedule, stonesOnLayers, type PartBox, type StoneGroup } from './stones';
import { formatWeight } from './metals';
import { formatLength, formatRingSizeIn, type LengthUnit, type SizeSystem } from './sizes';
import type { CadReading, UnitKey } from './model';

/** Millimeters per file unit. */
const MM_PER: Record<string, number> = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8, um: 0.001 };

/** A value measured from the model, or the reason it could not be. */
export type Measured = { value: string } | { value: null; why: string };

export interface AutoValues {
  ringSize: Measured;
  band: Measured;
  stones: Measured;
  weight: Measured;
  /** The stone groups behind `stones`, for the sheet's stone schedule rows. */
  groups?: StoneGroup[];
}

/** The slow part, done once per file: numbers in file units, or why each is missing. */
export interface RawMeasure {
  ring: { innerDiameter: number; bandWidth: number; bandThickness: number } | null;
  ringWhy: string;
  volume: number | null;
  volumeWhy: string;
}

const NO_MESH = 'Not measured: this file has no display meshes. Type it in.';
export const NO_RING = 'Not a ring, or no finger hole found. Type it in if needed.';
const OPEN = 'Not measured: the metal is not one closed solid, so its volume would be a guess. Type it in.';

export function measureRaw(r: CadReading, metal: Float32Array): RawMeasure {
  if (metal.length === 0) return { ring: null, ringWhy: NO_MESH, volume: null, volumeWhy: NO_MESH };
  const m = measureRing(metal, r.upAxis === 'z' ? 2 : (1 as Axis));
  const { mm3, closed } = meshVolume(metal);
  return {
    ring: m ? { innerDiameter: m.innerDiameterMm, bandWidth: m.bandWidthMm, bandThickness: m.bandThicknessMm } : null,
    ringWhy: NO_RING,
    volume: closed >= CLOSED_ENOUGH ? mm3 : null,
    volumeWhy: OPEN,
  };
}

export interface FormatChoice {
  units: UnitKey | null;
  density: number;
  system: SizeSystem;
  length: LengthUnit;
  /** Layers the jeweler says hold the stones; null means "layers named as stones". */
  stoneLayers?: string[] | null;
}

/**
 * The measured values as the sheet prints them, in the maker's size system and
 * length unit, each with a plain reason when it can't be measured: a
 * manufacturer is never shown a guess as a fact.
 */
export function formatAuto(r: CadReading, raw: RawMeasure, partBoxes: PartBox[], c: FormatChoice): AutoValues {
  const k = MM_PER[r.fileUnits ?? c.units ?? 'mm'] ?? 1;
  let ring = raw.ring;
  let ringWhy = raw.ringWhy;
  // Finger holes run from about 12 mm (baby) to 25 mm across; anything else means the units are off.
  if (ring && (ring.innerDiameter * k < 11 || ring.innerDiameter * k > 26)) {
    ringWhy = `The finger hole measures ${(ring.innerDiameter * k).toFixed(1)} mm across, which is not a ring size. Check the file's units, or type it in.`;
    ring = null;
  }
  const picked = c.stoneLayers?.length ? stonesOnLayers(partBoxes, c.stoneLayers) : partBoxes;
  const groups = stoneSchedule(picked.map((p) => ({ ...p, sizeMm: p.sizeMm.map((v) => v * k) as [number, number, number] })));
  return {
    groups,
    ringSize: ring ? { value: formatRingSizeIn(c.system, ring.innerDiameter * k, c.length) } : { value: null, why: ringWhy },
    band: ring
      ? { value: `${formatLength(ring.bandWidth * k, c.length)} wide × ${formatLength(ring.bandThickness * k, c.length)} thick` }
      : { value: null, why: ringWhy },
    stones: groups.length
      ? { value: formatSchedule(groups) }
      : { value: null, why: r.format === '3dm' ? 'No layer is named for stones. Pick the stone layer above, or type them in.' : 'This file type does not keep stones apart. Type them in.' },
    weight: raw.volume !== null ? { value: formatWeight(raw.volume * k * k * k, c.density) } : { value: null, why: raw.volumeWhy },
  };
}

/** Both steps at once, for tests and one-off use. */
export function measureAll(r: CadReading, metal: Float32Array, partBoxes: PartBox[], units: UnitKey | null, density: number,
  system: SizeSystem = 'us', length: LengthUnit = 'mm'): AutoValues {
  return formatAuto(r, measureRaw(r, metal), partBoxes, { units, density, system, length });
}
