/**
 * Remembers which studio someone actually works in, so returning users land
 * where they spend their time instead of always on Photo Studio.
 *
 * Counts visits rather than time: a visit is an explicit choice to open that
 * studio, whereas elapsed time mostly measures how slow a generation was. A
 * long CAD run would otherwise outweigh a dozen deliberate Photo Studio
 * sessions.
 *
 * Device-local on purpose. There is no profile field for this, and getting it
 * slightly wrong on a second device costs one extra click, which does not
 * justify a backend round trip on every studio open.
 */

const STORAGE_KEY = 'formanova_studio_visits';

export type Studio = 'photo' | 'cad';

/** Where a first-time user lands, and the fallback whenever nothing is stored. */
export const DEFAULT_STUDIO_PATH = '/studio';
export const CAD_STUDIO_PATH = '/studio-cad';

/**
 * Visits the leader needs before it can move anyone. Below this, one stray
 * click through a studio would redirect every future session.
 */
const SWITCH_THRESHOLD = 3;

/** Keeps one bad actor, or a very long-lived account, from pinning the result forever. */
const MAX_COUNT = 999;

type VisitCounts = { photo: number; cad: number };

function readCounts(): VisitCounts {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    const toCount = (value: unknown) =>
      typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), MAX_COUNT) : 0;
    return { photo: toCount(raw?.photo), cad: toCount(raw?.cad) };
  } catch {
    return { photo: 0, cad: 0 };
  }
}

/** Records one visit. Safe to call on every mount; storage failures are ignored. */
export function recordStudioVisit(studio: Studio): void {
  const counts = readCounts();
  counts[studio] = Math.min(counts[studio] + 1, MAX_COUNT);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(counts));
  } catch {
    // Private mode or a full quota. Losing the preference is not worth a throw.
  }
}

/**
 * The studio to land on. Photo Studio unless CAD is both clearly ahead and
 * used enough to mean something, so the default only changes for someone who
 * has genuinely settled into CAD.
 */
export function getPreferredStudioPath(): string {
  const { photo, cad } = readCounts();
  if (cad >= SWITCH_THRESHOLD && cad > photo) return CAD_STUDIO_PATH;
  return DEFAULT_STUDIO_PATH;
}

/** Test seam. */
export function clearStudioVisits(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do; the next read falls back to zeroes anyway.
  }
}
