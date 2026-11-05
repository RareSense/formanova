import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockList = vi.hoisted(() => vi.fn());
vi.mock('@/lib/generation-history-api', () => ({ listMyWorkflows: mockList }));
vi.mock('@/lib/authenticated-fetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/cad-versions-api', () => ({ fetchCadRings: vi.fn() }));

import { fetchCadRunInputs } from './cad-result-api';

const row = (id: string, over: Record<string, unknown> = {}) => ({
  workflow_id: id, prompt: null, reference_image_urls: [], ...over,
});
const page = (start: number, count: number) =>
  Array.from({ length: count }, (_, i) => row(`w-${start + i}`));

beforeEach(() => mockList.mockReset());

describe('fetchCadRunInputs', () => {
  it('reads the run from the first page when it is there', async () => {
    mockList.mockResolvedValueOnce([row('target', { prompt: 'US 7', reference_image_urls: ['/a'] })]);
    expect(await fetchCadRunInputs('target')).toEqual({ referenceImageUrls: ['/a'], prompt: 'US 7' });
    expect(mockList).toHaveBeenCalledTimes(1);
    expect(mockList).toHaveBeenCalledWith(100, 0);
  });

  it('pages past the newest 100 runs to find an older one', async () => {
    mockList
      .mockResolvedValueOnce(page(0, 100))
      .mockResolvedValueOnce([...page(100, 50), row('old', { prompt: 'band 2 mm' })]);
    expect((await fetchCadRunInputs('old')).prompt).toBe('band 2 mm');
    expect(mockList).toHaveBeenNthCalledWith(2, 100, 100);
  });

  it('stops at a short page instead of asking for pages that cannot exist', async () => {
    mockList.mockResolvedValueOnce(page(0, 20));
    expect(await fetchCadRunInputs('missing')).toEqual({ referenceImageUrls: [], prompt: null });
    expect(mockList).toHaveBeenCalledTimes(1);
  });

  it('gives up after a bounded number of pages', async () => {
    mockList.mockImplementation(async (_limit: number, offset: number) => page(offset, 100));
    expect(await fetchCadRunInputs('missing')).toEqual({ referenceImageUrls: [], prompt: null });
    expect(mockList.mock.calls.length).toBeLessThanOrEqual(5);
  });

  it('returns empty values when the history cannot be read', async () => {
    mockList.mockRejectedValueOnce(new Error('500'));
    expect(await fetchCadRunInputs('x')).toEqual({ referenceImageUrls: [], prompt: null });
  });
});
