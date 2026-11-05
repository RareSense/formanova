import { describe, it, expect, vi, beforeEach } from 'vitest';

const authenticatedFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/authenticated-fetch', () => ({ authenticatedFetch }));

import { fetchReferenceFiles } from '@/lib/reference-url-files';

beforeEach(() => authenticatedFetch.mockReset());

describe('fetchReferenceFiles', () => {
  it('turns each saved photo link into a File, in order', async () => {
    authenticatedFetch.mockImplementation(async (url: string) => ({
      ok: true, blob: async () => new Blob([url], { type: 'image/png' }),
    }));
    const files = await fetchReferenceFiles(['/a.png', '/b.png']);
    expect(authenticatedFetch.mock.calls.map((c) => c[0])).toEqual(['/a.png', '/b.png']);
    expect(files).toHaveLength(2);
    expect(files[0]).toBeInstanceOf(File);
    expect(files[0].type).toBe('image/png');
    expect(files[1].name).toBe('reused-reference-1.webp');
  });

  it('fails as a whole when any photo cannot be read, so no run goes out with a partial set', async () => {
    authenticatedFetch
      .mockResolvedValueOnce({ ok: true, blob: async () => new Blob(['a']) })
      .mockResolvedValueOnce({ ok: false, status: 403 });
    await expect(fetchReferenceFiles(['/a.png', '/b.png'])).rejects.toThrow('403');
  });

  it('returns nothing for no links', async () => {
    expect(await fetchReferenceFiles([])).toEqual([]);
    expect(authenticatedFetch).not.toHaveBeenCalled();
  });
});
