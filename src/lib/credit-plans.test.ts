import { describe, it, expect } from 'vitest';
import { CREDIT_PLANS, PLUS_TIER_ID, STARTER_OFFER, isCadWorkflow, resolveGridTiers } from './credit-plans';
import { isStarterTier, selectStarterTier, type BillingTier } from './starter-pack';

const t = (tier_id: string, credits: number): BillingTier => ({ tier_id, name: 'n', type: 'one_time', credits });
const starter = t('tier_425a5db7', 50);
const basic = t('tier_5e6c6184', 100);
const plus = t(PLUS_TIER_ID, 160);
const standard = t('tier_6867e598', 500);
const pro = t('tier_a80444ac', 1500);
const all = [pro, plus, starter, standard, basic];
const credits = (tiers: BillingTier[]) => tiers.map(x => x.credits);

describe('resolveGridTiers', () => {
  it('normal view: Starter, Basic, Standard, Pro in order, no Plus', () => {
    expect(credits(resolveGridTiers(all))).toEqual([50, 100, 500, 1500]);
  });

  it('normal view without Starter (already bought): Basic, Standard, Pro', () => {
    expect(credits(resolveGridTiers([basic, plus, standard, pro]))).toEqual([100, 500, 1500]);
  });

  it('CAD shortfall of 140: Plus, Standard, Pro (Starter and Basic cannot fund it)', () => {
    expect(credits(resolveGridTiers(all, 140))).toEqual([160, 500, 1500]);
  });

  it('CAD shortfall of 100: Basic still funds it, Starter does not', () => {
    expect(credits(resolveGridTiers(all, 100))).toEqual([100, 160, 500, 1500]);
  });

  it('follows the backend requirement rather than a fixed number', () => {
    expect(credits(resolveGridTiers(all, 200))).toEqual([500, 1500]);
  });

  it('shows everything known when nothing is big enough, never an empty page', () => {
    expect(credits(resolveGridTiers(all, 99999))).toEqual([50, 100, 160, 500, 1500]);
  });

  it('fallback when /billing/tiers failed: normal view has no Plus, CAD view has it', () => {
    expect(credits(resolveGridTiers([]))).toEqual([100, 500, 1500]);
    expect(credits(resolveGridTiers([], 140))).toEqual([160, 500, 1500]);
  });

  it('drops unfamiliar tiers instead of treating them as Starter', () => {
    expect(credits(resolveGridTiers([basic, t('tier_future', 250), standard]))).toEqual([100, 500]);
  });

  it('orders by credits whatever order the backend sends', () => {
    expect(credits(resolveGridTiers([pro, standard, basic, starter]))).toEqual([50, 100, 500, 1500]);
  });
});

describe('Plus is never Starter', () => {
  it('is not Starter, and with no Starter tier selectStarterTier returns null', () => {
    expect(isStarterTier(plus)).toBe(false);
    expect(selectStarterTier([basic, plus, standard, pro])).toBeNull();
  });

  it('is not Starter even though it is hidden from the normal view', () => {
    expect(resolveGridTiers([basic, plus, standard, pro]).some(isStarterTier)).toBe(false);
  });
});

describe('display data', () => {
  it('matches the live pricing table', () => {
    expect(STARTER_OFFER).toMatchObject({ price: 2, inrPrice: 200, credits: 50 });
    expect(CREDIT_PLANS.map(p => [p.name, p.price, p.inrPrice, p.credits])).toEqual([
      ['Basic', 9, 999, 100],
      ['Plus', 14, 1349, 160],
      ['Standard', 39, 3499, 500],
      ['Pro', 99, 8999, 1500],
    ]);
    expect(CREDIT_PLANS.find(p => p.name === 'Plus')?.photos).toBe(20);
  });
});

describe('isCadWorkflow', () => {
  it('recognises CAD workflows and not photography ones', () => {
    expect(isCadWorkflow('ring_cad_generate')).toBe(true);
    expect(isCadWorkflow('ring_cad_improve')).toBe(true);
    expect(isCadWorkflow('ring_cad_nurbs_v1')).toBe(true);
    expect(isCadWorkflow('photoshoot')).toBe(false);
    expect(isCadWorkflow(undefined)).toBe(false);
  });
});
