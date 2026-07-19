import { describe, expect, it } from 'vitest';

import {
  formatRelativeShopifyTime,
  isValidShopifySubdomain,
  normalizeShopifySubdomain,
} from '@/lib/shopify-utils';

describe('shopify-utils', () => {
  it('normalizes a subdomain by trimming spaces and lowercasing', () => {
    expect(normalizeShopifySubdomain(' FormaNova-Demo ')).toBe('formanova-demo');
  });

  it('validates allowed Shopify subdomain characters', () => {
    expect(isValidShopifySubdomain('maevori-jewelry')).toBe(true);
    expect(isValidShopifySubdomain('bad domain')).toBe(false);
    expect(isValidShopifySubdomain('bad.domain')).toBe(false);
  });

  it('formats relative last used copy and handles null', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeShopifyTime(twoDaysAgo)).toContain('day');
    expect(formatRelativeShopifyTime(null)).toBe('Never');
  });
});
