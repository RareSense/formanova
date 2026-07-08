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
  getAnalyzeOutput,
  workflowFor,
  fixWorkflowFor,
  buildJewelryRequestFields,
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

  it('targets the base workflow (no _2k/_4k) at every tier, sending the tier as image_size', async () => {
    for (const tier of ['2K', '4K'] as const) {
      mockAuthFetch.mockReset();
      mockAuthFetch.mockReturnValueOnce(okResponse({ workflow_id: 'wf', status_url: '/s', result_url: '/r' }));

      await startPhotoshoot({ ...BASE_PHOTO_REQUEST, resolution: tier });

      const [url, options] = mockAuthFetch.mock.calls[0];
      expect(url).toBe('/api/run/state/jewelry_photoshoots_generator');
      const body = JSON.parse((options as RequestInit).body as string);
      expect(body.payload.image_size).toBe(tier);
    }
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

  it('targets the base workflow (no _2k/_4k) at every tier, sending the tier as image_size', async () => {
    for (const tier of ['2K', '4K'] as const) {
      mockAuthFetch.mockReset();
      mockAuthFetch.mockReturnValueOnce(okResponse({ workflow_id: 'wf', status_url: '/s', result_url: '/r' }));

      await startPdpShot({ ...BASE_PDP_REQUEST, resolution: tier });

      const [url, options] = mockAuthFetch.mock.calls[0];
      expect(url).toBe('/api/run/Product_shot_pipeline');
      const body = JSON.parse((options as RequestInit).body as string);
      expect(body.payload.image_size).toBe(tier);
    }
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

// ── workflowFor resolver (canonical name table) ───────────────────────────────

describe('workflowFor', () => {
  it('resolves standard (low-effort) workflows to the unsuffixed name for every tier', () => {
    // Low effort: resolution travels as image_size, so the name never carries a suffix.
    expect(workflowFor(false, '1K', 'low')).toBe('jewelry_photoshoots_generator');
    expect(workflowFor(false, '4K', 'low')).toBe('jewelry_photoshoots_generator');
    expect(workflowFor(true, '2K', 'low')).toBe('Product_shot_pipeline');
  });

  it('resolves High Effort (higher-tier) workflows per the pricing handoff', () => {
    // On-model high: 1K/2K share one name, 4K needs the extra upscale-node workflow.
    expect(workflowFor(false, '1K', 'high')).toBe('jewelry_photoshoots_generator_higher_tier');
    expect(workflowFor(false, '2K', 'high')).toBe('jewelry_photoshoots_generator_higher_tier');
    expect(workflowFor(false, '4K', 'high')).toBe('jewelry_photoshoots_generator_higher_tier_4k');
    // PDP high: one name across all three tiers.
    expect(workflowFor(true, '1K', 'high')).toBe('Product_shot_pipeline_higher_tier');
    expect(workflowFor(true, '2K', 'high')).toBe('Product_shot_pipeline_higher_tier');
    expect(workflowFor(true, '4K', 'high')).toBe('Product_shot_pipeline_higher_tier');
  });

  it('defaults to standard when effort is omitted', () => {
    expect(workflowFor(false, '1K')).toBe('jewelry_photoshoots_generator');
  });
});

// ── buildJewelryRequestFields (glue tested by handleGenerate) ──────────────────

describe('buildJewelryRequestFields', () => {
  it('Low: sends only the singular asset id', () => {
    const fields = buildJewelryRequestFields({
      effort: 'low',
      coverUrl: 'https://a',
      coverAssetId: 'asset-a',
      supporting: [{ url: 'https://b', assetId: 'asset-b' }],
    });
    expect(fields).toEqual({ input_jewelry_asset_id: 'asset-a' });
    // Never leaks supporting images into a Low-effort generation
    expect(fields.jewelry_image_urls).toBeUndefined();
    expect(fields.tier).toBeUndefined();
  });

  it('Low with no asset id sends nothing', () => {
    expect(buildJewelryRequestFields({
      effort: 'low', coverUrl: 'https://a', coverAssetId: null, supporting: [],
    })).toEqual({});
  });

  it('High: builds cover-first url + asset-id arrays', () => {
    const fields = buildJewelryRequestFields({
      effort: 'high',
      coverUrl: 'https://a',
      coverAssetId: 'asset-a',
      supporting: [
        { url: 'https://b', assetId: 'asset-b' },
        { url: 'https://c', assetId: 'asset-c' },
      ],
    });
    expect(fields.tier).toBe('high');
    expect(fields.jewelry_image_urls).toEqual(['https://a', 'https://b', 'https://c']);
    expect(fields.input_jewelry_asset_ids).toEqual(['asset-a', 'asset-b', 'asset-c']);
  });

  it('High: drops supporting entries that have not finished uploading', () => {
    const fields = buildJewelryRequestFields({
      effort: 'high',
      coverUrl: 'https://a',
      coverAssetId: 'asset-a',
      supporting: [
        { url: null, assetId: null },              // still uploading
        { url: 'https://c', assetId: 'asset-c' },
      ],
    });
    expect(fields.jewelry_image_urls).toEqual(['https://a', 'https://c']);
    expect(fields.input_jewelry_asset_ids).toEqual(['asset-a', 'asset-c']);
  });
});

// ── High Effort multi-image ───────────────────────────────────────────────────

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const UUID_C = '33333333-3333-4333-8333-333333333333';

describe('startPhotoshoot High Effort', () => {
  it('routes to the higher-tier workflow and sends jewelry arrays (cover first)', async () => {
    mockAuthFetch.mockReturnValueOnce(okResponse({ workflow_id: 'wf', status_url: '/s', result_url: '/r' }));

    await startPhotoshoot({
      ...BASE_PHOTO_REQUEST,
      tier: 'high',
      jewelry_image_urls: ['https://a', 'https://b', 'https://c'],
      input_jewelry_asset_ids: [UUID_A, UUID_B, UUID_C],
    });

    expect(mockAuthFetch).toHaveBeenCalledWith(
      '/api/run/state/jewelry_photoshoots_generator_higher_tier',
      expect.objectContaining({ method: 'POST' }),
    );
    const [, options] = mockAuthFetch.mock.calls[0];
    const body = JSON.parse(options.body as string);
    expect(body.payload.jewelry_image_url).toBe('https://a'); // cover kept for compat
    expect(body.payload.jewelry_image_urls).toEqual(['https://a', 'https://b', 'https://c']);
    expect(body.input_jewelry_asset_ids).toEqual([UUID_A, UUID_B, UUID_C]);
    expect(body.input_jewelry_asset_id).toBeUndefined();
  });

  it('drops non-UUID asset ids and uses the singular field for a lone id', async () => {
    mockAuthFetch.mockReturnValueOnce(okResponse({ workflow_id: 'wf', status_url: '/s', result_url: '/r' }));

    await startPhotoshoot({
      ...BASE_PHOTO_REQUEST,
      tier: 'high',
      jewelry_image_urls: ['https://a'],
      input_jewelry_asset_ids: [UUID_A, 'not-a-uuid'],
    });

    const [, options] = mockAuthFetch.mock.calls[0];
    const body = JSON.parse(options.body as string);
    expect(body.input_jewelry_asset_id).toBe(UUID_A);
    expect(body.input_jewelry_asset_ids).toBeUndefined();
    // single url -> no plural field
    expect(body.payload.jewelry_image_urls).toBeUndefined();
  });
});

describe('startPdpShot High Effort', () => {
  it('routes to the higher-tier PDP workflow with a 3-image array', async () => {
    mockAuthFetch.mockReturnValueOnce(okResponse({ workflow_id: 'wf', status_url: '/s', result_url: '/r' }));

    await startPdpShot({
      ...BASE_PDP_REQUEST,
      tier: 'high',
      jewelry_image_urls: ['https://a', 'https://b', 'https://c'],
      input_jewelry_asset_ids: [UUID_A, UUID_B, UUID_C],
    });

    expect(mockAuthFetch).toHaveBeenCalledWith(
      '/api/run/Product_shot_pipeline_higher_tier',
      expect.objectContaining({ method: 'POST' }),
    );
    const [, options] = mockAuthFetch.mock.calls[0];
    const body = JSON.parse(options.body as string);
    expect(body.payload.jewelry_image_urls).toEqual(['https://a', 'https://b', 'https://c']);
    expect(body.input_jewelry_asset_ids).toEqual([UUID_A, UUID_B, UUID_C]);
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
      // No source_asset_id supplied -> image_size fallback lands in the payload.
      image_size: '1K',
    });
    expect(body.source_asset_id).toBeUndefined();
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

    // Step 5: base workflow name, no _2k suffix even for a 2K fix (tier is data-driven).
    expect(mockAuthFetch).toHaveBeenCalledWith(
      '/api/run/fix_product_shot',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(body.payload.result_image_b64).toBe('RESULT_B64');
    expect(body.payload.result_image_url).toBeUndefined();
    expect(body.payload.jewelry_image_b64).toBe('JEWELRY_B64');
    expect(body.payload.jewelry_image_url).toBeUndefined();
    expect(body.payload.data).toBeUndefined();
  });

  it('uses the state endpoint and base workflow name for model-shot fixes (no 4K suffix)', async () => {
    mockAuthFetch.mockReturnValueOnce(okResponse({ workflow_id: 'wf-fix', status_url: '/s', result_url: '/r' }));

    await startFixShot({
      isProductShot: false,
      resolution: '4K',
      resultImageUrl: 'https://example.com/result.jpg',
      jewelryImageUrl: 'https://example.com/jewelry.jpg',
      category: 'ring',
    });

    // Step 5: base name even at 4K — tier is resolved server-side, not from the name.
    expect(mockAuthFetch).toHaveBeenCalledWith(
      '/api/run/state/fix_model_shot',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  const ASSET_ID = 'a1b2c3d4-0000-1111-2222-333344445555';

  it('sends source_asset_id as a TOP-LEVEL sibling of payload for product-shot fixes', async () => {
    mockAuthFetch.mockReturnValueOnce(okResponse({ workflow_id: 'wf-fix', status_url: '/s', result_url: '/r' }));

    await startFixShot({
      isProductShot: true,
      resolution: '2K',
      resultImageUrl: 'https://example.com/result.jpg',
      jewelryImageUrl: 'https://example.com/jewelry.jpg',
      category: 'ring',
      sourceAssetId: ASSET_ID,
    });

    const [, options] = mockAuthFetch.mock.calls[0];
    const body = JSON.parse(options.body as string);

    // Top-level sibling, NOT nested in payload.
    expect(body.source_asset_id).toBe(ASSET_ID);
    expect(body.payload.source_asset_id).toBeUndefined();
    // Normal path: no image_size fallback when the asset id is present.
    expect(body.payload.image_size).toBeUndefined();
  });

  it('sends source_asset_id top-level for model-shot fixes (state endpoint)', async () => {
    mockAuthFetch.mockReturnValueOnce(okResponse({ workflow_id: 'wf-fix', status_url: '/s', result_url: '/r' }));

    await startFixShot({
      isProductShot: false,
      resolution: '1K',
      resultImageUrl: 'https://example.com/result.jpg',
      jewelryImageUrl: 'https://example.com/jewelry.jpg',
      category: 'ring',
      sourceAssetId: ASSET_ID,
    });

    const [, options] = mockAuthFetch.mock.calls[0];
    const body = JSON.parse(options.body as string);

    expect(body.source_asset_id).toBe(ASSET_ID);
    expect(body.payload.source_asset_id).toBeUndefined();
    expect(body.payload.image_size).toBeUndefined();
  });

  it('falls back to image_size in payload when no source_asset_id (model-shot)', async () => {
    mockAuthFetch.mockReturnValueOnce(okResponse({ workflow_id: 'wf-fix', status_url: '/s', result_url: '/r' }));

    await startFixShot({
      isProductShot: false,
      resolution: '4K',
      resultImageUrl: 'https://example.com/result.jpg',
      jewelryImageUrl: 'https://example.com/jewelry.jpg',
      category: 'ring',
    });

    const [, options] = mockAuthFetch.mock.calls[0];
    const body = JSON.parse(options.body as string);

    expect(body.source_asset_id).toBeUndefined();
    expect(body.payload.image_size).toBe('4K');
  });

  it('ignores a non-UUID source_asset_id and uses the image_size fallback', async () => {
    mockAuthFetch.mockReturnValueOnce(okResponse({ workflow_id: 'wf-fix', status_url: '/s', result_url: '/r' }));

    await startFixShot({
      isProductShot: true,
      resolution: '1K',
      resultImageUrl: 'https://example.com/result.jpg',
      jewelryImageUrl: 'https://example.com/jewelry.jpg',
      category: 'ring',
      sourceAssetId: 'not-a-uuid',
    });

    const [, options] = mockAuthFetch.mock.calls[0];
    const body = JSON.parse(options.body as string);

    expect(body.source_asset_id).toBeUndefined();
    expect(body.payload.image_size).toBe('1K');
  });
});

describe('fixWorkflowFor', () => {
  it('returns base names for low effort', () => {
    expect(fixWorkflowFor(false)).toBe('fix_model_shot');
    expect(fixWorkflowFor(true)).toBe('fix_product_shot');
  });

  it('returns the higher-tier family for high effort, with _4k at 4K', () => {
    expect(fixWorkflowFor(false, 'high', '1K')).toBe('fix_model_shot_higher_tier');
    expect(fixWorkflowFor(false, 'high', '4K')).toBe('fix_model_shot_higher_tier_4k');
    expect(fixWorkflowFor(true, 'high', '2K')).toBe('fix_product_shot_higher_tier');
    expect(fixWorkflowFor(true, 'high', '4K')).toBe('fix_product_shot_higher_tier_4k');
  });
});

describe('startFixShot High Effort (higher tier)', () => {
  it('model shot: higher-tier state endpoint, cover-first jewelry array, model reference, generation_type', async () => {
    mockAuthFetch.mockReturnValueOnce(okResponse({ workflow_id: 'wf-hf', status_url: '/s', result_url: '/r' }));

    await startFixShot({
      isProductShot: false,
      tier: 'high',
      resolution: '2K',
      resultImageUrl: 'https://example.com/result.jpg',
      jewelryImageUrl: 'https://example.com/a.jpg',
      jewelryImageUrls: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
      modelImageUrl: 'https://example.com/model.jpg',
      jewelry_description: 'A gold ring',
      prompt: 'brighten the stone',
      category: 'ring',
    });

    expect(mockAuthFetch).toHaveBeenCalledWith(
      '/api/run/state/fix_model_shot_higher_tier',
      expect.objectContaining({ method: 'POST' }),
    );
    const [, options] = mockAuthFetch.mock.calls[0];
    const body = JSON.parse(options.body as string);
    expect(body.payload.generation_type).toBe('model_shot_v1');
    expect(body.payload.jewelry_image_urls).toEqual(['https://example.com/a.jpg', 'https://example.com/b.jpg']);
    expect(body.payload.model_image_url).toBe('https://example.com/model.jpg');
    expect(body.payload.inspiration_image_url).toBeUndefined();
    expect(body.payload.jewelry_description).toBe('A gold ring');
    expect(body.payload.fix_instruction).toBe('brighten the stone');
    expect(body.payload.image_size).toBe('2K');
    expect(body.payload.client).toBe('gpt_openai');
  });

  it('product shot: higher-tier /run endpoint, inspiration reference, no model image', async () => {
    mockAuthFetch.mockReturnValueOnce(okResponse({ workflow_id: 'wf-hf', status_url: '/s', result_url: '/r' }));

    await startFixShot({
      isProductShot: true,
      tier: 'high',
      resolution: '1K',
      resultImageUrl: 'https://example.com/result.jpg',
      jewelryImageUrl: 'https://example.com/a.jpg',
      inspirationImageUrl: 'https://example.com/inspo.jpg',
      jewelry_description: 'A gold ring',
      category: 'ring',
    });

    expect(mockAuthFetch).toHaveBeenCalledWith(
      '/api/run/fix_product_shot_higher_tier',
      expect.objectContaining({ method: 'POST' }),
    );
    const [, options] = mockAuthFetch.mock.calls[0];
    const body = JSON.parse(options.body as string);
    expect(body.payload.generation_type).toBe('product_shot_v1');
    expect(body.payload.inspiration_image_url).toBe('https://example.com/inspo.jpg');
    expect(body.payload.model_image_url).toBeUndefined();
  });

  it('4K high-effort model fix uses the _4k workflow and forwards upscale_factor', async () => {
    mockAuthFetch.mockReturnValueOnce(okResponse({ workflow_id: 'wf-hf', status_url: '/s', result_url: '/r' }));

    await startFixShot({
      isProductShot: false,
      tier: 'high',
      resolution: '4K',
      resultImageUrl: 'https://example.com/result.jpg',
      jewelryImageUrl: 'https://example.com/a.jpg',
      modelImageUrl: 'https://example.com/model.jpg',
      jewelry_description: 'A gold ring',
      upscaleFactor: 2,
      category: 'ring',
    });

    expect(mockAuthFetch).toHaveBeenCalledWith(
      '/api/run/state/fix_model_shot_higher_tier_4k',
      expect.objectContaining({ method: 'POST' }),
    );
    const [, options] = mockAuthFetch.mock.calls[0];
    const body = JSON.parse(options.body as string);
    expect(body.payload.upscale_factor).toBe(2);
  });

  it('enforces the family rules client-side (model needs a model image; product needs inspiration)', async () => {
    await expect(startFixShot({
      isProductShot: false,
      tier: 'high',
      resolution: '1K',
      resultImageUrl: 'https://example.com/result.jpg',
      jewelryImageUrl: 'https://example.com/a.jpg',
      jewelry_description: 'A gold ring',
      category: 'ring',
    })).rejects.toThrow(/model image/i);

    await expect(startFixShot({
      isProductShot: true,
      tier: 'high',
      resolution: '1K',
      resultImageUrl: 'https://example.com/result.jpg',
      jewelryImageUrl: 'https://example.com/a.jpg',
      jewelry_description: 'A gold ring',
      category: 'ring',
    })).rejects.toThrow(/inspiration image/i);

    expect(mockAuthFetch).not.toHaveBeenCalled();
  });
});

// ── getAnalyzeOutput ──────────────────────────────────────────────────────────

describe('getAnalyzeOutput', () => {
  function jsonError(status: number, body: unknown): Promise<Response> {
    return Promise.resolve({
      ok: false,
      status,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    } as unknown as Response);
  }

  it('returns ok with the analyze data on 200', async () => {
    const data = { jewelry_description: 'a ring', model_description: '', generation_type: 'product_shot_v1' };
    mockAuthFetch.mockReturnValueOnce(okResponse(data));

    const res = await getAnalyzeOutput('wf-1');
    const [url] = mockAuthFetch.mock.calls[0];
    expect(url).toMatch(/\/analyze-output\/wf-1$/);
    expect(res).toEqual({ status: 'ok', data });
  });

  it('returns pending with the detail on 409 (analyze still running)', async () => {
    mockAuthFetch.mockReturnValueOnce(jsonError(409, { detail: 'still running' }));
    expect(await getAnalyzeOutput('wf-2')).toEqual({ status: 'pending', detail: 'still running' });
  });

  it('returns pending with empty detail when the 409 body has none', async () => {
    mockAuthFetch.mockReturnValueOnce(errorResponse(409));
    expect(await getAnalyzeOutput('wf-2b')).toEqual({ status: 'pending', detail: '' });
  });

  it('returns unavailable on 404 (not found / not owned)', async () => {
    mockAuthFetch.mockReturnValueOnce(errorResponse(404));
    expect(await getAnalyzeOutput('wf-3')).toEqual({ status: 'unavailable' });
  });

  it('returns unavailable on 422 (not a higher-tier generation)', async () => {
    mockAuthFetch.mockReturnValueOnce(errorResponse(422));
    expect(await getAnalyzeOutput('wf-4')).toEqual({ status: 'unavailable' });
  });

  it('throws on an unexpected status (e.g. 500)', async () => {
    mockAuthFetch.mockReturnValueOnce(errorResponse(500, 'boom'));
    await expect(getAnalyzeOutput('wf-5')).rejects.toThrow(/500/);
  });
});
