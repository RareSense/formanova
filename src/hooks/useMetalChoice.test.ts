import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { METAL_CHOICE_STORAGE_KEY, useMetalChoice } from './useMetalChoice';

const target = (alloyId: string | null) => ({ grams: 28, tolerancePct: 5, alloyId });

describe('useMetalChoice', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('shows 14K Yellow Gold when nothing says otherwise', () => {
    const { result } = renderHook(() => useMetalChoice({ key: 'v1', target: null, requestedAlloyId: null }));
    expect(result.current.alloy.id).toBe('au14y');
    expect(result.current.requestedUnavailable).toBe(false);
  });

  it('prefers the target alloy, then the requested one, then the stored pick', () => {
    localStorage.setItem(METAL_CHOICE_STORAGE_KEY, 'ag925');
    expect(renderHook(() => useMetalChoice({ key: 'v1', target: target('au18y'), requestedAlloyId: 'au10y' })).result.current.alloy.id).toBe('au18y');
    expect(renderHook(() => useMetalChoice({ key: 'v1', target: target(null), requestedAlloyId: 'au10y' })).result.current.alloy.id).toBe('au10y');
    expect(renderHook(() => useMetalChoice({ key: 'v1', target: null, requestedAlloyId: null })).result.current.alloy.id).toBe('ag925');
  });

  it('resolves a legacy id', () => {
    const { result } = renderHook(() => useMetalChoice({ key: 'v1', target: null, requestedAlloyId: '18k_white_gold' }));
    expect(result.current.alloy.id).toBe('au18w');
  });

  it('falls back to the default and says so for a requested metal with no density', () => {
    const { result } = renderHook(() => useMetalChoice({ key: 'v1', target: null, requestedAlloyId: 'platinum_cobalt' }));
    expect(result.current.alloy.id).toBe('au14y');
    expect(result.current.requestedUnavailable).toBe(true);
  });

  it('ignores a tampered stored value', () => {
    for (const bad of ['<img src=x onerror=alert(1)>', 'platinum_cobalt', '__proto__', '']) {
      localStorage.setItem(METAL_CHOICE_STORAGE_KEY, bad);
      expect(renderHook(() => useMetalChoice({ key: 'v1', target: null, requestedAlloyId: null })).result.current.alloy.id).toBe('au14y');
    }
  });

  it('shows and stores a pick, and ignores ids that are not in the table', () => {
    const { result } = renderHook(() => useMetalChoice({ key: 'v1', target: target('au14y'), requestedAlloyId: null }));
    act(() => result.current.setAlloyId('au18y'));
    expect(result.current.alloy.id).toBe('au18y');
    expect(localStorage.getItem(METAL_CHOICE_STORAGE_KEY)).toBe('au18y');
    act(() => result.current.setAlloyId('bogus'));
    expect(result.current.alloy.id).toBe('au18y');
  });

  it('keeps a pick on its own model: another version opens in its target alloy', () => {
    const { result, rerender } = renderHook((props) => useMetalChoice(props), {
      initialProps: { key: 'v1', target: target('au14y'), requestedAlloyId: null },
    });
    act(() => result.current.setAlloyId('pt950ru'));
    rerender({ key: 'v2', target: target('au10y'), requestedAlloyId: null });
    expect(result.current.alloy.id).toBe('au10y');
    rerender({ key: 'v1', target: target('au14y'), requestedAlloyId: null });
    expect(result.current.alloy.id).toBe('pt950ru');
  });

  it('works in memory when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const { result, rerender } = renderHook((props) => useMetalChoice(props), {
      initialProps: { key: 'v1', target: null, requestedAlloyId: null },
    });
    expect(result.current.alloy.id).toBe('au14y');
    act(() => result.current.setAlloyId('ag925'));
    expect(result.current.alloy.id).toBe('ag925');
    // The in-memory last pick still carries to a model with no target.
    rerender({ key: 'v2', target: null, requestedAlloyId: null });
    expect(result.current.alloy.id).toBe('ag925');
  });
});
