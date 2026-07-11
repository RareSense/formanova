import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/authenticated-fetch', () => ({
  authenticatedFetch: vi.fn(),
}));

import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { saveUserType } from '@/lib/onboarding-api';

const mockFetch = vi.mocked(authenticatedFetch);

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
});

describe('saveUserType', () => {
  it('sends only user_type when no brand details are given', async () => {
    await saveUserType('freelancer');
    const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
    expect(body).toEqual({ user_type: 'freelancer' });
  });

  it('includes brand fields, store_url among them, when provided', async () => {
    await saveUserType('jewelry_brand', {
      brand_name: 'Ice Cartel',
      website_url: 'https://icecartel.com',
      store_url: 'https://icecartel.com/collections/all',
      social_links: ['https://instagram.com/icecartel'],
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
    expect(body).toEqual({
      user_type: 'jewelry_brand',
      brand_name: 'Ice Cartel',
      website_url: 'https://icecartel.com',
      store_url: 'https://icecartel.com/collections/all',
      social_links: ['https://instagram.com/icecartel'],
    });
  });

  it('omits empty optional brand fields', async () => {
    await saveUserType('jewelry_brand', {
      brand_name: 'Ice Cartel',
      website_url: '',
      store_url: '',
      social_links: [],
      based_in: '',
      target_markets: [],
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
    expect(body).toEqual({ user_type: 'jewelry_brand', brand_name: 'Ice Cartel' });
  });

  it('includes based_in and target_markets when provided', async () => {
    await saveUserType('jewelry_brand', {
      brand_name: 'Ice Cartel',
      based_in: 'New York, US',
      target_markets: ['US', 'UAE'],
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
    expect(body).toEqual({
      user_type: 'jewelry_brand',
      brand_name: 'Ice Cartel',
      based_in: 'New York, US',
      target_markets: ['US', 'UAE'],
    });
  });

  it('throws on a failed response', async () => {
    mockFetch.mockResolvedValue(new Response('{}', { status: 500 }));
    await expect(saveUserType('other')).rejects.toThrow();
  });
});
