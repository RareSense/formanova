import { describe, it, expect, beforeEach } from 'vitest';
import {
  savePostPurchaseReturn,
  getPostPurchaseReturn,
  clearPostPurchaseReturn,
} from './post-purchase-return';

describe('post-purchase-return', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('returns the fallback when nothing is stored', () => {
    expect(getPostPurchaseReturn('/credits')).toBe('/credits');
  });

  it('round-trips a saved studio path (door-in -> door-out)', () => {
    savePostPurchaseReturn('/studio/necklace?mode=product-shot');
    expect(getPostPurchaseReturn('/credits')).toBe('/studio/necklace?mode=product-shot');
  });

  it('getPostPurchaseReturn does not clear the value (so a failed checkout can retry)', () => {
    savePostPurchaseReturn('/studio/ring');
    getPostPurchaseReturn();
    expect(getPostPurchaseReturn('/credits')).toBe('/studio/ring');
  });

  it('clearPostPurchaseReturn removes the value so later purchases default to fallback', () => {
    savePostPurchaseReturn('/studio/ring');
    clearPostPurchaseReturn();
    expect(getPostPurchaseReturn('/credits')).toBe('/credits');
  });
});
