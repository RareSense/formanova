import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { MetalWeightInput } from '@/lib/metal-weight/source';
import { useCadMetal } from './useCadMetal';

const input: MetalWeightInput = {
  key: 'v1',
  source: { available: true, volumeMm3: 2192.4, from: 'version' },
  target: { grams: 28, tolerancePct: 5, alloyId: 'au14y' },
  requestedAlloyId: null,
  twoTone: false,
};

describe('useCadMetal', () => {
  beforeEach(() => localStorage.clear());

  it('passes the weight inputs through with the shown alloy', () => {
    const { result } = renderHook(() => useCadMetal(input, vi.fn()));
    expect(result.current.view.source).toBe(input.source);
    expect(result.current.view.target).toBe(input.target);
    expect(result.current.view.alloy.id).toBe('au14y');
  });

  it('a pick in the weight table also changes the look of every metal part', () => {
    const applyMetalToAll = vi.fn();
    const { result } = renderHook(() => useCadMetal(input, applyMetalToAll));
    act(() => result.current.view.setAlloyId('au18r'));
    expect(result.current.view.alloy.id).toBe('au18r');
    expect(applyMetalToAll).toHaveBeenCalledWith('gold-rose-polished');
  });

  it('a look picked in the Material panel also changes the weight metal', () => {
    const applyMetalToAll = vi.fn();
    const { result } = renderHook(() => useCadMetal(input, applyMetalToAll));
    act(() => result.current.chooseLook('gold-white-polished'));
    expect(applyMetalToAll).toHaveBeenCalledWith('gold-white-polished');
    expect(result.current.view.alloy.id).toBe('au14w');
  });

  it('a look without a cited density changes only the look', () => {
    const applyMetalToAll = vi.fn();
    const { result } = renderHook(() => useCadMetal(input, applyMetalToAll));
    act(() => result.current.chooseLook('copper-natural-polished'));
    expect(applyMetalToAll).toHaveBeenCalledWith('copper-natural-polished');
    expect(result.current.view.alloy.id).toBe('au14y');
  });

  it('ignores an id that is not in the table', () => {
    const applyMetalToAll = vi.fn();
    const { result } = renderHook(() => useCadMetal(input, applyMetalToAll));
    act(() => result.current.view.setAlloyId('platinum_cobalt'));
    expect(applyMetalToAll).not.toHaveBeenCalled();
    expect(result.current.view.alloy.id).toBe('au14y');
  });
});
