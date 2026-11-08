// Owner, 2026-11-08: paying users have been making their photoshoots themselves; offer once, plainly, that our
// team can make the whole collection for them (Done For You, priced by Ruby). Designed with Fable 5.1.
import { selectStarterTier, type BillingTier } from './starter-pack';

export type OfferChoice = 'talk' | 'no' | 'closed';
export interface SavedChoice {
  choice: OfferChoice;
  at: number;
  /** True once a "closed" offer has been shown again. */
  reminded?: boolean;
}

/** A closed offer (no button chosen) comes back once, after this long. */
export const REMIND_AFTER_MS = 14 * 24 * 60 * 60 * 1000;
const KEY = 'formanova_dfy_offer_';

/** The backend drops the Starter tier from /billing/tiers once the user has bought anything. */
export function hasPaid(tiers: BillingTier[]): boolean {
  return tiers.length > 0 && selectStarterTier(tiers) === null;
}

export function offerChoice(userId: string): SavedChoice | null {
  try {
    const raw = localStorage.getItem(KEY + userId);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedChoice;
    return saved && typeof saved.at === 'number' && ['talk', 'no', 'closed'].includes(saved.choice) ? saved : null;
  } catch {
    return null;
  }
}

export function saveOfferChoice(userId: string, choice: OfferChoice, now = Date.now()) {
  const before = offerChoice(userId);
  const saved: SavedChoice = { choice, at: now, ...(before?.choice === 'closed' ? { reminded: true } : {}) };
  try {
    localStorage.setItem(KEY + userId, JSON.stringify(saved));
  } catch {
    /* storage blocked: the offer may show again, which is harmless */
  }
}

export function shouldOffer(o: { userId: string; paid: boolean; otherModalOpen: boolean; now?: number }): boolean {
  if (!o.paid || o.otherModalOpen) return false;
  const saved = offerChoice(o.userId);
  if (!saved) return true;
  if (saved.choice !== 'closed' || saved.reminded) return false;
  return (o.now ?? Date.now()) - saved.at >= REMIND_AFTER_MS;
}
