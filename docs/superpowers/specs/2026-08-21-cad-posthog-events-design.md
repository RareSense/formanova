# CAD PostHog Events - Design

Date: 2026-08-21
Status: Implemented on feat/cad-posthog-events. No backend dependency.

## Problem

Text-to-CAD and Image-to-CAD shipped to main (93b6e8fd) with almost no analytics.
The photoshoot tools have a full funnel; CAD has three partial events and no way
to tell the two CAD tools apart.

What exists today:

| Event | Site | Gap |
|---|---|---|
| `cad_generation_completed` | `useImageToCADWorkflow.ts:112` | `category` hardcoded `'ring'`, no source, no tier, no reference count, no first-ever flag |
| `paywall_hit` | `useImageToCADWorkflow.ts:206` | no source |
| `download_clicked` | `TextToCAD.tsx:203,224`, `ImageToCAD.tsx:144,165` | correct, carries `context` |
| `download_clicked` | `WorkflowCard.tsx:139` | `context: 'generations'`, no source, so every history download is unattributable |
| `webgl_context_lost` / `_restored` | `CADCanvas.tsx` | health metric, not funnel |

Unmeasurable as a result: how many people start a CAD generation, how many fail,
how many return from the completion email, and the text-vs-image split on any of it.

## Decision: dedicated `cad_*` events, `source` as a property

Confirmed with an external PostHog expert.

CAD keeps its own event names rather than merging into the photoshoot
`generation_start` / `generation_completed`, because:

1. `cad_generation_completed` already ships and has live data. Renaming a live
   event orphans its history.
2. The property sets barely overlap. `generation_completed` carries `category`,
   `upload_type`, `resolution`, `aspect_ratio`, `jewelry_image_count`, `effort`.
   CAD can fill none of them honestly, so merging would add null-heavy rows to
   existing photoshoot dashboards.
3. The funnels are different shapes. Photoshoot is category, upload, model,
   generate. CAD is prompt or upload, then generate.

Text-to-CAD and Image-to-CAD are NOT separate event names. They share one hook
(`useImageToCADWorkflow`) and differ only by input, so they are one action with a
`source` dimension: `'text-to-cad' | 'image-to-cad'`.

## Event schema

Every event below carries `source: 'text-to-cad' | 'image-to-cad'`, derived once
from the hook's existing `cadRoute` parameter.

### New events

| Event | Fires when | Properties |
|---|---|---|
| `cad_studio_open` | Either CAD page mounts | `source` |
| `cad_reference_uploaded` | Reference images added (Image-to-CAD only) | `source`, `image_count`, `total_after_add` |
| `cad_generation_started` | `simulateGeneration`, after credit preflight passes and the start call returns a `workflow_id` | `source`, `prompt_length`, `reference_image_count`, `llm_tier`, `is_first_ever` |
| `cad_generation_failed` | Hook reaches `failed_final` | `source`, `failure_stage: 'start' \| 'run'`, `duration_ms`, `has_failure_message` (start only) |
| `cad_result_restored` | Mount restore effect resolves | `source`, `entry: 'history' \| 'toast' \| 'header' \| 'external'`, `restore_ok` |

### Amended events

| Event | Change |
|---|---|
| `cad_generation_completed` | Add `source`, `reference_image_count`, `llm_tier`, `is_first_ever`. Keep `category: 'ring'`; CAD genuinely only makes rings today. Existing properties unchanged, so existing charts keep working. |
| `paywall_hit` | Add optional `source`. Photoshoot callers omit it and are unaffected. |
| `download_clicked` at `WorkflowCard.tsx:139` | Add `source` from `workflow.source_type`, which `generation-history-api.ts` already resolves to `text_to_cad` / `image_to_cad`. |

## Photoshoot parity mapping

| Photoshoot | CAD equivalent |
|---|---|
| `studio_open` | `cad_studio_open` |
| `category_selected` | none - CAD has no category step, always a ring |
| `jewelry_uploaded` | `cad_reference_uploaded` |
| `model_selected` | none - CAD has no model step |
| `generation_start` | `cad_generation_started` |
| `generation_completed` | `cad_generation_completed` |
| `paywall_hit` | `paywall_hit` with `source` |
| `download_clicked` | `download_clicked` with `source` |

## First-generation flag: separate key required

`consumeFirstGeneration()` in `posthog-events.ts:20` reads one global
localStorage key, `ph_first_generation_done`, and only photoshoot calls it today.

If CAD called the same function, a user whose first ever generation is a CAD run
would flip the shared flag, and their first photoshoot would then report
`is_first_ever: false`. That silently corrupts an existing photoshoot metric.

CAD gets its own: `consumeFirstCadGeneration()` on key
`ph_first_cad_generation_done`, same consume-once semantics.

## Email completion notification: mark our own links, not theirs

The completion email is sent by the backend, so the frontend cannot fire an
"email sent" event. What it can measure is whether the email brings the user
back. Both pages already restore from `?workflow_id=` on mount
(`TextToCAD.tsx:121`, `ImageToCAD.tsx:108`) and fire nothing today.

The obvious approach was to ask backend to add `src=email` to the email link.
Rejected: it blocks us on another team, and it is the harder half of the
problem.

### The inversion

History's Load in Studio navigates to the same URL shape the email uses, which
is why the two were indistinguishable. But those internal navigations are ours.
If we mark every link we generate ourselves, then a `workflow_id` URL arriving
with no marker came from outside the app. Absence is the signal, and it needs no
backend change.

This is only sound if every internal path is marked. An unmarked internal
navigation would silently inflate the external count. There are four:

| Path | Site | Already shared? |
|---|---|---|
| Toast action on a completed CAD run | `GenerationsContext.tsx:505` | yes |
| Generations panel action | `GenerationsContext.tsx:621` | yes |
| Header running/ready indicator | `Header.tsx:71` | yes |
| History Load in Studio | `WorkflowCard.tsx:161` | no, hand-rolls the params |

Three of the four already call the shared `buildCadRestorePath` helper
(`GenerationsContext.tsx:88`). So:

1. `buildCadRestorePath` gains a required `src` argument and writes it into the
   query string. One edit covers three call sites.
2. `WorkflowCard.tsx:161` switches from its hand-rolled `URLSearchParams` to the
   shared builder, which also removes the duplication that let it drift in the
   first place.

Making `src` required rather than optional is deliberate: it makes a future
internal navigation that forgets the marker a TypeScript error rather than a
quiet data leak into the external bucket.

`workflow-classifier.ts` also exposes a `loadRoute`, but it is referenced only
by its own tests and is not a live navigation path.

### The `entry` property

`cad_result_restored` carries `entry: 'history' | 'toast' | 'header' |
'external'`.

`external` is not renamed to `email` because it is not only email. A bookmark, a
pasted URL or a link shared between colleagues all land there too. Those are
expected to be a small minority, so `external` is a good email proxy, but the
property name should not claim a precision the data does not have.

Both pages strip the query string after restoring
(`TextToCAD.tsx:129`, `ImageToCAD.tsx:115`, both `replace: true`), so the event
must fire from the restore effect before that strip runs, and a browser Back
cannot resurrect a marked URL and double count it.

### Remaining backend ask

Only one, and it no longer blocks anything: confirm the completion email names
the right tool (Text-to-CAD vs Image-to-CAD) in its subject and body. Attribution
itself is now fully frontend-owned.

## Where the code lands

Two rules pull in opposite directions here. CLAUDE.md mandates a single-file
event API in `posthog-events.ts`, enforced by the ESLint rule at
`eslint.config.js:35` that bans `posthog-js` imports elsewhere. AI_RULES section
8 sets a 500-line ceiling and forbids mixing concerns, and
`posthog-events.ts` is already 424 lines.

The split is by concern, not by file:

- The event vocabulary, meaning names and typed payloads, stays in
  `posthog-events.ts`. That is the contract ESLint enforces.
- The CAD domain logic is not event plumbing. Deriving `source` from the route,
  deriving `entry` from the URL, owning the first-CAD-generation key and
  assembling the repeated property bundle are all pure functions. They go in a
  new module, which keeps them out of both the hook and the event file and makes
  them testable with no PostHog mocking at all.

### New: `src/lib/cad-analytics.ts`

Pure, no React, no PostHog import.

| Export | Responsibility |
|---|---|
| `CadSource` | `'text-to-cad' \| 'image-to-cad'` |
| `resolveCadSource(cadRoute)` | `'/text-to-cad'` to `'text-to-cad'` |
| `resolveRestoreEntry(search)` | `URLSearchParams` to `CadRestoreEntry`, reading our own `src` marker and defaulting to `'external'` |
| `consumeFirstCadGeneration()` | Consume-once on key `ph_first_cad_generation_done` |
| `buildCadGenerationProps(input)` | Workflow state to the shared started/completed payload |

Because `buildCadGenerationProps` owns the property bundle, `started` and
`completed` cannot drift apart, which is the usual way a funnel silently breaks.

### Edited

| File | Change |
|---|---|
| `src/lib/posthog-events.ts` | 6 thin track functions plus props interfaces, roughly +65 lines to about 490. No existing export touched. |
| `src/hooks/useImageToCADWorkflow.ts` | One line per call site: started, failed, completed, restored, and `source` on the paywall call |
| `src/pages/TextToCAD.tsx`, `src/pages/ImageToCAD.tsx` | `cad_studio_open` on mount; `cad_reference_uploaded` on the Image-to-CAD add handler |
| `src/components/generations/WorkflowCard.tsx` | `source` on the existing `trackDownloadClicked` call, plus swapping the hand-rolled restore URL for the shared builder |
| `src/contexts/GenerationsContext.tsx` | `buildCadRestorePath` gains a required `src` argument; its two call sites pass `'toast'` |
| `src/components/layout/Header.tsx` | Passes `'header'` to `buildCadRestorePath` |

No config changes and no moved code. Every existing import of `posthog-events`
keeps working unchanged. `buildCadRestorePath` is the one existing signature
that changes, and making the new argument required means the compiler finds
every call site rather than leaving one silently unmarked.

`CadWorkflowModal.tsx` also downloads CAD artifacts but is rendered nowhere. It
is dead code and is deliberately left uninstrumented.

Note for whoever comes next: `posthog-events.ts` lands at about 490 lines, just
under the ceiling. The next feature to add events must split it into a barrel
(`src/lib/posthog/*` re-exported from `posthog-events.ts`) rather than appending.

## Testing

Per AI_RULES section 10 tests ship with this change, not in a later PR, and per
CLAUDE.md the Vitest test is written before the implementation.

### New: `src/lib/cad-analytics.test.ts`

The pure module is tested directly, no mocks required:

- `resolveCadSource` maps both routes correctly
- `resolveRestoreEntry` returns the marked value for each of `history`, `toast`
  and `header`, and falls back to `'external'` for a missing param, an empty
  param and any unrecognised value, so a malformed marker never reads as
  internal
- `consumeFirstCadGeneration` returns true once then false forever
- `consumeFirstCadGeneration` and `consumeFirstGeneration` do not interfere:
  consuming either one leaves the other still returning true. This is the
  regression the separate key exists to prevent.
- `buildCadGenerationProps` produces `reference_image_count: 0` for text-to-cad,
  the real count for image-to-cad, and a trimmed `prompt_length`

Marker coverage is also asserted in
`src/contexts/GenerationsContext.test.tsx` if one exists, or a new focused test
otherwise: `buildCadRestorePath` writes the `src` marker for every entry value,
and preserves the existing `workflow_id` and `glb` parameters unchanged.

### Added to `src/lib/posthog-events.test.ts`

- One case per new track function asserting the event name and full payload
- One case per amended event asserting the new property is present and the
  existing properties are unchanged, so existing dashboards are provably safe
- The existing 20 tests stay green and are not weakened

## Out of scope

Low-signal UI interactions: Keep Creating, the gem render toggle, the
notification email save, and opening the history library. They can be added
later if a specific question needs them.

## Implementation notes

Three things surfaced during the build that the design did not anticipate.

**`has_failure_message` only exists for start failures.** A run-stage failure is
reported through `GenerationsContext`, and `TrackedGeneration` carries no failure
text. Sending `false` there would have asserted "backend never explains run
failures" when the truth is that this layer cannot see it. The property is
optional and omitted for `failure_stage: 'run'`.

**`is_first_ever` is consumed once and remembered, not read twice.**
`consumeFirstCadGeneration` flips permanently on first call. If both the started
and completed events called it, completed would always report `false` and the two
ends of the funnel would disagree on the same run. Started consumes it into
`startedFirstEverRef`; completed reads that ref.

**`cadSourceFromSourceType` was added to bridge two vocabularies.** The history
API speaks `image_to_cad` while the analytics dimension is `image-to-cad`.
Converting in one tested place stops that mapping being re-derived, and subtly
differently, at each call site.

## Verification

- `npx vitest run`: 683 passed, 72 files, 0 failed
- `npx tsc --noEmit`: clean
- `npm run build`: built in 47s
- ESLint on touched files: no new errors. Baseline for the CAD pages was 9
  pre-existing errors (`no-explicit-any`, `no-unused-expressions`) and it is
  still 9. The one new warning this work introduced (a missing `cadSource`
  dependency) was fixed by adding the dependency rather than suppressing it.
