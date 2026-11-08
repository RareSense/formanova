import { describe, it, expect, beforeEach } from 'vitest';
import { hasPaid, offerState, markOfferSeen, saveOfferChoice, shouldOffer } from './dfy-offer';

const STARTER = { tier_id: 'tier_425a5db7', name: 'Starter', type: 'one_time', credits: 50 };
const BASIC = { tier_id: 'tier_5e6c6184', name: 'Basic', type: 'subscription', credits: 100 };
const ask = (userId: string, moment: 'dashboard' | 'after_image', paid = true, otherModalOpen = false) =>
  shouldOffer({ userId, paid, otherModalOpen, moment });

describe('Done For You offer for paying users (owner, 2026-11-08)', () => {
  beforeEach(() => localStorage.clear());

  it('a user has paid once the Starter pack is gone from their plans', () => {
    expect(hasPaid([BASIC])).toBe(true);
    expect(hasPaid([STARTER, BASIC])).toBe(false);
    expect(hasPaid([])).toBe(false); // nothing loaded: never guess
  });

  it('the dashboard keeps offering until they choose; after an image is one chance', () => {
    expect(ask('u1', 'dashboard')).toBe(true);
    markOfferSeen('u1', 'dashboard');
    expect(ask('u1', 'dashboard')).toBe(true);
    expect(ask('u1', 'after_image')).toBe(true);
    markOfferSeen('u1', 'after_image');
    expect(ask('u1', 'after_image')).toBe(false);
  });

  it('"No thanks" once means never again, anywhere; so does "Talk to our AI"', () => {
    markOfferSeen('u1', 'dashboard');
    saveOfferChoice('u1', 'no');
    expect(ask('u1', 'after_image')).toBe(false);
    saveOfferChoice('u2', 'talk');
    expect(ask('u2', 'dashboard')).toBe(false);
    expect(ask('u2', 'after_image')).toBe(false);
  });

  it('only for paying users, never over another pop-up', () => {
    expect(ask('u1', 'dashboard', false)).toBe(false);
    expect(ask('u1', 'dashboard', true, true)).toBe(false);
  });

  it('per user, and a broken store just means it may show', () => {
    saveOfferChoice('u1', 'no');
    expect(offerState('u1').choice).toBe('no');
    expect(offerState('u2')).toEqual({ seen: {} });
    localStorage.setItem('formanova_dfy_offer_v2_u4', 'not json');
    expect(offerState('u4')).toEqual({ seen: {} });
  });
});

describe('dashboard ignores an old close (owner, 2026-11-08)', () => {
  beforeEach(() => localStorage.clear());

  it('a dashboard close saved by the earlier version does not stop it; only a choice does', () => {
    markOfferSeen('u1', 'dashboard'); // what the earlier version saved on the X
    expect(shouldOffer({ userId: 'u1', paid: true, otherModalOpen: false, moment: 'dashboard' })).toBe(true);
    saveOfferChoice('u1', 'no');
    expect(shouldOffer({ userId: 'u1', paid: true, otherModalOpen: false, moment: 'dashboard' })).toBe(false);
  });
});
