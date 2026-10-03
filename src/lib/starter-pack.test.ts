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
const plus = tier({ tier_id: 'tier_a15d8b06', credits: 160, type: 'one_time' });
const pro = tier({ tier_id: 'tier_pro', credits: 1500 });
const starter = tier({ tier_id: 'tier_425a5db7', credits: 50 });

describe('starter-pack eligibility', () => {
  it('treats the standard plans and Plus as non-starter', () => {
    expect(isStarterTier(basic)).toBe(false);
    expect(isStarterTier(plus)).toBe(false);
    expect(isStarterTier(standard)).toBe(false);
    expect(isStarterTier(pro)).toBe(false);
  });

  it('identifies the starter tier by its tier ID', () => {
    expect(isStarterTier(starter)).toBe(true);
  });

  it('never treats an unfamiliar tier as the starter tier', () => {
    expect(isStarterTier(tier({ tier_id: 'tier_future', credits: 250 }))).toBe(false);
    expect(isStarterTier(tier({ tier_id: 'tier_other_50', credits: 50 }))).toBe(false);
  });

  it('selects the starter tier when present (user is eligible)', () => {
    expect(selectStarterTier([basic, plus, starter, standard])).toBe(starter);
  });

  it('returns null for 100 / 160 / 500 / 1500 with no starter tier (Plus is not Starter)', () => {
    expect(selectStarterTier([basic, plus, standard, pro])).toBeNull();
  });

  it('returns null when only standard plans are present (already purchased)', () => {
    expect(selectStarterTier([basic, standard, pro])).toBeNull();
  });

  it('returns null for an empty tiers list', () => {
    expect(selectStarterTier([])).toBeNull();
  });
});
