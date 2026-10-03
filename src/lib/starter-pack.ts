// Starter Pack eligibility.
//
// The backend only returns the Starter tier from /billing/tiers while the user
// is still eligible (i.e. has never purchased it). Once bought, it stops being
// returned and the user falls back to the normal pricing grid. So eligibility
// is simply "is a starter-shaped tier present in the tiers response".
//
// The Starter tier is identified positively, by its backend tier ID. It must
// never be inferred from "not a known plan": new packages (Plus) and any future
// unfamiliar tier would otherwise be mistaken for Starter. Keeping this in one
// place lets Pricing, Credits and tests agree on the rule.

export interface BillingTier {
  tier_id: string;
  name: string;
  type: string;
  credits: number;
}

/** Backend tier ID of the one-time Starter Pack (50 credits, introductory offer). */
export const STARTER_TIER_ID = 'tier_425a5db7';

/** A tier is the Starter Pack only when it carries the Starter tier ID. */
export function isStarterTier(tier: BillingTier): boolean {
  return tier.tier_id === STARTER_TIER_ID;
}

/** The starter tier from a tiers response, or null when the user is not eligible. */
export function selectStarterTier(tiers: BillingTier[]): BillingTier | null {
  return tiers.find(isStarterTier) ?? null;
}
