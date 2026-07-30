import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/authenticated-fetch', () => ({
  authenticatedFetch: vi.fn(),
}));

import { authenticatedFetch } from '@/lib/authenticated-fetch';
import {
  normalizeUrl,
  isValidHttpUrl,
  isValidHandle,
  patchBrandProfile,
  fetchBrandProfile,
  uploadBrandBook,
  deleteBrandBook,
  GENERIC_ERROR,
} from '@/lib/brand-profile-api';

const mockFetch = vi.mocked(authenticatedFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('isValidHttpUrl', () => {
  it('accepts normalized domains with and without www', () => {
    expect(isValidHttpUrl('https://icecartel.com')).toBe(true);
    expect(isValidHttpUrl('https://www.icecartel.com/collections/all')).toBe(true);
    expect(isValidHttpUrl('http://icecartel.com')).toBe(true);
  });

  it('rejects hostnames without a dot, spaces, and non-http schemes', () => {
    expect(isValidHttpUrl('https://icecartel')).toBe(false);
    expect(isValidHttpUrl('https://ice cartel.com')).toBe(false);
    expect(isValidHttpUrl('ftp://icecartel.com')).toBe(false);
    expect(isValidHttpUrl('not a url')).toBe(false);
    expect(isValidHttpUrl('')).toBe(false);
  });
});

describe('isValidHandle', () => {
  it('accepts letters, digits, dots, underscores, dashes', () => {
    expect(isValidHandle('ice.cartel_2-x')).toBe(true);
  });

  it('rejects spaces, slashes, and at-signs', () => {
    expect(isValidHandle('ice cartel')).toBe(false);
    expect(isValidHandle('ice/cartel')).toBe(false);
    expect(isValidHandle('@icecartel')).toBe(false);
    expect(isValidHandle('')).toBe(false);
  });
});

describe('normalizeUrl', () => {
  it('prefixes https:// when the scheme is missing', () => {
    expect(normalizeUrl('mybrand.com')).toBe('https://mybrand.com');
  });

  it('keeps existing http(s) schemes', () => {
    expect(normalizeUrl('http://mybrand.com')).toBe('http://mybrand.com');
    expect(normalizeUrl('https://mybrand.com')).toBe('https://mybrand.com');
    expect(normalizeUrl('HTTPS://mybrand.com')).toBe('HTTPS://mybrand.com');
  });

  it('returns empty string for blank input', () => {
    expect(normalizeUrl('')).toBe('');
    expect(normalizeUrl('   ')).toBe('');
  });

  it('trims whitespace', () => {
    expect(normalizeUrl('  mybrand.com  ')).toBe('https://mybrand.com');
  });
});

describe('patchBrandProfile', () => {
  it('PATCHes /api/user/profile and returns null on success', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ success: true }));
    const result = await patchBrandProfile({ brand_name: 'Ice Cartel' });
    expect(result).toBeNull();
    expect(mockFetch).toHaveBeenCalledWith('/api/user/profile', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ brand_name: 'Ice Cartel' }),
    }));
  });

  it('returns joined field-level messages on 422', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ detail: { website_url: 'invalid URL' } }, 422));
    const result = await patchBrandProfile({ website_url: 'nope' });
    expect(result).toBe('website url: invalid URL');
  });

  it('joins multiple 422 field errors', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ detail: { website_url: 'invalid URL', storefront_url: 'invalid URL' } }, 422),
    );
    const result = await patchBrandProfile({ website_url: 'a', storefront_url: 'b' });
    expect(result).toContain('website url: invalid URL');
    expect(result).toContain('storefront url: invalid URL');
  });

  it('returns a generic error on non-422 failures', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 500));
    expect(await patchBrandProfile({ brand_name: 'X' })).toBe(GENERIC_ERROR);
  });

  it('returns a generic error when the request throws', async () => {
    mockFetch.mockRejectedValue(new Error('network'));
    expect(await patchBrandProfile({ brand_name: 'X' })).toBe(GENERIC_ERROR);
  });
});

describe('fetchBrandProfile', () => {
  it('maps null/missing fields to empty defaults', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ id: 'u1', email: 'x@y.com' }));
    const profile = await fetchBrandProfile();
    expect(profile).toEqual({
      brand_name: '',
      website_url: '',
      storefront_url: '',
      physical_location: '',
      social_links: [],
      based_in: '',
      target_markets: [],
      brand_book_asset_id: null,
    });
  });

  it('passes through populated fields', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      brand_name: 'Ice Cartel',
      social_links: ['https://instagram.com/icecartel'],
      brand_book_asset_id: 'asset_1',
    }));
    const profile = await fetchBrandProfile();
    expect(profile.brand_name).toBe('Ice Cartel');
    expect(profile.social_links).toEqual(['https://instagram.com/icecartel']);
    expect(profile.brand_book_asset_id).toBe('asset_1');
  });
});

describe('uploadBrandBook', () => {
  it('rejects oversized files client-side without calling the API', async () => {
    const big = new File([new ArrayBuffer(1)], 'big.pdf');
    Object.defineProperty(big, 'size', { value: 21 * 1024 * 1024 });
    const result = await uploadBrandBook(big);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('20 MB');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns asset info on success', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ asset_id: 'a1', filename: 'book.pdf', url: 'https://x/artifacts/1' }));
    const result = await uploadBrandBook(new File(['x'], 'book.pdf'));
    expect(result).toEqual({ ok: true, assetId: 'a1', filename: 'book.pdf', url: 'https://x/artifacts/1' });
  });

  it('maps 413 and 400 to specific messages', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 413));
    expect((await uploadBrandBook(new File(['x'], 'b.pdf'))).error).toContain('20 MB');
    mockFetch.mockResolvedValue(jsonResponse({}, 400));
    expect((await uploadBrandBook(new File(['x'], 'b.pdf'))).error).toContain('Unsupported file type');
  });
});

describe('deleteBrandBook', () => {
  it('returns null on success and an error message on failure', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ success: true }));
    expect(await deleteBrandBook()).toBeNull();
    mockFetch.mockResolvedValue(jsonResponse({}, 500));
    expect(await deleteBrandBook()).toContain('Could not remove');
  });
});
