import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock the underlying preflight so we only assert the hook's forwarding contract.
const mockPreflight = vi.hoisted(() => vi.fn());

vi.mock('@/lib/credit-preflight', () => ({
  performCreditPreflight: mockPreflight,
}));

import { useCreditPreflight } from './use-credit-preflight';

beforeEach(() => {
  mockPreflight.mockReset();
});

describe('useCreditPreflight.checkCredits', () => {
  it('forwards numVariations and metadata (pricingContext) to performCreditPreflight', async () => {
    mockPreflight.mockResolvedValueOnce({ approved: true, estimatedCredits: 30, currentBalance: 100 });

    const { result } = renderHook(() => useCreditPreflight());

    let approved: boolean | undefined;
    await act(async () => {
      approved = await result.current.checkCredits('upscale_image', 1, {
        pricingContext: { image_size: '2k', factor: 4 },
      });
    });

    expect(approved).toBe(true);
    expect(mockPreflight).toHaveBeenCalledWith('upscale_image', 1, {
      pricingContext: { image_size: '2k', factor: 4 },
    });
  });

  it('raises the insufficient-credits modal and returns false when not approved', async () => {
    mockPreflight.mockResolvedValueOnce({ approved: false, estimatedCredits: 120, currentBalance: 10 });

    const { result } = renderHook(() => useCreditPreflight());

    let approved: boolean | undefined;
    await act(async () => {
      approved = await result.current.checkCredits('upscale_image', 1, {
        pricingContext: { image_size: '4k', factor: 9 },
      });
    });

    expect(approved).toBe(false);
    expect(result.current.showInsufficientModal).toBe(true);
    expect(result.current.preflightResult?.estimatedCredits).toBe(120);
  });

  it('works without metadata (back-compat)', async () => {
    mockPreflight.mockResolvedValueOnce({ approved: true, estimatedCredits: 10, currentBalance: 50 });

    const { result } = renderHook(() => useCreditPreflight());

    await act(async () => {
      await result.current.checkCredits('jewelry_photoshoots_generator');
    });

    expect(mockPreflight).toHaveBeenCalledWith('jewelry_photoshoots_generator', 1, undefined);
  });
});
