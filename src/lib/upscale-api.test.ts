import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock authenticatedFetch before any module imports ─────────────────────────
const mockAuthFetch = vi.hoisted(() => vi.fn());

vi.mock('@/lib/authenticated-fetch', () => ({
  authenticatedFetch: mockAuthFetch,
  AuthExpiredError: class AuthExpiredError extends Error {
    constructor() {
      super('AUTH_EXPIRED');
      this.name = 'AuthExpiredError';
    }
  },
}));

import {
  computeUpscaleFactors,
  tierForUpscale,
  estimateUpscaleCost,
  estimateUpscaleCostCached,
  upscaleEstimateKey,
  startUpscale,
  UPSCALE_MAX_FACTOR,
  UPSCALE_MAX_LONG_EDGE,
} from './upscale-api';

// ── Response helpers ──────────────────────────────────────────────────────────

function okResponse(body: unknown): Promise<Response> {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response);
}

function errorResponse(status: number, body = ''): Promise<Response> {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(body),
  } as unknown as Response);
}

beforeEach(() => {
  mockAuthFetch.mockReset();
});

// ── computeUpscaleFactors ───────────────────────────────────────────────────

describe('computeUpscaleFactors', () => {
  it('offers x2..x9 for a 1K image (1024px long edge)', () => {
    expect(computeUpscaleFactors(1024)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('caps at x8 for a 2K image (2048px long edge)', () => {
    // floor(16384 / 2048) = 8
    expect(computeUpscaleFactors(2048)).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });

  it('caps at x4 for a 4K image (4096px long edge)', () => {
    // floor(16384 / 4096) = 4
    expect(computeUpscaleFactors(4096)).toEqual([2, 3, 4]);
  });

  it('uses the real long edge, not the tier label (2K at 3:4 -> 2400px -> x6)', () => {
    // floor(16384 / 2400) = 6 — must not show x8
    expect(computeUpscaleFactors(2400)).toEqual([2, 3, 4, 5, 6]);
  });

  it('never exceeds the hard x9 ceiling for tiny images', () => {
    const factors = computeUpscaleFactors(100);
    expect(factors[factors.length - 1]).toBe(UPSCALE_MAX_FACTOR);
  });

  it('returns [] when the image is already at/over the cap', () => {
    expect(computeUpscaleFactors(UPSCALE_MAX_LONG_EDGE)).toEqual([]);
    expect(computeUpscaleFactors(UPSCALE_MAX_LONG_EDGE + 1)).toEqual([]);
  });

  it('returns [] for invalid input', () => {
    expect(computeUpscaleFactors(0)).toEqual([]);
    expect(computeUpscaleFactors(-50)).toEqual([]);
    expect(computeUpscaleFactors(NaN)).toEqual([]);
  });
});

// ── tierForUpscale ──────────────────────────────────────────────────────────

describe('tierForUpscale', () => {
  it('lowercases the tier label', () => {
    expect(tierForUpscale('1K')).toBe('1k');
    expect(tierForUpscale('2K')).toBe('2k');
    expect(tierForUpscale('4K')).toBe('4k');
  });
});

// ── estimateUpscaleCost ─────────────────────────────────────────────────────

describe('estimateUpscaleCost', () => {
  it('posts workflow_name, num_variations and pricing_context', async () => {
    mockAuthFetch.mockReturnValueOnce(okResponse({ projected_max_hold: 30 }));

    await estimateUpscaleCost({ resolution: '1K', factor: 4 });

    expect(mockAuthFetch).toHaveBeenCalledWith(
      '/api/credits/estimate',
      expect.objectContaining({ method: 'POST' }),
    );
    const [, options] = mockAuthFetch.mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body).toEqual({
      workflow_name: 'upscale_image',
      num_variations: 1,
      pricing_context: { image_size: '1k', factor: 4 },
    });
  });

  it('sends factor as an integer', async () => {
    mockAuthFetch.mockReturnValueOnce(okResponse({ projected_max_hold: 10 }));

    await estimateUpscaleCost({ resolution: '1K', factor: 2.9 as unknown as number });

    const [, options] = mockAuthFetch.mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.pricing_context.factor).toBe(2);
  });

  it('returns the projected_max_hold value', async () => {
    mockAuthFetch.mockReturnValueOnce(okResponse({ projected_max_hold: 60 }));
    expect(await estimateUpscaleCost({ resolution: '2K', factor: 5 })).toBe(60);
  });

  it('falls back to estimated_credits when projected_max_hold is absent', async () => {
    mockAuthFetch.mockReturnValueOnce(okResponse({ estimated_credits: 40 }));
    expect(await estimateUpscaleCost({ resolution: '4K', factor: 2 })).toBe(40);
  });

  it('returns null on a non-ok response', async () => {
    mockAuthFetch.mockReturnValueOnce(errorResponse(500));
    expect(await estimateUpscaleCost({ resolution: '1K', factor: 2 })).toBeNull();
  });

  it('returns null on a non-positive cost', async () => {
    mockAuthFetch.mockReturnValueOnce(okResponse({ projected_max_hold: 0 }));
    expect(await estimateUpscaleCost({ resolution: '1K', factor: 2 })).toBeNull();
  });

  it('returns null when the fetch throws', async () => {
    mockAuthFetch.mockRejectedValueOnce(new Error('network'));
    expect(await estimateUpscaleCost({ resolution: '1K', factor: 2 })).toBeNull();
  });
});

// ── estimateUpscaleCostCached ───────────────────────────────────────────────

describe('estimateUpscaleCostCached', () => {
  it('builds a tier:factor key', () => {
    expect(upscaleEstimateKey('2K', 4)).toBe('2k:4');
    expect(upscaleEstimateKey('1K', 2.7 as unknown as number)).toBe('1k:2');
  });

  it('caches a successful estimate (one network call for repeats)', async () => {
    mockAuthFetch.mockReturnValueOnce(okResponse({ projected_max_hold: 60 }));

    // Use a unique tier+factor to avoid cross-test cache pollution.
    const first = await estimateUpscaleCostCached({ resolution: '4K', factor: 3 });
    const second = await estimateUpscaleCostCached({ resolution: '4K', factor: 3 });

    expect(first).toBe(60);
    expect(second).toBe(60);
    expect(mockAuthFetch).toHaveBeenCalledTimes(1);
  });

  it('does NOT cache a failed estimate (retries on next call)', async () => {
    mockAuthFetch.mockReturnValueOnce(errorResponse(500));
    mockAuthFetch.mockReturnValueOnce(okResponse({ projected_max_hold: 20 }));

    const first = await estimateUpscaleCostCached({ resolution: '2K', factor: 7 });
    const second = await estimateUpscaleCostCached({ resolution: '2K', factor: 7 });

    expect(first).toBeNull();
    expect(second).toBe(20);
    expect(mockAuthFetch).toHaveBeenCalledTimes(2);
  });
});

// ── startUpscale ────────────────────────────────────────────────────────────

const BASE_START = {
  imageUri: 'https://example.com/generation.png',
  factor: 4,
  resolution: '2K' as const,
};

describe('startUpscale', () => {
  it('calls POST /api/run/state/upscale_image', async () => {
    mockAuthFetch.mockReturnValueOnce(okResponse({ workflow_id: 'wf1', status_url: '/s', result_url: '/r' }));

    await startUpscale(BASE_START);

    expect(mockAuthFetch).toHaveBeenCalledWith(
      '/api/run/state/upscale_image',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('wraps the payload with image.uri, integer factor and lowercase image_size', async () => {
    mockAuthFetch.mockReturnValueOnce(okResponse({ workflow_id: 'wf1', status_url: '/s', result_url: '/r' }));

    await startUpscale(BASE_START);

    const [, options] = mockAuthFetch.mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.payload.image).toEqual({ uri: 'https://example.com/generation.png' });
    expect(body.payload.factor).toBe(4);
    expect(typeof body.payload.factor).toBe('number');
    expect(body.payload.image_size).toBe('2k');
  });

  it('coerces a float factor to an integer', async () => {
    mockAuthFetch.mockReturnValueOnce(okResponse({ workflow_id: 'wf1' }));

    await startUpscale({ ...BASE_START, factor: 5.9 });

    const [, options] = mockAuthFetch.mock.calls[0];
    const body = JSON.parse((options as RequestInit).body as string);
    expect(body.payload.factor).toBe(5);
  });

  it('throws when the image URI is missing', async () => {
    await expect(startUpscale({ ...BASE_START, imageUri: '' })).rejects.toThrow(/image URI/i);
    expect(mockAuthFetch).not.toHaveBeenCalled();
  });

  it('throws when the factor is out of range', async () => {
    await expect(startUpscale({ ...BASE_START, factor: 1 })).rejects.toThrow(/factor/i);
    await expect(startUpscale({ ...BASE_START, factor: 10 })).rejects.toThrow(/factor/i);
    expect(mockAuthFetch).not.toHaveBeenCalled();
  });

  it('throws a descriptive error on a non-ok response', async () => {
    mockAuthFetch.mockReturnValueOnce(errorResponse(402, 'insufficient credits'));
    await expect(startUpscale(BASE_START)).rejects.toThrow(/Failed to start upscale: 402/);
  });

  it('returns the parsed start response', async () => {
    mockAuthFetch.mockReturnValueOnce(okResponse({ workflow_id: 'wf-xyz', status_url: '/s', result_url: '/r' }));
    const res = await startUpscale(BASE_START);
    expect(res.workflow_id).toBe('wf-xyz');
  });
});
