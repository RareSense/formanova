import { renderHook, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/authenticated-fetch', () => ({
  authenticatedFetch: vi.fn(),
  AuthExpiredError: class AuthExpiredError extends Error {},
}));

import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { useGenerationCost } from './useGenerationCost';

const mockFetch = vi.mocked(authenticatedFetch);

function okJson(body: unknown) {
  return { ok: true, json: async () => body } as unknown as Response;
}

describe('useGenerationCost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue(okJson({ projected_max_hold: 8 }));
  });

  it('sends pricing_context.image_size mirroring the requested resolution', async () => {
    renderHook(() => useGenerationCost('jewelry_photoshoots_generator', '1K'));

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      workflow_name: 'jewelry_photoshoots_generator',
      num_variations: 1,
      pricing_context: { image_size: '1K' },
    });
  });

  it('reflects the tier in pricing_context for a 4K request', async () => {
    renderHook(() => useGenerationCost('jewelry_photoshoots_generator_4k', '4K'));

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.pricing_context).toEqual({ image_size: '4K' });
  });

  it('uses the server projected_max_hold as the cost', async () => {
    const { result } = renderHook(() => useGenerationCost('jewelry_photoshoots_generator', '1K'));
    await waitFor(() => expect(result.current.cost).toBe(8));
  });
});
