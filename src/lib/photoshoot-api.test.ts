import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock authenticatedFetch before any module imports ─────────────────────────
// vi.hoisted ensures the mock reference is available before the module under
// test is evaluated (Vitest hoists vi.mock() calls automatically).
const mockAuthFetch = vi.hoisted(() => vi.fn());

vi.mock('@/lib/authenticated-fetch', () => ({
  authenticatedFetch: mockAuthFetch,
  // Provide a real-enough AuthExpiredError so instanceof checks work if added later
  AuthExpiredError: class AuthExpiredError extends Error {
    constructor() {
      super('AUTH_EXPIRED');
      this.name = 'AuthExpiredError';
    }
  },
}));

import {
  startPhotoshoot,
  getPhotoshootStatus,
  getPhotoshootResult,
  startPdpShot,
  startFixShot,
  getJewelryDescription,
} from './photoshoot-api';

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

const BASE_PHOTO_REQUEST = {
  jewelry_image_url: 'https://example.com/jewelry.jpg',
  model_image_url: 'https://example.com/model.jpg',
  category: 'rings',
};

const BASE_PDP_REQUEST = {
  jewelry_image_url: 'https://example.com/jewelry.jpg',
  inspiration_image_url: 'https://example.com/inspo.jpg',
  category: 'rings',
};

beforeEach(() => {
  mockAuthFetch.mockReset();
});

// ── startPhotoshoot ───────────────────────────────────────────────────────────

describe('startPhotoshoot', () => {
  it('calls authenticatedFetch with correct URL', async () => {
    mockAuthFetch.mockReturnValueOnce(okResponse({ workflow_id: 'wf1', status_url: '/s', result_url: '/r' }));

    await startPhotoshoot(BASE_PHOTO_REQUEST);

    expect(mockAuthFetch).toHaveBeenCalledWith(
      '/api/run/state/jewelry_photoshoots_generator',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('sends Content-Type: application/json header', async () => {
    mockAuthFetch.mockReturnValueOnce(okResponse({ workflow_id: 'wf1', status_url: '/s', result_url: '/r' }));

    await startPhotoshoot(BASE_PHOTO_REQUEST);

    const [, options] = mockAuthFetch.mock.calls[0];
    expect((options.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('includes jewelry and model URLs in the request body', async () => {
    mockAuthFetch.mockReturnValueOnce(okResponse({ workflow_id: 'wf1', status_url: '/s', result_url: '/r' }));

    await startPhotoshoot(BASE_PHOTO_REQUEST);

    const [, options] = mockAuthFetch.mock.calls[0];
    const body = JSON.parse(options.body as string);
    expect(body.payload.jewelry_image_url).toBe('https://example.com/jewelry.jpg');
    expect(body.payload.model_image_url).toBe('https://example.com/model.jpg');
  });

  it('returns the parsed response on success', async () => {
    const expected = { workflow_id: 'wf1', status_url: '/s', result_url: '/r' };
    mockAuthFetch.mockReturnValueOnce(okResponse(expected));

    const result = await startPhotoshoot(BASE_PHOTO_REQUEST);
    expect(result).toEqual(expected);
  });

  it('throws a descriptive error on non-401 failure', async () => {
    mockAuthFetch.mockReturnValueOnce(errorResponse(500, 'Internal Server Error'));

    await expect(startPhotoshoot(BASE_PHOTO_REQUEST)).rejects.toThrow('Failed to start photoshoot: 500');
  });

  it('propagates AuthExpiredError without wrapping it', async () => {
    const authErr = Object.assign(new Error('AUTH_EXPIRED'), { name: 'AuthExpiredError' });
    mockAuthFetch.mockRejectedValueOnce(authErr);

    const err = await startPhotoshoot(BASE_PHOTO_REQUEST).catch(e => e);
    expect(err.name).toBe('AuthExpiredError');
    expect(err.message).toBe('AUTH_EXPIRED');
    // Must NOT be wrapped as a photoshoot-specific error
    expect(err.message).not.toContain('Failed to start photoshoot');
  });
});

// ── getPhotoshootStatus ───────────────────────────────────────────────────────

describe('getPhotoshootStatus', () => {
  it('returns { state: "running" } on 404', async () => {
    mockAuthFetch.mockReturnValueOnce(errorResponse(404));

    const result = await getPhotoshootStatus('wf1');
    expect(result).toEqual({ state: 'running' });
  });

  it('returns parsed response on 200', async () => {
    const body = { state: 'completed' };
    mockAuthFetch.mockReturnValueOnce(okResponse(body));

    const result = await getPhotoshootStatus('wf1');
    expect(result).toEqual(body);
  });

  it('calls authenticatedFetch with the correct status URL', async () => {
    mockAuthFetch.mockReturnValueOnce(okResponse({ state: 'running' }));

    await getPhotoshootStatus('abc-123');
    expect(mockAuthFetch).toHaveBeenCalledWith('/api/status/abc-123');
  });

  it('throws a descriptive error on non-404 failure', async () => {
    mockAuthFetch.mockReturnValueOnce(errorResponse(503, 'unavailable'));

    await expect(getPhotoshootStatus('wf1')).rejects.toThrow('Status check failed: 503');
  });

  it('propagates AuthExpiredError without wrapping it', async () => {
    const authErr = Object.assign(new Error('AUTH_EXPIRED'), { name: 'AuthExpiredError' });
    mockAuthFetch.mockRejectedValueOnce(authErr);

    const err = await getPhotoshootStatus('wf1').catch(e => e);
    expect(err.name).toBe('AuthExpiredError');
    expect(err.message).not.toContain('Status check failed');
  });
});

// ── getPhotoshootResult ───────────────────────────────────────────────────────

describe('getPhotoshootResult', () => {
  it('retries on 404 and returns result on eventual success', async () => {
    const expected = { steps: ['step1'] };
    mockAuthFetch
      .mockReturnValueOnce(errorResponse(404))
      .mockReturnValueOnce(errorResponse(404))
      .mockReturnValueOnce(okResponse(expected));

    const result = await getPhotoshootResult('wf1', 5, 0);

    expect(mockAuthFetch).toHaveBeenCalledTimes(3);
    expect(result).toEqual(expected);
  });

  it('throws after exhausting all retries on repeated 404', async () => {
    mockAuthFetch.mockReturnValue(errorResponse(404));

    await expect(getPhotoshootResult('wf1', 2, 0)).rejects.toThrow('Result not ready yet (404)');
    // maxRetries=2 → attempts 0,1,2 = 3 calls total
    expect(mockAuthFetch).toHaveBeenCalledTimes(3);
  });

  it('calls authenticatedFetch with the correct result URL', async () => {
    mockAuthFetch.mockReturnValueOnce(okResponse({}));

    await getPhotoshootResult('xyz-789', 5, 0);
    expect(mockAuthFetch).toHaveBeenCalledWith('/api/result/xyz-789');
  });

  it('throws immediately on non-404 error without retrying', async () => {
    mockAuthFetch.mockReturnValueOnce(errorResponse(500, 'server error'));

    await expect(getPhotoshootResult('wf1', 5, 0)).rejects.toThrow('Result fetch failed: 500');
    expect(mockAuthFetch).toHaveBeenCalledTimes(1);
  });

  it('propagates AuthExpiredError without wrapping it', async () => {
    const authErr = Object.assign(new Error('AUTH_EXPIRED'), { name: 'AuthExpiredError' });
    mockAuthFetch.mockRejectedValueOnce(authErr);

    const err = await getPhotoshootResult('wf1', 5, 0).catch(e => e);
    expect(err.name).toBe('AuthExpiredError');
    expect(err.message).not.toContain('Result fetch failed');
  });
});

// ── startPdpShot ──────────────────────────────────────────────────────────────

describe('startPdpShot', () => {
  it('calls authenticatedFetch with /api/run/Product_shot_pipeline', async () => {
    mockAuthFetch.mockReturnValueOnce(okResponse({ workflow_id: 'wf2', status_url: '/s', result_url: '/r' }));

    await startPdpShot(BASE_PDP_REQUEST);

    expect(mockAuthFetch).toHaveBeenCalledWith(
      '/api/run/Product_shot_pipeline',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('maps jewelry_image_url to jewelry_image_urls array in the body', async () => {
    mockAuthFetch.mockReturnValueOnce(okResponse({ workflow_id: 'wf2', status_url: '/s', result_url: '/r' }));

    await startPdpShot(BASE_PDP_REQUEST);

    const [, options] = mockAuthFetch.mock.calls[0];
    const body = JSON.parse(options.body as string);
    expect(body.payload.jewelry_image_urls).toEqual(['https://example.com/jewelry.jpg']);
    // Internal field must not be forwarded
    expect(body.payload.jewelry_image_url).toBeUndefined();
  });

  it('sends Content-Type: application/json header', async () => {
    mockAuthFetch.mockReturnValueOnce(okResponse({ workflow_id: 'wf2', status_url: '/s', result_url: '/r' }));

    await startPdpShot(BASE_PDP_REQUEST);

    const [, options] = mockAuthFetch.mock.calls[0];
    expect((options.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('throws a descriptive error on non-401 failure', async () => {
    mockAuthFetch.mockReturnValueOnce(errorResponse(422, 'bad input'));

    await expect(startPdpShot(BASE_PDP_REQUEST)).rejects.toThrow('Failed to start PDP shot: 422');
  });

  it('propagates AuthExpiredError without wrapping it', async () => {
    const authErr = Object.assign(new Error('AUTH_EXPIRED'), { name: 'AuthExpiredError' });
    mockAuthFetch.mockRejectedValueOnce(authErr);

    const err = await startPdpShot(BASE_PDP_REQUEST).catch(e => e);
    expect(err.name).toBe('AuthExpiredError');
    expect(err.message).not.toContain('Failed to start PDP shot');
  });
});

// ── getJewelryDescription ─────────────────────────────────────────────────────

describe('getJewelryDescription', () => {
  it('calls the correct endpoint', async () => {
    mockAuthFetch.mockReturnValueOnce(okResponse({ jewelry_description: 'Gold ring with diamond' }));

    await getJewelryDescription('wf-abc');

    expect(mockAuthFetch).toHaveBeenCalledWith('/api/jewelry-description/wf-abc');
  });

  it('returns the jewelry_description string on 200', async () => {
    mockAuthFetch.mockReturnValueOnce(okResponse({ jewelry_description: 'Gold ring with diamond' }));

    const result = await getJewelryDescription('wf-abc');
    expect(result).toBe('Gold ring with diamond');
  });

  it('returns null on 404', async () => {
    mockAuthFetch.mockReturnValueOnce(errorResponse(404));

    const result = await getJewelryDescription('wf-missing');
    expect(result).toBeNull();
  });

  it('throws a descriptive error on non-404 failure', async () => {
    mockAuthFetch.mockReturnValueOnce(errorResponse(500, 'server error'));

    await expect(getJewelryDescription('wf-err')).rejects.toThrow('Failed to fetch jewelry description: 500');
  });

  it('propagates AuthExpiredError without wrapping it', async () => {
    const authErr = Object.assign(new Error('AUTH_EXPIRED'), { name: 'AuthExpiredError' });
    mockAuthFetch.mockRejectedValueOnce(authErr);

    const err = await getJewelryDescription('wf-auth').catch(e => e);
    expect(err.name).toBe('AuthExpiredError');
    expect(err.message).not.toContain('Failed to fetch jewelry description');
  });

  it('returns null when response has no jewelry_description field', async () => {
    mockAuthFetch.mockReturnValueOnce(okResponse({}));

    const result = await getJewelryDescription('wf-empty');
    expect(result).toBeNull();
  });
});

// Fix shot

describe('startFixShot', () => {
  it('sends product-shot fix fields directly inside payload', async () => {
    mockAuthFetch.mockReturnValueOnce(okResponse({ workflow_id: 'wf-fix', status_url: '/s', result_url: '/r' }));

    await startFixShot({
      isProductShot: true,
      resolution: '1K',
      resultImageUrl: 'https://example.com/result.jpg',
      jewelryImageUrl: 'https://example.com/jewelry.jpg',
      prompt: 'Make the chain brighter',
      category: 'necklace',
      aspect_ratio: '1:1',
      idempotency_key: 'fix-key',
      jewelry_description: 'Gold necklace with a pendant',
    });

    expect(mockAuthFetch).toHaveBeenCalledWith(
      '/api/run/fix_product_shot',
      expect.objectContaining({ method: 'POST' }),
    );

    const [, options] = mockAuthFetch.mock.calls[0];
    const body = JSON.parse(options.body as string);

    expect(body.payload).toEqual({
      result_image_url: 'https://example.com/result.jpg',
      jewelry_image_url: 'https://example.com/jewelry.jpg',
      category: 'necklace',
      generation_type: 'product_shot_v1',
      fix_instruction: 'Make the chain brighter',
      aspect_ratio: '1:1',
      idempotency_key: 'fix-key',
      jewelry_description: 'Gold necklace with a pendant',
    });
    expect(body.payload.data).toBeUndefined();
  });

  it('sends exactly one result image field for product-shot data URLs', async () => {
    mockAuthFetch.mockReturnValueOnce(okResponse({ workflow_id: 'wf-fix', status_url: '/s', result_url: '/r' }));

    await startFixShot({
      isProductShot: true,
      resolution: '2K',
      resultImageUrl: 'data:image/png;base64,RESULT_B64',
      jewelryImageUrl: 'data:image/jpeg;base64,JEWELRY_B64',
      category: 'ring',
    });

    const [, options] = mockAuthFetch.mock.calls[0];
    const body = JSON.parse(options.body as string);

    expect(mockAuthFetch).toHaveBeenCalledWith(
      '/api/run/fix_product_shot_2k',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(body.payload.result_image_b64).toBe('RESULT_B64');
    expect(body.payload.result_image_url).toBeUndefined();
    expect(body.payload.jewelry_image_b64).toBe('JEWELRY_B64');
    expect(body.payload.jewelry_image_url).toBeUndefined();
    expect(body.payload.data).toBeUndefined();
  });

  it('uses state endpoint for model-shot fixes', async () => {
    mockAuthFetch.mockReturnValueOnce(okResponse({ workflow_id: 'wf-fix', status_url: '/s', result_url: '/r' }));

    await startFixShot({
      isProductShot: false,
      resolution: '4K',
      resultImageUrl: 'https://example.com/result.jpg',
      jewelryImageUrl: 'https://example.com/jewelry.jpg',
      category: 'ring',
    });

    expect(mockAuthFetch).toHaveBeenCalledWith(
      '/api/run/state/fix_model_shot_4k',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
