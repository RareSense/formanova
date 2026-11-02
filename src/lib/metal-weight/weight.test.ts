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

  it('gives no weight under 0.01 g or over 10 kg', () => {
    const silver = findAlloy('ag925')!;
    expect(gramsFromVolume(0.9, silver)).toBeNull(); // 0.0093 g
    expect(gramsFromVolume(1, silver)).toBeCloseTo(0.01036, 9);
    expect(gramsFromVolume(1e-6, findAlloy('au14y')!)).toBeNull();
    const platinum = findAlloy('pt950ir')!;
    expect(gramsFromVolume(465_000, platinum)).toBeCloseTo(9997.5, 6);
    expect(gramsFromVolume(466_000, platinum)).toBeNull(); // 10,019 g
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

  it('decides on the percent it shows, so "5.0%" is never called over a 5% tolerance', () => {
    // 5.045% shows as 5.0%: on target, not "5.0% over".
    expect(targetStatus(21.009, { grams: 20, tolerancePct: 5 })?.kind).toBe('on');
    // -4.95% shows as -5.0%: on target.
    expect(targetStatus(19.0099, { grams: 20, tolerancePct: 5 })?.kind).toBe('on');
  });

  it('has a zero tolerance that only a weight shown as 0.0% off meets', () => {
    expect(targetStatus(20, { grams: 20, tolerancePct: 0 })?.kind).toBe('on');
    expect(targetStatus(20.001, { grams: 20, tolerancePct: 0 })?.kind).toBe('on'); // shows 0.0%
    expect(targetStatus(20.02, { grams: 20, tolerancePct: 0 })?.kind).toBe('over'); // shows 0.1%
  });

  it('has no status for an invalid weight or target', () => {
    expect(targetStatus(NaN, { grams: 20, tolerancePct: 5 })).toBeNull();
    expect(targetStatus(0, { grams: 20, tolerancePct: 5 })).toBeNull();
    expect(targetStatus(20, { grams: 0, tolerancePct: 5 })).toBeNull();
    expect(targetStatus(20, { grams: -1, tolerancePct: 5 })).toBeNull();
    expect(targetStatus(20, null)).toBeNull();
  });

  it('falls back to 5% for a missing tolerance, and clamps one outside 0–100', () => {
    expect(targetStatus(21, { grams: 20, tolerancePct: NaN })?.kind).toBe('on');
    expect(targetStatus(20.1, { grams: 20, tolerancePct: -3 })?.kind).toBe('over'); // clamped to 0
    expect(targetStatus(1e6, { grams: 1, tolerancePct: 1e12 })?.kind).toBe('over'); // clamped to 100
    expect(targetStatus(2, { grams: 1, tolerancePct: 1e12 })?.kind).toBe('on');
  });
});
