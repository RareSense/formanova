import { describe, expect, it } from 'vitest';
import { EMPTY_METAL_REQUEST, metalRequestPayload } from './request';

describe('metalRequestPayload', () => {
  it('sends the chosen alloy and a target in it', () => {
    const { material, weightTarget } = metalRequestPayload({ alloyId: 'au14y', target: { grams: 28, tolerancePct: 5 } });
    expect(material?.id).toBe('au14y');
    expect(weightTarget).toEqual({ grams: 28, tolerance_pct: 5, alloy_id: 'au14y' });
  });

  it('sends the resolved id for a legacy alloy id', () => {
    expect(metalRequestPayload({ alloyId: '18k_rose_gold', target: { grams: 9, tolerancePct: 2 } }).weightTarget?.alloy_id).toBe('au18r');
  });

  it('sends no material for an unknown alloy, and a target without an alloy', () => {
    const { material, weightTarget } = metalRequestPayload({ alloyId: 'platinum_cobalt', target: { grams: 28, tolerancePct: 5 } });
    expect(material).toBeNull();
    expect(weightTarget).toEqual({ grams: 28, tolerance_pct: 5, alloy_id: null });
  });

  it('sends nothing for an empty choice or an unusable target', () => {
    expect(metalRequestPayload(EMPTY_METAL_REQUEST)).toEqual({ material: null, weightTarget: null });
    expect(metalRequestPayload({ alloyId: null, target: { grams: NaN, tolerancePct: 5 } }).weightTarget).toBeNull();
    expect(metalRequestPayload({ alloyId: null, target: { grams: 0, tolerancePct: 5 } }).weightTarget).toBeNull();
  });
});
