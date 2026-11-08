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
 * The Done For You offer at one moment: on the dashboard every visit until they choose No thanks or Talk to our
 * AI; after an image, once. Paying users only, never over another pop-up. `ready` lets the page wait (e.g. until the new image has been on screen).
 * Once shown it stays open until closed, and once closed it stays closed for the rest of this visit.
 */
export function useDfyOffer(userId: string | null | undefined, otherModalOpen: boolean, moment: OfferMoment, ready = true) {
  const [paid, setPaid] = useState(false);
  const [open, setOpen] = useState(false);
  const [closedThisVisit, setClosedThisVisit] = useState(false);

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
    if (open || closedThisVisit || !ready || !userId) return;
    if (shouldOffer({ userId, paid, moment, otherModalOpen: otherModalOpen || !brandPromptDone(userId) })) {
      // Owner, 2026-11-08: on the dashboard only No thanks / Talk to our AI end it; closing it (the ✕) shows it
      // again on the next visit. After an image it is a single chance.
      if (moment === 'after_image') markOfferSeen(userId, moment);
      setOpen(true);
    }
  }, [open, closedThisVisit, ready, userId, paid, moment, otherModalOpen]);

  const close = () => {
    setOpen(false);
    setClosedThisVisit(true); // not again during this visit; the next dashboard visit may show it again
  };
  return { open, close };
}
