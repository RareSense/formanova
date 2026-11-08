import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const fetchMock = vi.hoisted(() => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/authenticated-fetch', () => fetchMock);

import { useDfyOffer } from './use-dfy-offer';

const tiers = (list: unknown[]) => fetchMock.authenticatedFetch.mockResolvedValue({ ok: true, json: async () => list });
const STARTER = { tier_id: 'tier_425a5db7' };
const BASIC = { tier_id: 'tier_5e6c6184' };

describe('useDfyOffer (dashboard)', () => {
  beforeEach(() => {
    localStorage.clear();
    fetchMock.authenticatedFetch.mockReset();
    localStorage.setItem('formanova_brand_prompt_v2_u1', 'true');
  });

  it('opens for a paying user', async () => {
    tiers([BASIC]);
    const { result } = renderHook(() => useDfyOffer('u1', false));
    await waitFor(() => expect(result.current.open).toBe(true));
    expect(fetchMock.authenticatedFetch).toHaveBeenCalledWith('/billing/tiers');
  });

  it('stays closed for a user who has not paid, or when plans fail to load', async () => {
    tiers([STARTER, BASIC]);
    const unpaid = renderHook(() => useDfyOffer('u1', false));
    fetchMock.authenticatedFetch.mockRejectedValue(new Error('down'));
    const failed = renderHook(() => useDfyOffer('u1', false));
    await new Promise((r) => setTimeout(r, 20));
    expect(unpaid.result.current.open).toBe(false);
    expect(failed.result.current.open).toBe(false);
  });

  it('waits for the brand prompt and never opens over the effort chooser', async () => {
    tiers([BASIC]);
    localStorage.removeItem('formanova_brand_prompt_v2_u1');
    const waiting = renderHook(() => useDfyOffer('u1', false));
    const overEffort = renderHook(() => useDfyOffer('u1', true));
    await new Promise((r) => setTimeout(r, 20));
    expect(waiting.result.current.open).toBe(false);
    expect(overEffort.result.current.open).toBe(false);
  });
});
