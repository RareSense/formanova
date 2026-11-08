// Owner, 2026-11-08: paying users have been making their photoshoots themselves; offer plainly that our team can
// make them all. Two chances at most: once on the dashboard, once after they made an image. "No thanks" (or
// talking to our AI) ends it for good. Designed with Fable 5.1.
import { selectStarterTier, type BillingTier } from './starter-pack';

export type OfferMoment = 'dashboard' | 'after_image';
export type OfferChoice = 'talk' | 'no';
export interface OfferState {
  choice?: OfferChoice;
  seen: Partial<Record<OfferMoment, number>>;
}

const KEY = 'formanova_dfy_offer_v2_';

/** The backend drops the Starter tier from /billing/tiers once the user has bought anything. */
export function hasPaid(tiers: BillingTier[]): boolean {
  return tiers.length > 0 && selectStarterTier(tiers) === null;
}

export function offerState(userId: string): OfferState {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY + userId) ?? 'null') as OfferState | null;
    if (saved && typeof saved === 'object' && saved.seen && typeof saved.seen === 'object') {
      return { ...(saved.choice === 'talk' || saved.choice === 'no' ? { choice: saved.choice } : {}), seen: saved.seen };
    }
  } catch {
    /* unreadable: start fresh */
  }
  return { seen: {} };
}

function save(userId: string, state: OfferState) {
  try {
    localStorage.setItem(KEY + userId, JSON.stringify(state));
  } catch {
    /* storage blocked: the offer may show again, which is harmless */
  }
}

/** Marked when it is shown, so a reload never shows the same chance twice. */
export function markOfferSeen(userId: string, moment: OfferMoment, now = Date.now()) {
  const state = offerState(userId);
  save(userId, { ...state, seen: { ...state.seen, [moment]: now } });
}

export function saveOfferChoice(userId: string, choice: OfferChoice) {
  save(userId, { ...offerState(userId), choice });
}

export function shouldOffer(o: { userId: string; paid: boolean; otherModalOpen: boolean; moment: OfferMoment }): boolean {
  if (!o.paid || o.otherModalOpen) return false;
  const state = offerState(o.userId);
  return !state.choice && !state.seen[o.moment];
}
