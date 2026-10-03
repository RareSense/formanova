import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { cadBreakpointFor, useCadBreakpoint, useCadCanHover } from './use-cad-breakpoint';

type Listener = () => void;

/** A matchMedia stand-in driven by one shared width, like a real window. */
function installMatchMedia(initialWidth: number) {
  let width = initialWidth;
  const listeners = new Set<Listener>();
  const matches = (query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query);
    return min ? width >= Number(min[1]) : false;
  };
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() { return matches(query); },
    media: query,
    addEventListener: (_: string, l: Listener) => listeners.add(l),
    removeEventListener: (_: string, l: Listener) => listeners.delete(l),
  }));
  return {
    resize(next: number) {
      width = next;
      listeners.forEach((l) => l());
    },
    listenerCount: () => listeners.size,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('cadBreakpointFor', () => {
  it('maps widths onto phone, tablet and desktop at 768 and 1280', () => {
    expect(cadBreakpointFor(320)).toBe('phone');
    expect(cadBreakpointFor(767)).toBe('phone');
    expect(cadBreakpointFor(768)).toBe('tablet');
    expect(cadBreakpointFor(1279)).toBe('tablet');
    expect(cadBreakpointFor(1280)).toBe('desktop');
    expect(cadBreakpointFor(1920)).toBe('desktop');
  });
});

describe('useCadCanHover', () => {
  it('is false on touch screens and true with a mouse', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(hover: none)' }));
    expect(renderHook(() => useCadCanHover()).result.current).toBe(false);
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(renderHook(() => useCadCanHover()).result.current).toBe(true);
  });

  it('assumes a mouse where matchMedia does not exist', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(renderHook(() => useCadCanHover()).result.current).toBe(true);
  });
});

describe('useCadBreakpoint', () => {
  it('reads the right mode on the first render, so no desktop layout flashes on a phone', () => {
    installMatchMedia(390);
    const { result } = renderHook(() => useCadBreakpoint());
    expect(result.current).toBe('phone');
  });

  it('follows the window across breakpoints', () => {
    const mq = installMatchMedia(1440);
    const { result } = renderHook(() => useCadBreakpoint());
    expect(result.current).toBe('desktop');
    act(() => mq.resize(1024));
    expect(result.current).toBe('tablet');
    act(() => mq.resize(390));
    expect(result.current).toBe('phone');
    act(() => mq.resize(1280));
    expect(result.current).toBe('desktop');
  });

  it('stops listening on unmount', () => {
    const mq = installMatchMedia(1440);
    const { unmount } = renderHook(() => useCadBreakpoint());
    expect(mq.listenerCount()).toBeGreaterThan(0);
    unmount();
    expect(mq.listenerCount()).toBe(0);
  });

  it('falls back to desktop where matchMedia does not exist', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { result } = renderHook(() => useCadBreakpoint());
    expect(result.current).toBe('desktop');
  });
});
