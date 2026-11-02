import { describe, expect, it } from 'vitest';
import { findAlloy } from './alloys';
import {
  GRAMS_PER_DWT,
  dwtFromGrams,
  finishedGrams,
  gramsFromDwt,
  gramsFromVolume,
  targetStatus,
  volumeFromMass,
} from './weight';

describe('weight maths', () => {
  it('grams = volume mm³ × density g/cm³ ÷ 1000', () => {
    expect(gramsFromVolume(2192.4, findAlloy('au14y')!)).toBeCloseTo(27.975024, 9);
    expect(gramsFromVolume(1000, findAlloy('ag925')!)).toBeCloseTo(10.36, 12);
  });

  it('gives no weight for zero, negative, non-finite or non-number volumes', () => {
    const alloy = findAlloy('au14y')!;
    for (const v of [0, -1, NaN, Infinity, -Infinity, '2192.4', null, undefined]) {
      expect(gramsFromVolume(v as number, alloy)).toBeNull();
    }
  });

  it('gives no weight when the product overflows', () => {
    expect(gramsFromVolume(Number.MAX_VALUE, findAlloy('au14y')!)).toBeNull();
  });

  it('uses the troy pennyweight', () => {
    expect(GRAMS_PER_DWT).toBe(1.55517384);
    expect(dwtFromGrams(1.55517384)).toBe(1);
    expect(gramsFromDwt(20)).toBeCloseTo(31.1034768, 9);
  });

  it('removes 5% for finishing', () => {
    expect(finishedGrams(100)).toBeCloseTo(95, 12);
  });

  it('recovers the volume from a mass and the density it was computed with', () => {
    expect(volumeFromMass(27.975024, 12.76)).toBeCloseTo(2192.4, 9);
    for (const [mass, density] of [[0, 12.76], [10, 0], [NaN, 1], [10, -1], [10, null], [-5, 10]]) {
      expect(volumeFromMass(mass, density)).toBeNull();
    }
  });

  it('is on target at exactly ±tolerance, and off just past it', () => {
    expect(targetStatus(21, { grams: 20, tolerancePct: 5 })).toEqual({ kind: 'on', deviation: 0.05 });
    expect(targetStatus(19, { grams: 20, tolerancePct: 5 })).toEqual({ kind: 'on', deviation: -0.05 });
    expect(targetStatus(21.01, { grams: 20, tolerancePct: 5 })?.kind).toBe('over');
    expect(targetStatus(18.99, { grams: 20, tolerancePct: 5 })?.kind).toBe('under');
  });

  it('has a zero tolerance that only an exact weight meets', () => {
    expect(targetStatus(20, { grams: 20, tolerancePct: 0 })?.kind).toBe('on');
    expect(targetStatus(20.001, { grams: 20, tolerancePct: 0 })?.kind).toBe('over');
  });

  it('has no status for an invalid weight or target', () => {
    expect(targetStatus(NaN, { grams: 20, tolerancePct: 5 })).toBeNull();
    expect(targetStatus(0, { grams: 20, tolerancePct: 5 })).toBeNull();
    expect(targetStatus(20, { grams: 0, tolerancePct: 5 })).toBeNull();
    expect(targetStatus(20, { grams: -1, tolerancePct: 5 })).toBeNull();
    expect(targetStatus(20, null)).toBeNull();
  });

  it('falls back to 5% for a bad tolerance', () => {
    expect(targetStatus(21, { grams: 20, tolerancePct: NaN })?.kind).toBe('on');
    expect(targetStatus(21, { grams: 20, tolerancePct: -3 })?.kind).toBe('on');
    expect(targetStatus(21.5, { grams: 20, tolerancePct: -3 })?.kind).toBe('over');
  });
});
