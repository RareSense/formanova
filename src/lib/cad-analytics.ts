/**
 * CAD analytics domain logic.
 *
 * Deliberately free of any PostHog dependency. The event vocabulary (names and
 * typed payloads) lives in `posthog-events.ts`, which is the single-file event
 * API that CLAUDE.md mandates and `eslint.config.js` enforces. What lives here
 * is the CAD-specific reasoning that turns workflow state into those payloads:
 * which tool is running, where a restore came from, and whether this is the
 * user's first CAD run.
 *
 * Keeping it separate means two things. The hook stays a workflow hook instead
 * of growing five inlined property literals, and every rule below is unit
 * tested without mocking PostHog.
 */

import { RING_CAD_DEFAULT_TIER } from '@/lib/ring-cad-nurbs-api';

/** Which of the two CAD tools a run belongs to. A property, never two events. */
export type CadSource = 'text-to-cad' | 'image-to-cad';

export type CadRoute = '/text-to-cad' | '/image-to-cad';

/**
 * How the user arrived at a restored CAD result.
 *
 * `external` is not called `email` on purpose. It is every arrival we did not
 * generate ourselves, which is overwhelmingly the completion email but also
 * covers bookmarks, pasted URLs and links shared between colleagues. Naming it
 * `email` would claim a precision the data does not have.
 */
export type CadRestoreEntry = 'history' | 'toast' | 'header' | 'external';

/** The internal markers we write. `external` is inferred from their absence. */
const INTERNAL_ENTRIES: readonly CadRestoreEntry[] = ['history', 'toast', 'header'];

/**
 * Query parameter carrying our own restore marker.
 *
 * Attribution here works by inversion. The completion email and history's
 * "Load in Studio" produce the same URL shape, so they used to be
 * indistinguishable. Rather than ask backend to tag the email, we tag every
 * link we generate ourselves; an arrival with no tag is therefore external.
 *
 * That inference is only sound while EVERY internal navigation is marked. All
 * of them go through `buildCadRestorePath` in `GenerationsContext.tsx`, whose
 * `src` argument is required precisely so that a new internal navigation which
 * forgets the marker fails to compile instead of quietly inflating the
 * external count. If you ever add a CAD restore link, route it through that
 * builder rather than assembling params by hand.
 */
export const CAD_RESTORE_SRC_PARAM = 'src';

/** localStorage key for the CAD first-run flag.
 *
 *  Separate from the photoshoot key on purpose. `consumeFirstGeneration` in
 *  posthog-events.ts owns `ph_first_generation_done`, and sharing it would mean
 *  a user whose first ever generation is CAD flips the flag, so their first
 *  photoshoot then reports `is_first_ever: false`. The two funnels each need
 *  their own first-run truth. */
const PH_FIRST_CAD_GEN_KEY = 'ph_first_cad_generation_done';

/** The tool identity behind a run, derived from the page that owns it. */
export function resolveCadSource(cadRoute: CadRoute): CadSource {
  return cadRoute === '/image-to-cad' ? 'image-to-cad' : 'text-to-cad';
}

/**
 * Reads our own marker off a restore URL.
 *
 * Anything unrecognised falls through to `external` rather than to a default
 * internal value. A malformed marker bucketed as `history` would hide a real
 * external arrival, which is the one number this event exists to produce.
 */
export function resolveRestoreEntry(search: URLSearchParams | string): CadRestoreEntry {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const marker = params.get(CAD_RESTORE_SRC_PARAM)?.trim();
  return INTERNAL_ENTRIES.find(entry => entry === marker) ?? 'external';
}

/** True only on this browser's very first CAD generation. Flips permanently
 *  after that. Robust to session resets, not to a storage clear. */
export function consumeFirstCadGeneration(): boolean {
  const done = localStorage.getItem(PH_FIRST_CAD_GEN_KEY) === '1';
  if (!done) localStorage.setItem(PH_FIRST_CAD_GEN_KEY, '1');
  return !done;
}

export interface CadGenerationPropsInput {
  cadRoute: CadRoute;
  prompt: string;
  referenceImageCount: number;
  tier?: string;
}

export interface CadGenerationProps {
  source: CadSource;
  category: 'ring';
  prompt_length: number;
  reference_image_count: number;
  llm_tier: string;
}

/**
 * The property bundle shared by `cad_generation_started` and
 * `cad_generation_completed`.
 *
 * They share a builder so they cannot drift apart. A property added to one and
 * forgotten on the other is the standard way a conversion funnel starts lying
 * months after it was built, and the drift is invisible until someone queries
 * the chart and gets a number nobody can explain.
 */
export function buildCadGenerationProps(input: CadGenerationPropsInput): CadGenerationProps {
  return {
    source: resolveCadSource(input.cadRoute),
    // Hardcoded because ring_cad_nurbs_v1 only makes rings. If CAD ever gains a
    // second jewelry type this must become a real input, and the singular-value
    // rule in CLAUDE.md still applies ('ring', never 'rings').
    category: 'ring',
    prompt_length: input.prompt.trim().length,
    reference_image_count: input.referenceImageCount,
    llm_tier: input.tier ?? RING_CAD_DEFAULT_TIER,
  };
}

/**
 * Bridges the history API's `source_type` enum to this module's `CadSource`.
 *
 * The two vocabularies differ (`image_to_cad` vs `image-to-cad`) because
 * source_type mirrors the backend field while CadSource is the analytics
 * dimension. Converting in one place stops the mapping being re-derived, and
 * subtly differently, at each call site.
 */
export function cadSourceFromSourceType(sourceType: string): CadSource {
  return sourceType === 'image_to_cad' ? 'image-to-cad' : 'text-to-cad';
}

/** The page that owns a given tool, for building restore links. */
export function cadRouteFromSource(source: CadSource): CadRoute {
  return source === 'image-to-cad' ? '/image-to-cad' : '/text-to-cad';
}
