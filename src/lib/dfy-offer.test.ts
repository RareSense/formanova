import { describe, it, expect, beforeEach } from 'vitest';
import { hasPaid, offerChoice, saveOfferChoice, shouldOffer, REMIND_AFTER_MS } from './dfy-offer';

const STARTER = { tier_id: 'tier_425a5db7', name: 'Starter', type: 'one_time', credits: 50 };
const BASIC = { tier_id: 'tier_5e6c6184', name: 'Basic', type: 'subscription', credits: 100 };
const NOW = Date.parse('2026-11-08T10:00:00Z');

describe('Done For You offer for paying users (owner, 2026-11-08)', () => {
  beforeEach(() => localStorage.clear());

  it('a user has paid once the Starter pack is gone from their plans', () => {
    expect(hasPaid([BASIC])).toBe(true);
    expect(hasPaid([STARTER, BASIC])).toBe(false);
    expect(hasPaid([])).toBe(false); // nothing loaded: never guess
  });

  it('shows once to a paying user with nothing else on screen', () => {
    expect(shouldOffer({ userId: 'u1', paid: true, otherModalOpen: false, now: NOW })).toBe(true);
    expect(shouldOffer({ userId: 'u1', paid: false, otherModalOpen: false, now: NOW })).toBe(false);
    expect(shouldOffer({ userId: 'u1', paid: true, otherModalOpen: true, now: NOW })).toBe(false);
  });

  it('"No thanks" and "Get my price" are final; closing it comes back once after 14 days', () => {
    saveOfferChoice('u1', 'no', NOW);
    expect(shouldOffer({ userId: 'u1', paid: true, otherModalOpen: false, now: NOW + 100 * 86400e3 })).toBe(false);
    saveOfferChoice('u2', 'talk', NOW);
    expect(shouldOffer({ userId: 'u2', paid: true, otherModalOpen: false, now: NOW + 100 * 86400e3 })).toBe(false);
    saveOfferChoice('u3', 'closed', NOW);
    expect(shouldOffer({ userId: 'u3', paid: true, otherModalOpen: false, now: NOW + REMIND_AFTER_MS - 1 })).toBe(false);
    expect(shouldOffer({ userId: 'u3', paid: true, otherModalOpen: false, now: NOW + REMIND_AFTER_MS })).toBe(true);
    saveOfferChoice('u3', 'closed', NOW + REMIND_AFTER_MS); // the reminder was closed too: never again
    expect(shouldOffer({ userId: 'u3', paid: true, otherModalOpen: false, now: NOW + 10 * REMIND_AFTER_MS })).toBe(false);
  });

  it('the choice is per user and survives a broken store', () => {
    saveOfferChoice('u1', 'no', NOW);
    expect(offerChoice('u1')?.choice).toBe('no');
    expect(offerChoice('u2')).toBeNull();
    localStorage.setItem('formanova_dfy_offer_u4', 'not json');
    expect(offerChoice('u4')).toBeNull();
  });
});
