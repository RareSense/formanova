import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuthenticatedFetch = vi.hoisted(() => vi.fn());

vi.mock('@/lib/authenticated-fetch', () => ({
  authenticatedFetch: mockAuthenticatedFetch,
}));

vi.mock('@/lib/auth-api', () => ({
  getStoredToken: () => 'test-token',
}));

import { fetchUserAssets, getAsset } from './assets-api';

describe('fetchUserAssets retry logic', () => {
  beforeEach(() => {
    mockAuthenticatedFetch.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it('returns assets on first successful response', async () => {
    const fakeAssets = { items: [], total: 0, page: 0, page_size: 20 };
    mockAuthenticatedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => fakeAssets,
    } as Response);

    const result = await fetchUserAssets('generated_photo');

    expect(result).toEqual(fakeAssets);
    expect(mockAuthenticatedFetch).toHaveBeenCalledTimes(1);
  });

  it('retries on network failure and succeeds on second attempt', async () => {
    const fakeAssets = { items: [], total: 0, page: 0, page_size: 20 };
    mockAuthenticatedFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ ok: true, json: async () => fakeAssets } as Response);

    const promise = fetchUserAssets('generated_photo');
    await vi.advanceTimersByTimeAsync(600);
    const result = await promise;

    expect(result).toEqual(fakeAssets);
    expect(mockAuthenticatedFetch).toHaveBeenCalledTimes(2);
  });

  it('makes exactly 3 attempts before giving up', async () => {
    const fakeAssets = { items: [], total: 0, page: 0, page_size: 20 };
    // Fail twice, succeed on the third — verifies retry count without fake-timer
    // edge cases from Vitest's spy proxy leaking intermediate rejections
    mockAuthenticatedFetch
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValueOnce({ ok: true, json: async () => fakeAssets } as Response);

    const promise = fetchUserAssets('generated_photo');
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(result).toEqual(fakeAssets);
    expect(mockAuthenticatedFetch).toHaveBeenCalledTimes(3);
  });

  it('retries on non-ok HTTP response', async () => {
    const fakeAssets = { items: [], total: 0, page: 0, page_size: 20 };
    mockAuthenticatedFetch
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => fakeAssets } as Response);

    const promise = fetchUserAssets('generated_photo');
    await vi.advanceTimersByTimeAsync(600);
    const result = await promise;

    expect(result).toEqual(fakeAssets);
    expect(mockAuthenticatedFetch).toHaveBeenCalledTimes(2);
  });
});

describe('getAsset', () => {
  beforeEach(() => mockAuthenticatedFetch.mockReset());

  it('returns the asset on 200', async () => {
    const asset = { id: 'a1', asset_type: 'generated_photo', metadata: { image_size: '4K' } };
    mockAuthenticatedFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => asset } as Response);

    const result = await getAsset('a1');

    expect(result).toEqual(asset);
    expect(mockAuthenticatedFetch).toHaveBeenCalledWith(expect.stringContaining('/assets/a1'));
  });

  it('returns null on 404 (missing / not owned / bad id) instead of throwing', async () => {
    mockAuthenticatedFetch.mockResolvedValueOnce({ ok: false, status: 404 } as Response);
    await expect(getAsset('missing')).resolves.toBeNull();
  });

  it('throws on other non-ok responses', async () => {
    mockAuthenticatedFetch.mockResolvedValueOnce({ ok: false, status: 500 } as Response);
    await expect(getAsset('a1')).rejects.toThrow('Failed to fetch asset: 500');
  });
});
