import { describe, it, expect } from 'vitest';
import { isStarterTier, selectStarterTier, type BillingTier } from './starter-pack';

const tier = (over: Partial<BillingTier>): BillingTier => ({
  tier_id: 't',
  name: 'n',
  type: 'subscription',
  credits: 0,
  ...over,
});

const basic = tier({ tier_id: 'tier_basic', credits: 100 });
const standard = tier({ tier_id: 'tier_standard', credits: 500 });
const pro = tier({ tier_id: 'tier_pro', credits: 1500 });
const starter = tier({ tier_id: 'tier_425a5db7', credits: 50 });

describe('starter-pack eligibility', () => {
  it('treats the 3 standard plan credit amounts as non-starter', () => {
    expect(isStarterTier(basic)).toBe(false);
    expect(isStarterTier(standard)).toBe(false);
    expect(isStarterTier(pro)).toBe(false);
  });

  it('treats a non-standard credit amount (50) as the starter tier', () => {
    expect(isStarterTier(starter)).toBe(true);
  });

  it('selects the starter tier when present (user is eligible)', () => {
    expect(selectStarterTier([basic, starter, standard])).toBe(starter);
  });

  it('returns null when only standard plans are present (already purchased)', () => {
    expect(selectStarterTier([basic, standard, pro])).toBeNull();
  });

  it('returns null for an empty tiers list', () => {
    expect(selectStarterTier([])).toBeNull();
  });
});
