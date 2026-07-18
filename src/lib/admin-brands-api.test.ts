import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/authenticated-fetch', () => ({
  authenticatedFetch: vi.fn(),
}));

import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { listAdminBrands, getAdminBrandDetail, AdminBrandsApiError, STORE_PLATFORMS } from '@/lib/admin-brands-api';

const mockFetch = vi.mocked(authenticatedFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('STORE_PLATFORMS', () => {
  it('includes all 9 backend values, including magento and webflow', () => {
    expect(STORE_PLATFORMS).toHaveLength(9);
    expect(STORE_PLATFORMS).toContain('magento');
    expect(STORE_PLATFORMS).toContain('webflow');
    expect(STORE_PLATFORMS).toContain('unknown');
  });
});

describe('listAdminBrands', () => {
  it('builds query params only for provided filters', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ total: 0, limit: 20, offset: 0, items: [] }));
    await listAdminBrands({ limit: 20, offset: 40, search: 'ice', platform: 'shopify', has_brand: true });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('limit=20');
    expect(url).toContain('offset=40');
    expect(url).toContain('search=ice');
    expect(url).toContain('platform=shopify');
    expect(url).toContain('has_brand=true');
    expect(url).not.toContain('has_store');
    expect(url).not.toContain('location');
  });

  it('calls the bare endpoint with no params', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ total: 0, items: [] }));
    await listAdminBrands();
    expect(mockFetch.mock.calls[0][0]).toBe('/api/admin/users/brands');
  });

  it('normalizes items with null brand fields', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      total: 1,
      items: [{ user_id: 'u1', email: 'x@y.com' }],
    }));
    const result = await listAdminBrands();
    expect(result.items[0]).toEqual({
      user_id: 'u1',
      email: 'x@y.com',
      user_type: null,
      brand_name: null,
      website_url: null,
      store_url: null,
      store_platform: null,
      social_links: [],
      based_in: null,
      target_markets: [],
      brand_book_asset_id: null,
      brand_updated_at: null,
    });
  });

  it('throws AdminBrandsApiError with status on failure', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ detail: 'forbidden' }, 403));
    await expect(listAdminBrands()).rejects.toMatchObject({ status: 403, message: 'forbidden' });
    mockFetch.mockResolvedValue(jsonResponse({ detail: 'forbidden' }, 403));
    await expect(listAdminBrands()).rejects.toBeInstanceOf(AdminBrandsApiError);
  });
});

describe('getAdminBrandDetail', () => {
  it('fetches the single-user endpoint and includes brand_book_url', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      user_id: 'u1',
      email: 'x@y.com',
      brand_name: 'Ice Cartel',
      brand_book_url: 'https://x/artifacts/1',
    }));
    const detail = await getAdminBrandDetail('u1');
    expect(mockFetch.mock.calls[0][0]).toBe('/api/admin/users/u1/brand');
    expect(detail.brand_name).toBe('Ice Cartel');
    expect(detail.brand_book_url).toBe('https://x/artifacts/1');
  });

  it('defaults brand_book_url to null', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ user_id: 'u1', email: 'x@y.com' }));
    const detail = await getAdminBrandDetail('u1');
    expect(detail.brand_book_url).toBeNull();
  });
});
