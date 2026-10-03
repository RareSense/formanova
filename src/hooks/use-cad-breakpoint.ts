import { useEffect, useState } from 'react';

/**
 * Which CAD workspace layout fits the window.
 *
 * - phone   (< 768 px): 3D view on top, a bottom sheet for Material / Parts.
 * - tablet  (768-1279 px): 3D view full width, both panels slide over it.
 * - desktop (>= 1280 px): the three resizable columns, unchanged.
 */
export type CadBreakpoint = 'phone' | 'tablet' | 'desktop';

export const CAD_TABLET_MIN_WIDTH = 768;
export const CAD_DESKTOP_MIN_WIDTH = 1280;

const TABLET_QUERY = `(min-width: ${CAD_TABLET_MIN_WIDTH}px)`;
const DESKTOP_QUERY = `(min-width: ${CAD_DESKTOP_MIN_WIDTH}px)`;

export function cadBreakpointFor(width: number): CadBreakpoint {
  if (width >= CAD_DESKTOP_MIN_WIDTH) return 'desktop';
  if (width >= CAD_TABLET_MIN_WIDTH) return 'tablet';
  return 'phone';
}

function read(): CadBreakpoint {
  // No matchMedia (tests, very old engines): keep today's desktop layout.
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'desktop';
  if (window.matchMedia(DESKTOP_QUERY).matches) return 'desktop';
  if (window.matchMedia(TABLET_QUERY).matches) return 'tablet';
  return 'phone';
}

/**
 * Whether the main pointer can hover. On touch screens a tap fires the mouse
 * enter events but never the leave, so hover highlights would stick; callers
 * leave hover handlers off there. Read once: the device does not change.
 */
export function useCadCanHover(): boolean {
  const [canHover] = useState(() =>
    typeof window === 'undefined' || typeof window.matchMedia !== 'function'
      ? true
      : !window.matchMedia('(hover: none)').matches,
  );
  return canHover;
}

/** Read synchronously on first render so a phone never paints the desktop columns first. */
export function useCadBreakpoint(): CadBreakpoint {
  const [mode, setMode] = useState<CadBreakpoint>(read);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const queries = [window.matchMedia(TABLET_QUERY), window.matchMedia(DESKTOP_QUERY)];
    const update = () => setMode(read());
    queries.forEach((q) => q.addEventListener('change', update));
    update();
    return () => queries.forEach((q) => q.removeEventListener('change', update));
  }, []);

  return mode;
}
