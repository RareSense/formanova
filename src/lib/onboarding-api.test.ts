import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/authenticated-fetch', () => ({
  authenticatedFetch: vi.fn(),
}));

import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { saveUserType, getCachedUserType, setCachedUserType, getAccountStatus, signTosAgreement } from '@/lib/onboarding-api';

const mockFetch = vi.mocked(authenticatedFetch);

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
  sessionStorage.clear();
});

describe('getCachedUserType', () => {
  it('fetches the profile once, then serves from the session cache', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ id: 'u1', user_type: 'jewelry_brand' }), { status: 200 }),
    );
    expect(await getCachedUserType('u1')).toBe('jewelry_brand');
    expect(await getCachedUserType('u1')).toBe('jewelry_brand');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns a seeded value without fetching', async () => {
    setCachedUserType('u2', 'freelancer');
    expect(await getCachedUserType('u2')).toBe('freelancer');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns null and does not cache on fetch failure', async () => {
    mockFetch.mockRejectedValue(new Error('network'));
    expect(await getCachedUserType('u3')).toBeNull();
    expect(sessionStorage.getItem('formanova_user_type_u3')).toBeNull();
  });
});

describe('saveUserType', () => {
  it('sends only user_type when no brand details are given', async () => {
    await saveUserType('freelancer');
    const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
    expect(body).toEqual({ user_type: 'freelancer' });
  });

  it('includes brand fields, physical_location among them, when provided', async () => {
    await saveUserType('jewelry_brand', {
      brand_name: 'Ice Cartel',
      website_url: 'https://icecartel.com',
      physical_location: '123 Main St, Miami',
      social_links: ['https://instagram.com/icecartel'],
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
    expect(body).toEqual({
      user_type: 'jewelry_brand',
      brand_name: 'Ice Cartel',
      website_url: 'https://icecartel.com',
      physical_location: '123 Main St, Miami',
      social_links: ['https://instagram.com/icecartel'],
    });
  });

  it('omits empty optional brand fields', async () => {
    await saveUserType('jewelry_brand', {
      brand_name: 'Ice Cartel',
      website_url: '',
      physical_location: '',
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

/** Answers GET /api/user/profile and GET /history/workflows/me by URL. */
function serve(profile: Response | Error, history: Response | Error) {
  mockFetch.mockImplementation(async (url: string) => {
    const r = String(url).startsWith('/api/user/profile') ? profile : history;
    if (r instanceof Error) throw r;
    return r.clone();
  });
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('getAccountStatus', () => {
  it('is "known" when the server already holds a role', async () => {
    serve(json({ id: 'u1', user_type: 'freelancer' }), json([{ id: 'w1' }]));
    expect(await getAccountStatus()).toBe('known');
  });

  it('is "new" only when there is no role AND no run has ever been made', async () => {
    serve(json({ id: 'u1', user_type: null }), json([]));
    expect(await getAccountStatus()).toBe('new');
    serve(json({ id: 'u1', user_type: null }), json({ workflows: [] }));
    expect(await getAccountStatus()).toBe('new');
  });

  it('is "existing_without_role" for an account that has run something but never picked a role', async () => {
    serve(json({ id: 'u1', user_type: null }), json([{ id: 'w1' }]));
    expect(await getAccountStatus()).toBe('existing_without_role');
    serve(json({ id: 'u1', user_type: null }), json({ workflows: [{ id: 'w1' }] }));
    expect(await getAccountStatus()).toBe('existing_without_role');
  });

  it('asks history for one run only', async () => {
    serve(json({ id: 'u1', user_type: null }), json([]));
    await getAccountStatus();
    expect(mockFetch).toHaveBeenCalledWith('/history/workflows/me?limit=1&offset=0');
  });

  it('is null (unknown) when either call fails or answers oddly, and never throws', async () => {
    serve(new Response('nope', { status: 500 }), json([]));
    expect(await getAccountStatus()).toBeNull();
    serve(json({ id: 'u1', user_type: null }), new Response('nope', { status: 500 }));
    expect(await getAccountStatus()).toBeNull();
    serve(json({ id: 'u1', user_type: null }), new Error('network'));
    expect(await getAccountStatus()).toBeNull();
    serve(json({ id: 'u1', user_type: null }), json({ unexpected: true }));
    expect(await getAccountStatus()).toBeNull();
  });

  it('a role answers "known" even if history fails', async () => {
    serve(json({ id: 'u1', user_type: 'other' }), new Error('network'));
    expect(await getAccountStatus()).toBe('known');
  });
});

describe('signTosAgreement', () => {
  it('records Terms v1.0 with exactly the type and version the server expects', async () => {
    mockFetch.mockResolvedValue(new Response('{}', { status: 201 }));
    await signTosAgreement();
    expect(mockFetch).toHaveBeenCalledWith('/api/user/acknowledgements', expect.objectContaining({ method: 'POST' }));
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ acknowledgement_type: 'tos', version: '1.0' });
  });

  it('treats a repeat (200, already signed) as success', async () => {
    mockFetch.mockResolvedValue(new Response('{}', { status: 200 }));
    await expect(signTosAgreement()).resolves.toBeUndefined();
  });

  it('throws on failure so the caller can stop', async () => {
    mockFetch.mockResolvedValue(new Response('no', { status: 500 }));
    await expect(signTosAgreement()).rejects.toThrow();
  });
});
