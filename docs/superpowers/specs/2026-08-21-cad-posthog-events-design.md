# CAD PostHog Events - Design

Date: 2026-08-21
Status: Approved pending backend answer on the email link marker

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
| `cad_generation_failed` | Hook reaches `failed_final` | `source`, `failure_stage: 'start' \| 'run'`, `duration_ms`, `has_failure_message` |
| `cad_result_restored` | Mount restore effect resolves | `source`, `entry: 'email' \| 'internal'`, `restore_ok` |

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

## Email completion notification

The completion email is sent by the backend, so the frontend cannot fire an
"email sent" event. What it can measure is whether the email brings the user
back.

Both pages already restore from `?workflow_id=` on mount (`TextToCAD.tsx:121`,
`ImageToCAD.tsx:108`) and fire nothing. The email links to `/text-to-cad?...` or
`/image-to-cad?...`, so the source is free from the route.

Open item: a restore from the email and a restore from history's Load in Studio
(`WorkflowCard.tsx:161`) produce the same URL shape and are indistinguishable
without a marker on the email link.

Resolution: ship `cad_result_restored` now. `entry` reads `'email'` when the URL
carries `src=email` and `'internal'` otherwise. Until backend adds that marker
every restore reports `'internal'`, which is honest rather than wrong, and the
property starts populating with no further frontend change. The backend ask is
tracked in `artifacts/cad-email-tracking-backend-question.txt`.

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
| `resolveRestoreEntry(search)` | `URLSearchParams` to `'email' \| 'internal'`, reading `src=email` |
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
| `src/components/generations/WorkflowCard.tsx` | One added property on the existing `trackDownloadClicked` call |

No config changes, no moved code, no re-exports. Every existing import of
`posthog-events` keeps working unchanged.

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
- `resolveRestoreEntry` returns `'email'` only for `src=email`, and `'internal'`
  for a missing param, an empty param and any other value
- `consumeFirstCadGeneration` returns true once then false forever
- `consumeFirstCadGeneration` and `consumeFirstGeneration` do not interfere:
  consuming either one leaves the other still returning true. This is the
  regression the separate key exists to prevent.
- `buildCadGenerationProps` produces `reference_image_count: 0` for text-to-cad,
  the real count for image-to-cad, and a trimmed `prompt_length`

### Added to `src/lib/posthog-events.test.ts`

- One case per new track function asserting the event name and full payload
- One case per amended event asserting the new property is present and the
  existing properties are unchanged, so existing dashboards are provably safe
- The existing 20 tests stay green and are not weakened

## Out of scope

Low-signal UI interactions: Keep Creating, the gem render toggle, the
notification email save, and opening the history library. They can be added
later if a specific question needs them.
