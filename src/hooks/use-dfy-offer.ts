import { useEffect, useState } from 'react';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { hasPaid, markOfferSeen, shouldOffer, type OfferMoment } from '@/lib/dfy-offer';
import type { BillingTier } from '@/lib/starter-pack';

/** BrandPromptHandler's own "seen" flag: the offer waits until that prompt is out of the way. */
const BRAND_PROMPT_SEEN = 'formanova_brand_prompt_v2_';

function brandPromptDone(userId: string): boolean {
  try {
    return localStorage.getItem(BRAND_PROMPT_SEEN + userId) === 'true';
  } catch {
    return false;
  }
}

/**
 * The Done For You offer at one moment (dashboard, or after an image is made): paying users only, each moment
 * once, never over another pop-up. `ready` lets the page wait (e.g. until the new image has been on screen).
 * Once shown it stays open until closed, even though that moment now counts as used.
 */
export function useDfyOffer(userId: string | null | undefined, otherModalOpen: boolean, moment: OfferMoment, ready = true) {
  const [paid, setPaid] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    authenticatedFetch('/billing/tiers')
      .then((res) => (res.ok ? res.json() : []))
      .then((tiers: BillingTier[]) => live && setPaid(Array.isArray(tiers) && hasPaid(tiers)))
      .catch(() => {}); // unknown: never guess that someone paid
    return () => {
      live = false;
    };
  }, [userId]);

  useEffect(() => {
    if (open || !ready || !userId) return;
    if (shouldOffer({ userId, paid, moment, otherModalOpen: otherModalOpen || !brandPromptDone(userId) })) {
      markOfferSeen(userId, moment);
      setOpen(true);
    }
  }, [open, ready, userId, paid, moment, otherModalOpen]);

  return { open, close: () => setOpen(false) };
}
