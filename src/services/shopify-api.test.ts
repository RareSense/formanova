import { beforeEach, describe, expect, it, vi } from 'vitest';

const authenticatedFetch = vi.fn();

vi.mock('@/lib/authenticated-fetch', () => ({
  authenticatedFetch: (...args: unknown[]) => authenticatedFetch(...args),
}));

import { getShopifyStatus, linkShopify, LinkTokenExpiredError } from './shopify-api';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('shopify-api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns disconnected status when shopify is not connected', async () => {
    authenticatedFetch.mockResolvedValueOnce(jsonResponse(404, { detail: 'Not connected' }));

    await expect(getShopifyStatus()).resolves.toEqual({ connected: false });
  });

  it('returns connected status payload on success', async () => {
    authenticatedFetch.mockResolvedValueOnce(jsonResponse(200, {
      connected: true,
      shop_name: 'Test Store',
      shop_domain: 'test-store.myshopify.com',
      auto_suggest: true,
      last_used_at: '2026-05-21T12:00:00Z',
    }));

    await expect(getShopifyStatus()).resolves.toEqual({
      connected: true,
      shop_name: 'Test Store',
      shop_domain: 'test-store.myshopify.com',
      auto_suggest: true,
      last_used_at: '2026-05-21T12:00:00Z',
    });
  });

  it('throws on unexpected status failures', async () => {
    authenticatedFetch.mockResolvedValueOnce(jsonResponse(500, { detail: 'Server error' }));

    await expect(getShopifyStatus()).rejects.toThrow('Failed to fetch Shopify status');
  });
});

describe('linkShopify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts link_token to /api/shopify/link', async () => {
    authenticatedFetch.mockResolvedValueOnce(jsonResponse(200, {}));

    await linkShopify('tok_abc123');

    expect(authenticatedFetch).toHaveBeenCalledWith('/api/shopify/link', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ link_token: 'tok_abc123' }),
    }));
  });

  it('resolves without a value on success', async () => {
    authenticatedFetch.mockResolvedValueOnce(jsonResponse(200, {}));

    await expect(linkShopify('tok_abc123')).resolves.toBeUndefined();
  });

  it('throws LinkTokenExpiredError on 410', async () => {
    authenticatedFetch.mockResolvedValueOnce(jsonResponse(410, { detail: 'link_token_expired' }));

    await expect(linkShopify('tok_expired')).rejects.toBeInstanceOf(LinkTokenExpiredError);
  });

  it('throws on non-ok, non-410 response', async () => {
    authenticatedFetch.mockResolvedValueOnce(jsonResponse(400, {}));

    await expect(linkShopify('tok_bad')).rejects.toThrow('Failed to link Shopify store');
  });
});
