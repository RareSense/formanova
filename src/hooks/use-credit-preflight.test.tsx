import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock the underlying preflight so we only assert the hook's forwarding contract.
const mockPreflight = vi.hoisted(() => vi.fn());

vi.mock('@/lib/credit-preflight', () => ({
  performCreditPreflight: mockPreflight,
}));

const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockSaveReturn = vi.hoisted(() => vi.fn());
vi.mock('@/lib/post-purchase-return', () => ({
  savePostPurchaseReturn: mockSaveReturn,
}));

/** The hook now navigates, so it needs a router in scope. */
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter initialEntries={['/studio/rings?mode=model-shot']}>{children}</MemoryRouter>
);

import { useCreditPreflight } from './use-credit-preflight';

beforeEach(() => {
  mockPreflight.mockReset();
  mockNavigate.mockReset();
  mockSaveReturn.mockReset();
});

describe('useCreditPreflight.checkCredits', () => {
  it('forwards numVariations and metadata (pricingContext) to performCreditPreflight', async () => {
    mockPreflight.mockResolvedValueOnce({ approved: true, estimatedCredits: 30, currentBalance: 100 });

    const { result } = renderHook(() => useCreditPreflight({ redirectOnInsufficient: false }), { wrapper });

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

    const { result } = renderHook(() => useCreditPreflight({ redirectOnInsufficient: false }), { wrapper });

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

    const { result } = renderHook(() => useCreditPreflight({ redirectOnInsufficient: false }), { wrapper });

    await act(async () => {
      await result.current.checkCredits('jewelry_photoshoots_generator');
    });

    expect(mockPreflight).toHaveBeenCalledWith('jewelry_photoshoots_generator', 1, undefined);
  });
});

// The behaviour below used to live in a useEffect inside UnifiedStudio.tsx.
// Being trapped there is why CAD could not reuse it and built a second,
// divergent insufficient-credit flow instead. It belongs to the hook so that
// every paid workflow gets it by calling checkCredits and nothing else.
describe('useCreditPreflight door-in redirect', () => {
  it('sends a blocked user to the credits page with the shortfall', async () => {
    mockPreflight.mockResolvedValueOnce({ approved: false, estimatedCredits: 120, currentBalance: 10 });

    const { result } = renderHook(() => useCreditPreflight(), { wrapper });
    await act(async () => { await result.current.checkCredits('ring_cad_nurbs_v1'); });

    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    expect(mockNavigate).toHaveBeenCalledWith('/credits', { state: { requiredCredits: 120 } });
  });

  it('remembers where to return so the user resumes after buying', async () => {
    mockPreflight.mockResolvedValueOnce({ approved: false, estimatedCredits: 60, currentBalance: 0 });

    const { result } = renderHook(() => useCreditPreflight(), { wrapper });
    await act(async () => { await result.current.checkCredits('ring_cad_nurbs_v1'); });

    await waitFor(() => expect(mockSaveReturn).toHaveBeenCalled());
    expect(mockSaveReturn).toHaveBeenCalledWith('/studio/rings?mode=model-shot');
  });

  it('does not redirect when the user can afford the run', async () => {
    mockPreflight.mockResolvedValueOnce({ approved: true, estimatedCredits: 60, currentBalance: 500 });

    const { result } = renderHook(() => useCreditPreflight(), { wrapper });
    await act(async () => { await result.current.checkCredits('ring_cad_nurbs_v1'); });

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockSaveReturn).not.toHaveBeenCalled();
  });

  it('lets a caller opt out and render its own modal instead', async () => {
    // PhotoCard sits in a list rather than a full-page flow and shows a modal.
    // Opting out is explicit so the default stays the canonical redirect.
    mockPreflight.mockResolvedValueOnce({ approved: false, estimatedCredits: 40, currentBalance: 5 });

    const { result } = renderHook(() => useCreditPreflight({ redirectOnInsufficient: false }), { wrapper });
    await act(async () => { await result.current.checkCredits('upscale_image'); });

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(result.current.showInsufficientModal).toBe(true);
  });
});
