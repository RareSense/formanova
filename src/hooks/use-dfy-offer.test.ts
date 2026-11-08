import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const fetchMock = vi.hoisted(() => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/authenticated-fetch', () => fetchMock);

import { useDfyOffer } from './use-dfy-offer';
import { offerState, saveOfferChoice } from '@/lib/dfy-offer';

const tiers = (list: unknown[]) => fetchMock.authenticatedFetch.mockResolvedValue({ ok: true, json: async () => list });
const STARTER = { tier_id: 'tier_425a5db7' };
const BASIC = { tier_id: 'tier_5e6c6184' };
const settle = () => new Promise((r) => setTimeout(r, 20));

describe('useDfyOffer', () => {
  beforeEach(() => {
    localStorage.clear();
    fetchMock.authenticatedFetch.mockReset();
    localStorage.setItem('formanova_brand_prompt_v2_u1', 'true');
  });

  it('dashboard: closing it (the ✕) shows it again on the next dashboard visit (owner, 2026-11-08)', async () => {
    tiers([BASIC]);
    const { result } = renderHook(() => useDfyOffer('u1', false, 'dashboard'));
    await waitFor(() => expect(result.current.open).toBe(true));
    act(() => result.current.close());
    expect(result.current.open).toBe(false);
    const nextVisit = renderHook(() => useDfyOffer('u1', false, 'dashboard'));
    await waitFor(() => expect(nextVisit.result.current.open).toBe(true));
  });

  it('dashboard: No thanks (or Talk to our AI) and it never shows again', async () => {
    tiers([BASIC]);
    saveOfferChoice('u1', 'no');
    const nextVisit = renderHook(() => useDfyOffer('u1', false, 'dashboard'));
    await settle();
    expect(nextVisit.result.current.open).toBe(false);
  });

  it('after an image: shown once, stays open while shown, then that chance is used', async () => {
    tiers([BASIC]);
    const { result } = renderHook(() => useDfyOffer('u1', false, 'after_image'));
    await waitFor(() => expect(result.current.open).toBe(true));
    expect(offerState('u1').seen.after_image).toBeTypeOf('number');
    await settle();
    expect(result.current.open).toBe(true); // used, but still on screen
    act(() => result.current.close());
    const again = renderHook(() => useDfyOffer('u1', false, 'after_image'));
    await settle();
    expect(again.result.current.open).toBe(false);
  });

  it('the after-image chance still comes after the dashboard one, unless they said No thanks', async () => {
    tiers([BASIC]);
    const dash = renderHook(() => useDfyOffer('u1', false, 'dashboard'));
    await waitFor(() => expect(dash.result.current.open).toBe(true));
    const after = renderHook(() => useDfyOffer('u1', false, 'after_image'));
    await waitFor(() => expect(after.result.current.open).toBe(true));
    saveOfferChoice('u2', 'no');
    localStorage.setItem('formanova_brand_prompt_v2_u2', 'true');
    const declined = renderHook(() => useDfyOffer('u2', false, 'after_image'));
    await settle();
    expect(declined.result.current.open).toBe(false);
  });

  it('waits until the page is ready (the new image has been on screen)', async () => {
    tiers([BASIC]);
    let ready = false;
    const { result, rerender } = renderHook(() => useDfyOffer('u1', false, 'after_image', ready));
    await settle();
    expect(result.current.open).toBe(false);
    ready = true;
    rerender();
    await waitFor(() => expect(result.current.open).toBe(true));
  });

  it('never for unpaid users, failed plan loads, before the brand prompt, or over the effort chooser', async () => {
    tiers([STARTER, BASIC]);
    const unpaid = renderHook(() => useDfyOffer('u1', false, 'dashboard'));
    await settle();
    expect(unpaid.result.current.open).toBe(false);
    fetchMock.authenticatedFetch.mockRejectedValue(new Error('down'));
    const failed = renderHook(() => useDfyOffer('u1', false, 'dashboard'));
    await settle();
    expect(failed.result.current.open).toBe(false);
    tiers([BASIC]);
    const overEffort = renderHook(() => useDfyOffer('u1', true, 'dashboard'));
    localStorage.removeItem('formanova_brand_prompt_v2_u3');
    const beforeBrand = renderHook(() => useDfyOffer('u3', false, 'dashboard'));
    await settle();
    expect(overEffort.result.current.open).toBe(false);
    expect(beforeBrand.result.current.open).toBe(false);
  });
});

describe('useDfyOffer, same visit', () => {
  beforeEach(() => {
    localStorage.clear();
    fetchMock.authenticatedFetch.mockReset();
    localStorage.setItem('formanova_brand_prompt_v2_u1', 'true');
  });

  it('once closed, it does not pop back up during the same dashboard visit', async () => {
    tiers([BASIC]);
    const { result } = renderHook(() => useDfyOffer('u1', false, 'dashboard'));
    await waitFor(() => expect(result.current.open).toBe(true));
    act(() => result.current.close());
    await settle();
    expect(result.current.open).toBe(false);
  });
});
