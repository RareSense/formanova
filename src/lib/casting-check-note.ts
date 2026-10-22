/**
 * Plain words for the casting STL's check flags.
 *
 * Lives in lib/ rather than a CAD folder because both the CAD workspaces and
 * the generations history show it (CLAUDE.md module boundaries).
 *
 * The note is advice for the manufacturer, never a warning: a flagged file is
 * still a usable file, so the wording stays calm and the download is never
 * blocked.
 */
import type { CadCastingInfo } from '@/lib/ring-cad-nurbs-api';

const CASTING_FLAG_WORDS: Record<string, string> = {
  multiple_shells: 'more than one piece',
  separate_pieces: 'made as separate pieces (for example a pair or chain links)',
  floating_parts: 'a small part is not attached',
  self_intersections: 'some surfaces cross each other',
  self_intersections_not_checked: 'not every surface could be checked',
  metal_left_out: 'a part could not be included',
  stones_not_held: 'a stone may not be held by metal',
  touching_edges: 'some parts only touch along a line',
  thin_walls: 'some walls are thin',
  size_outside_mm_range: 'the size looks unusual',
};

const MAX_REASONS = 3;

/**
 * The note shown under the Casting STL item, or null when there is nothing to
 * say. Only a "flagged" file gets one. Unknown codes are left out; if every
 * code is unknown, a generic line stands in so the flag is not lost.
 */
export function castingCheckNote(
  status: CadCastingInfo['status'] | undefined,
  flags: readonly string[] | undefined,
): string | null {
  if (status !== 'flagged') return null;
  const reasons = [...new Set((flags ?? []).map((flag) => CASTING_FLAG_WORDS[flag]).filter(Boolean))];
  if (reasons.length === 0) return 'Your manufacturer may want to give it a quick check.';
  return `Your manufacturer may want to check: ${reasons.slice(0, MAX_REASONS).join('; ')}.`;
}

/**
 * What the download menu should offer for a run's casting files. A "failed"
 * casting STL is not offered; the stone list stands on its own.
 */
export function castingDownloadOffer(casting: CadCastingInfo | null | undefined): {
  castingStlUrl: string | null;
  stonesUrl: string | null;
  note: string | null;
} {
  const castingStlUrl = casting?.status === 'failed' ? null : casting?.castingStlUrl ?? null;
  return {
    castingStlUrl,
    stonesUrl: casting?.stonesUrl ?? null,
    note: castingStlUrl ? castingCheckNote(casting?.status, casting?.flags) : null,
  };
}
