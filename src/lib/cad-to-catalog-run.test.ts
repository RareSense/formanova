import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuthFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/authenticated-fetch', () => ({
  authenticatedFetch: mockAuthFetch,
  AuthExpiredError: class AuthExpiredError extends Error {},
}));
// Real request/result shaping, but poll without waiting so the tests run instantly.
vi.mock('@/lib/cad-to-catalog-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./cad-to-catalog-api')>()),
  PLACE_POLL_INTERVAL_MS: 0,
  PLACE_POLL_TIMEOUT_MS: 2000,
  SAVE_POLL_INTERVAL_MS: 0,
  SAVE_POLL_TIMEOUT_MS: 2000,
}));

import { CatalogRunError, picturePrice, placeOnBackground, savePictures, startCatalogRun, waitForCatalogRun } from './cad-to-catalog-run';
import { parsePlaceResult } from './cad-to-catalog-api';

const SHA = 'c'.repeat(64);
const REF = { uri: `azure://cad-to-catalog/x/${SHA}/placed.jpg`, type: 'image/jpeg', bytes: 10, sha256: SHA };
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

function json(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

beforeEach(() => mockAuthFetch.mockReset());

describe('startCatalogRun', () => {
  it('POSTs the body to the workflow and returns the run id', async () => {
    mockAuthFetch.mockResolvedValueOnce(json(202, { workflow_id: 'wf_1' }));
    await expect(startCatalogRun('cad_to_catalog_shot', { payload: { a: 1 } })).resolves.toBe('wf_1');
    const [url, init] = mockAuthFetch.mock.calls[0];
    expect(url).toBe('/api/run/state/cad_to_catalog_shot');
    expect(JSON.parse(init.body)).toEqual({ payload: { a: 1 } });
  });

  it('turns 402 and 413 into plain words', async () => {
    mockAuthFetch.mockResolvedValueOnce(json(402, {}));
    await expect(startCatalogRun('w', { payload: {} })).rejects.toMatchObject({ status: 402, message: /Not enough credits/ });
    mockAuthFetch.mockResolvedValueOnce(json(413, {}));
    await expect(startCatalogRun('w', { payload: {} })).rejects.toMatchObject({ status: 413, message: /too large/ });
  });

  it('surfaces the backend reason otherwise', async () => {
    mockAuthFetch.mockResolvedValueOnce(json(400, { detail: 'workflow not active' }));
    await expect(startCatalogRun('w', { payload: {} })).rejects.toThrow('workflow not active');
  });
});

describe('waitForCatalogRun', () => {
  const opts = { intervalMs: 0, timeoutMs: 2000 };

  it('polls status until completed, then reads the result once', async () => {
    mockAuthFetch
      .mockResolvedValueOnce(json(200, { runtime: { state: 'running' } }))
      .mockResolvedValueOnce(json(200, { runtime: { state: 'completed' } }))
      .mockResolvedValueOnce(json(200, { place: [{ image: REF }] }));
    const img = await waitForCatalogRun('wf_1', parsePlaceResult, opts);
    expect(img?.url).toBe(`/api/artifacts/${SHA}`);
    expect(mockAuthFetch.mock.calls.map((c) => c[0])).toEqual(['/api/status/wf_1', '/api/status/wf_1', '/api/result/wf_1']);
  });

  it("throws the tool's own words when the run failed", async () => {
    mockAuthFetch
      .mockResolvedValueOnce(json(200, { runtime: { state: 'failed' } }))
      .mockResolvedValueOnce(json(200, { place: [{ status: 'failed', ok: false, user_message: 'This tool is busy; try again shortly.', retryable: true }] }));
    await expect(waitForCatalogRun('wf_1', parsePlaceResult, opts)).rejects.toMatchObject({ name: 'CatalogRunError', message: /busy/, retryable: true });
  });

  it('resolves null when the caller cancels', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    mockAuthFetch.mockResolvedValue(json(200, { runtime: { state: 'running' } }));
    await expect(waitForCatalogRun('wf_1', parsePlaceResult, { ...opts, signal: ctrl.signal })).resolves.toBeNull();
  });
});

describe('placeOnBackground / savePictures', () => {
  it('places a render and returns the photo with its run id', async () => {
    mockAuthFetch
      .mockResolvedValueOnce(json(202, { workflow_id: 'wf_p' }))
      .mockResolvedValueOnce(json(200, { runtime: { state: 'completed' } }))
      .mockResolvedValueOnce(json(200, { image: REF }));
    const res = await placeOnBackground({ render: PNG, background: PNG, materials: 'm', aspect: '1:1', resolution: '1K' });
    expect(res).toMatchObject({ workflowId: 'wf_p', image: { sha256: SHA } });
  });

  it('keeps pictures with a save run', async () => {
    mockAuthFetch
      .mockResolvedValueOnce(json(202, { workflow_id: 'wf_s' }))
      .mockResolvedValueOnce(json(200, { runtime: { state: 'completed' } }))
      .mockResolvedValueOnce(json(200, { images: [{ name: '01_Front', file: REF }] }));
    const res = await savePictures('a.3dm', 'ring', [{ name: '01_Front', angle: 'Front', metal: null, image: PNG }]);
    expect(res?.[0].name).toBe('01_Front');
    expect(JSON.parse(mockAuthFetch.mock.calls[0][1].body).payload.piece).toBe('a.3dm');
  });

  it('is a CatalogRunError when nothing comes back', async () => {
    mockAuthFetch
      .mockResolvedValueOnce(json(202, { workflow_id: 'wf_s' }))
      .mockResolvedValueOnce(json(200, { runtime: { state: 'completed' } }))
      .mockResolvedValueOnce(json(200, { images: [] }));
    await expect(savePictures('a.3dm', 'ring', [{ name: 'x', angle: '', metal: null, image: PNG }])).rejects.toBeInstanceOf(CatalogRunError);
  });
});

describe('picturePrice', () => {
  it("reads the shot workflow's price list for that size", async () => {
    mockAuthFetch.mockResolvedValueOnce(json(200, { policy: { conditional_pricing_rules: [{ tool: 't', when: { resolution: '2K' }, cost: 36 }] } }));
    expect(await picturePrice('2K')).toBe(36);
    expect(mockAuthFetch.mock.calls[0][0]).toBe('/api/credits/policy/cad_to_catalog_shot');
  });

  it('falls back to the page prices when the price list is missing or fails', async () => {
    mockAuthFetch.mockResolvedValueOnce(json(200, { policy: {} }));
    expect(await picturePrice('4K')).toBe(48);
    mockAuthFetch.mockResolvedValueOnce(json(500, {}));
    expect(await picturePrice('1K')).toBe(24);
    mockAuthFetch.mockRejectedValueOnce(new Error('offline'));
    expect(await picturePrice('2K')).toBe(36);
  });

  it('sends both kinds of picture to the one shot workflow', async () => {
    mockAuthFetch.mockResolvedValue(json(500, { detail: 'stop here' }));
    await expect(savePictures('a.3dm', 'ring', [{ name: 'x', angle: 'Front', metal: null, image: PNG }], undefined, '1K')).rejects.toThrow();
    await expect(placeOnBackground({ render: PNG, background: PNG, materials: '', aspect: '1:1', resolution: '1K' })).rejects.toThrow();
    const urls = mockAuthFetch.mock.calls.map((c) => c[0]);
    expect(urls).toEqual(['/api/run/state/cad_to_catalog_shot', '/api/run/state/cad_to_catalog_shot']);
    mockAuthFetch.mockReset();
  });
});
