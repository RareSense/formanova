import { describe, it, expect, vi } from 'vitest';
import { fetchGlbArrayBuffer } from './ScissorGLBGrid';

function mockResponse(status: number, ok: boolean): Response {
  return {
    ok,
    status,
    arrayBuffer: async () => new ArrayBuffer(8),
  } as unknown as Response;
}

describe('fetchGlbArrayBuffer', () => {
  it('returns the array buffer on a successful first attempt', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(200, true));
    const result = await fetchGlbArrayBuffer('https://cdn.example.com/model.glb', fetchFn);
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('retries a transient 503 and succeeds on the next attempt', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(mockResponse(503, false))
      .mockResolvedValueOnce(mockResponse(200, true));

    const result = await fetchGlbArrayBuffer('https://cdn.example.com/model.glb', fetchFn);
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('gives up after exhausting retries on a persistent 503', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(503, false));

    await expect(fetchGlbArrayBuffer('https://cdn.example.com/model.glb', fetchFn))
      .rejects.toThrow('Failed to fetch GLB: 503');
    // 1 initial + 2 retries = 3 total attempts, then give up
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('does not retry a 404 (permanent failure)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(404, false));

    await expect(fetchGlbArrayBuffer('https://cdn.example.com/model.glb', fetchFn))
      .rejects.toThrow('Failed to fetch GLB: 404');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('does not retry a 403 (permanent failure)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(mockResponse(403, false));

    await expect(fetchGlbArrayBuffer('https://cdn.example.com/model.glb', fetchFn))
      .rejects.toThrow('Failed to fetch GLB: 403');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
