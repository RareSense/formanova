// Credit package display data and which packages a page shows.
//
// The backend owns tier IDs and credit counts (GET /billing/tiers) but not the
// visible prices, so the display data lives here, shared by /pricing, /credits
// and the plan grid so the surfaces cannot drift apart.

import { isStarterTier, type BillingTier } from '@/lib/starter-pack';

/** Backend tier ID of the Plus package (160 credits). Shown only in the CAD shortfall view. */
export const PLUS_TIER_ID = 'tier_a15d8b06';

export const CREDIT_PLANS = [
  { tierId: 'tier_5e6c6184', name: 'Basic', price: 9, inrPrice: 999, credits: 100, photos: 12, cads: 1 },
  { tierId: PLUS_TIER_ID, name: 'Plus', price: 14, inrPrice: 1349, credits: 160, photos: 20, cads: 1 },
  { tierId: 'tier_6867e598', name: 'Standard', price: 39, inrPrice: 3499, credits: 500, photos: 62, cads: 5 },
  { tierId: 'tier_a80444ac', name: 'Pro', price: 99, inrPrice: 8999, credits: 1500, photos: 187, cads: 15 },
];

export const STARTER_OFFER = { price: 2, inrPrice: 200, credits: 50, photos: 6 };

export const PLAN_BY_CREDITS = Object.fromEntries(CREDIT_PLANS.map(p => [p.credits, p])) as Record<
  number,
  (typeof CREDIT_PLANS)[number]
>;

/** True for CAD workflows (generate / improve), which cost far more than a photo. */
export function isCadWorkflow(workflowName: string | undefined): boolean {
  return !!workflowName && /(^|_)cad(_|$)/.test(workflowName);
}

/**
 * Tiers to render, in display order (Starter, then by credits).
 *
 * Normal visits: Starter when the backend returns it, Basic, Standard, Pro.
 * Plus is deliberately not shown there yet (display-only; it stays buyable).
 *
 * CAD shortfall view (`cadRequiredCredits` set): only packages that can fund the
 * run on their own, Plus included, so Starter and Basic drop out once the
 * backend's CAD estimate exceeds them. The threshold is the required credits
 * reported by the backend, never a hardcoded number. If nothing is big enough,
 * the filter is skipped rather than showing an empty page.
 *
 * Tiers that are neither Starter nor a known plan are never rendered, so an
 * unfamiliar tier can never be mistaken for Starter.
 */
export function resolveGridTiers(tiers: BillingTier[], cadRequiredCredits?: number): BillingTier[] {
  const source =
    tiers.length > 0
      ? tiers
      : CREDIT_PLANS.map(p => ({ tier_id: p.tierId, name: p.name, type: 'subscription', credits: p.credits }));
  const known = source.filter(t => isStarterTier(t) || t.credits in PLAN_BY_CREDITS);

  let shown: BillingTier[];
  if (typeof cadRequiredCredits === 'number') {
    const fundable = known.filter(t => t.credits >= cadRequiredCredits);
    shown = fundable.length > 0 ? fundable : known;
  } else {
    shown = known.filter(t => t.tier_id !== PLUS_TIER_ID);
  }
  return [...shown].sort((a, b) => Number(isStarterTier(b)) - Number(isStarterTier(a)) || a.credits - b.credits);
}
