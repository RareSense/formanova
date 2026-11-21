import { describe, expect, it } from 'vitest';
import { METALS, formatWeight, weightGrams } from './metals';

describe('weight', () => {
  it('matches FormaNova\'s own spec sheet: 150.861 mm³ of 13.10 g/cm³ is 1.98 g', () => {
    expect(weightGrams(150.861, 13.1)).toBeCloseTo(1.98, 2);
  });

  it('formats grams with the volume and density used', () => {
    expect(formatWeight(150.861, 13.07)).toBe('1.97 g (150.9 mm³ at 13.07 g/cm³)');
  });

  it('lists each metal once with a plausible density', () => {
    expect(new Set(METALS.map((m) => m.key)).size).toBe(METALS.length);
    for (const m of METALS) expect(m.density).toBeGreaterThan(9);
  });
});
