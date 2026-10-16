// Credit package display data and which packages a page shows.
//
// The backend owns tier IDs and credit counts (GET /billing/tiers) but not the
// visible prices, so the display data lives here, shared by /pricing, /credits
// and the plan grid so the surfaces cannot drift apart.

import { isStarterTier, type BillingTier } from '@/lib/starter-pack';

/** Backend tier ID of the Plus package (160 credits). Hidden only in the photo shortfall view. */
export const PLUS_TIER_ID = 'tier_a15d8b06';

/** Credits per standard (1K) photo and per CAD run, used for the "up to" counts on each card. */
export const STANDARD_PHOTO_CREDITS = 8;
export const CAD_RUN_CREDITS = 140;

const capacity = (credits: number) => ({
  photos: Math.floor(credits / STANDARD_PHOTO_CREDITS),
  cads: Math.floor(credits / CAD_RUN_CREDITS),
});

export const CREDIT_PLANS = [
  { tierId: 'tier_5e6c6184', name: 'Basic', price: 9, inrPrice: 999, credits: 100, ...capacity(100) },
  { tierId: PLUS_TIER_ID, name: 'Plus', price: 14, inrPrice: 1349, credits: 160, ...capacity(160) },
  { tierId: 'tier_6867e598', name: 'Standard', price: 39, inrPrice: 3499, credits: 500, ...capacity(500) },
  { tierId: 'tier_a80444ac', name: 'Pro', price: 99, inrPrice: 8999, credits: 1500, ...capacity(1500) },
];

export const STARTER_OFFER = { price: 2, inrPrice: 200, credits: 50, ...capacity(50) };

export const PLAN_BY_CREDITS = Object.fromEntries(CREDIT_PLANS.map(p => [p.credits, p])) as Record<
  number,
  (typeof CREDIT_PLANS)[number]
>;

/**
 * True for CAD Studio workflows: CAD runs (generate / improve), and the design
 * pictures made before CAD in CAD from Idea / Inspiration (design_image_v1).
 */
export function isCadWorkflow(workflowName: string | undefined): boolean {
  return !!workflowName && (/(^|_)cad(_|$)/.test(workflowName) || workflowName.startsWith('design_image'));
}

/**
 * Tiers to render, in display order (Starter, then by credits).
 *
 * Normal visits (no blocked run): every known package, Plus included.
 *
 * Photo shortfall view (`photoShortfall`): the same minus Plus, which is pitched
 * at CAD (display-only; it stays buyable).
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
export function resolveGridTiers(
  tiers: BillingTier[],
  cadRequiredCredits?: number,
  photoShortfall = false,
): BillingTier[] {
  const source =
    tiers.length > 0
      ? tiers
      : CREDIT_PLANS.map(p => ({ tier_id: p.tierId, name: p.name, type: 'subscription', credits: p.credits }));
  const known = source.filter(t => isStarterTier(t) || t.credits in PLAN_BY_CREDITS);

  let shown: BillingTier[];
  if (typeof cadRequiredCredits === 'number') {
    const fundable = known.filter(t => t.credits >= cadRequiredCredits);
    shown = fundable.length > 0 ? fundable : known;
  } else if (photoShortfall) {
    shown = known.filter(t => t.tier_id !== PLUS_TIER_ID);
  } else {
    shown = known;
  }
  return [...shown].sort((a, b) => Number(isStarterTier(b)) - Number(isStarterTier(a)) || a.credits - b.credits);
}
