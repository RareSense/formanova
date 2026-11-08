import { useEffect, useState } from 'react';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { hasPaid, shouldOffer } from '@/lib/dfy-offer';
import type { BillingTier } from '@/lib/starter-pack';

/** BrandPromptHandler's own "seen" flag: the offer waits until that prompt is out of the way. */
const BRAND_PROMPT_SEEN = 'formanova_brand_prompt_v2_';

/** Whether the Done For You offer shows on the dashboard now (paying users, once, never over another pop-up). */
export function useDfyOffer(userId: string | null | undefined, otherModalOpen: boolean) {
  const [paid, setPaid] = useState(false);
  const [closed, setClosed] = useState(false);

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

  let brandPromptDone = false;
  try {
    brandPromptDone = !!userId && localStorage.getItem(BRAND_PROMPT_SEEN + userId) === 'true';
  } catch {
    /* storage blocked */
  }
  const open = !!userId && !closed && shouldOffer({ userId, paid, otherModalOpen: otherModalOpen || !brandPromptDone });
  return { open, close: () => setClosed(true) };
}
