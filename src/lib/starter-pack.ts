// Starter Pack eligibility.
//
// The backend only returns the Starter tier from /billing/tiers while the user
// is still eligible (i.e. has never purchased it). Once bought, it stops being
// returned and the user falls back to the normal pricing grid. So eligibility
// is simply "is a starter-shaped tier present in the tiers response".
//
// A starter tier is identified by NOT matching one of the standard plan credit
// amounts. Keeping this in one place lets Pricing, Credits and tests agree on
// the rule without re-deriving it.

export interface BillingTier {
  tier_id: string;
  name: string;
  type: string;
  credits: number;
}

/** Credit amounts of the three standard packages (Basic / Standard / Pro). */
export const STANDARD_PLAN_CREDITS: ReadonlySet<number> = new Set([100, 500, 1500]);

/** A tier is the Starter Pack when its credit count is not a standard plan. */
export function isStarterTier(tier: BillingTier): boolean {
  return !STANDARD_PLAN_CREDITS.has(tier.credits);
}

/** The starter tier from a tiers response, or null when the user is not eligible. */
export function selectStarterTier(tiers: BillingTier[]): BillingTier | null {
  return tiers.find(isStarterTier) ?? null;
}
