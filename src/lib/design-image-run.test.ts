import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuthFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/authenticated-fetch', () => ({
  authenticatedFetch: mockAuthFetch,
  AuthExpiredError: class AuthExpiredError extends Error {},
}));
// Real request/result shaping, but poll without waiting so the tests run instantly.
vi.mock('@/lib/design-image-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./design-image-api')>()),
  DESIGN_IMAGE_POLL_INTERVAL_MS: 0,
  DESIGN_IMAGE_POLL_TIMEOUT_MS: 2000,
}));

import { DesignImageRunError, runDesignImage, startDesignImage, waitForDesignImage } from './design-image-run';

const ART = { uri: 'azure://agentic-artifacts/abc', url: 'https://x/abc', type: 'image/png', bytes: 10, sha256: 'a'.repeat(64) };

function json(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

beforeEach(() => mockAuthFetch.mockReset());

describe('startDesignImage', () => {
  it('POSTs the built body to design_image_v1 and returns the run id', async () => {
    mockAuthFetch.mockResolvedValueOnce(json(200, { workflow_id: 'wf_1' }));
    await expect(startDesignImage({ prompt: 'signet ring', jewelryType: 'ring' })).resolves.toBe('wf_1');
    const [url, init] = mockAuthFetch.mock.calls[0];
    expect(url).toBe('/api/run/state/design_image_v1');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body).payload).toMatchObject({ prompt: 'signet ring', jewelry_type: 'ring' });
  });

  it('turns a 402 into a plain credits message', async () => {
    mockAuthFetch.mockResolvedValueOnce(json(402, { detail: 'insufficient' }));
    await expect(startDesignImage({ prompt: 'x' })).rejects.toMatchObject({ name: 'DesignImageRunError', status: 402, message: /Not enough credits/ });
  });

  it('surfaces the backend reason for other start failures', async () => {
    mockAuthFetch.mockResolvedValueOnce(json(400, { detail: 'workflow not active' }));
    await expect(startDesignImage({ prompt: 'x' })).rejects.toThrow('workflow not active');
  });

  it('never calls the backend for a request the toolkit would reject', async () => {
    await expect(startDesignImage({})).rejects.toThrow(/Describe the design/);
    expect(mockAuthFetch).not.toHaveBeenCalled();
  });
});

describe('waitForDesignImage', () => {
  it('polls status until completed, then reads the result once', async () => {
    mockAuthFetch
      .mockResolvedValueOnce(json(200, { runtime: { state: 'running' } }))
      .mockResolvedValueOnce(json(200, { runtime: { state: 'completed' } }))
      .mockResolvedValueOnce(json(200, { status: 'completed', ok: true, image_artifact: ART, consistent: true, drift: [] }));
    const result = await waitForDesignImage('wf_1');
    expect(result?.image.sha256).toBe(ART.sha256);
    expect(mockAuthFetch.mock.calls.map((c) => c[0])).toEqual(['/api/status/wf_1', '/api/status/wf_1', '/api/result/wf_1']);
  });

  it('reports the backend message when the run finished without a picture', async () => {
    mockAuthFetch
      .mockResolvedValueOnce(json(200, { runtime: { state: 'completed' } }))
      .mockResolvedValueOnce(json(200, { status: 'failed', ok: false, user_message: 'That picture was blocked.' }));
    await expect(waitForDesignImage('wf_1')).rejects.toThrow('That picture was blocked.');
  });

  it('gives a plain retryable error when the run fails', async () => {
    mockAuthFetch.mockResolvedValue(json(200, { runtime: { state: 'failed' }, error: 'boom' }));
    await expect(waitForDesignImage('wf_1')).rejects.toMatchObject({ name: 'DesignImageRunError', retryable: true });
  });

  it('returns null when cancelled, without throwing', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    mockAuthFetch.mockResolvedValue(json(200, { runtime: { state: 'running' } }));
    await expect(waitForDesignImage('wf_1', ctrl.signal)).resolves.toBeNull();
  });
});

describe('runDesignImage', () => {
  it('starts and waits in one call', async () => {
    mockAuthFetch
      .mockResolvedValueOnce(json(200, { workflow_id: 'wf_9' }))
      .mockResolvedValueOnce(json(200, { runtime: { state: 'completed' } }))
      .mockResolvedValueOnce(json(200, { image_artifact: ART }));
    const result = await runDesignImage({ prompt: 'x' });
    expect(result?.consistent).toBeNull();
  });

  it('is an instance of DesignImageRunError for UI handling', () => {
    expect(new DesignImageRunError('m')).toBeInstanceOf(Error);
  });
});
