# CAD analytics: what to actually fix

Date: 2026-08-28
Source: PostHog AI report (2026-08-28) re-checked line by line against the code on main.

## Read this first: the report's root cause is wrong

The report concludes that all three bugs share one cause, "event properties are read
from React component state set during an earlier action". That is not true of this
codebase.

`useImageToCADWorkflow.ts:99`

    const cadSource = resolveCadSource(cadRoute);

`cadRoute` is a prop, fixed per page. It is not state, it is not set by
`cad_studio_open`, and it already survives refresh and SPA navigation. The report's
recommended fix, deriving source from `window.location.pathname` at capture time, is
equivalent to what the code already does.

There is exactly one emitter for each CAD event, and every one of them passes source:

| Event | Only emitter | source |
|---|---|---|
| cad_studio_open | TextToCAD.tsx:54, ImageToCAD.tsx:138 | literal |
| cad_reference_uploaded | ImageToCAD.tsx | literal |
| cad_generation_started | useImageToCADWorkflow.ts:300 | cadSource |
| cad_generation_completed | useImageToCADWorkflow.ts:149 | via buildCadGenerationProps |
| cad_generation_failed | useImageToCADWorkflow.ts:122, 324 | cadSource |
| cad_result_restored | useImageToCADWorkflow.ts:214, 228 | cadSource |

A post-deploy `cad_generation_completed` cannot be missing source. There is no code
path that produces one.

## What actually explains the report's three findings

Commit `4227f1d8`, merged to main 2026-08-21, introduced `source`, `cad_studio_open`
and `cad_generation_started` together. `cad_generation_completed` predates it and
originally carried no source.

The report queried "since Aug 1 2026". Roughly three of its four weeks predate the
instrumentation. That alone produces all three headline numbers:

- 55% of completions missing source: the pre-deploy events.
- Null source correlates 100% with no `cad_studio_open`: both were born in the same
  deploy, so the correlation is definitional, not causal.
- 20 completions vs 15 starts: `cad_generation_started` did not exist for most of the
  window. Not "analytically impossible", just a younger event.
- 26 CAD-context downloads without source: pre-deploy.

### Settle it with one query before changing any code

    SELECT
        toDate(timestamp) AS day,
        countIf(empty(toString(properties.source))) AS missing_source,
        countIf(notEmpty(toString(properties.source))) AS has_source
    FROM events
    WHERE event = 'cad_generation_completed'
      AND timestamp >= '2026-08-01'
    GROUP BY day ORDER BY day

If missing_source drops to zero on or shortly after the production deploy of
4227f1d8, bugs 1 and 3 as written in the report are already fixed and need no code
change. Confirm the actual production deploy date first; merge date is not deploy
date.

## Bug A (real): completions are lost when the user leaves the page

`useImageToCADWorkflow.ts:107`

    if (!trackedRun || hasNavigatedAway.current) return;

`cad_generation_completed` fires only from this on-page effect. `handleKeepCreating`
sets `hasNavigatedAway.current = true`. So a run that finishes after the user pressed
Keep Creating, navigated to another route, or closed the tab never fires a completion
event at all. `GenerationsContext` owns the polling and knows the run completed, but
it emits nothing.

Effect on the data: completions are undercounted, biased toward users who sat and
watched. This is the opposite direction from the report's "more completions than
starts", which is further evidence that comparison was a date-window artifact.

Fix: emit `cad_generation_completed` from `GenerationsContext` where the CAD run
reaches a terminal state, not from the page effect, so it fires regardless of where
the user is. The context already holds `kind === 'cad'` runs and can carry source on
the tracked run. Guard against double-firing when the page is also mounted.

## Bug B (real, and the report missed it): CAD snapshot downloads carry no source

`SnapshotPreviewModal.tsx:52` and `:66` fire `download_clicked` with
`context: 'generations-snapshot'` and no source, for a `ring-*.png` and for
`model.glb`. This modal is rendered only from `WorkflowCard.tsx:331`, which is the
CAD history card and already has `workflow.source_type` in hand and already passes
`cadSourceFromSourceType(workflow.source_type)` to its sibling download handler at
line 156.

These are CAD downloads. They are the one CAD download context still unattributable
today.

Fix: pass `source` into `SnapshotPreviewModal` from `WorkflowCard` and include it in
both captures.

Do NOT add source to `unified-studio` (ResultImageItem.tsx:118) or
`generations-photo` (PhotoPreviewModal.tsx:28,36). Those are photoshoot downloads and
have no CAD source. The report's "95% of downloads missing source" counts them, which
is why that number is misleading.

## Bug C (real, silent): unknown source_type is misreported as text-to-cad

`cad-analytics.ts:133`

    return sourceType === 'image_to_cad' ? 'image-to-cad' : 'text-to-cad';

Anything not exactly `image_to_cad` becomes `text-to-cad`, including an empty,
missing or renamed value from the history API. Every history download and every
history restore of such a run is silently attributed to Text-to-CAD.

Fix: return `undefined` for an unrecognised value and let the property be omitted,
so an unknown reads as unknown rather than inflating one bucket. Widen the
`CadSource` return type accordingly and update `cad-analytics.test.ts`.

## Not a bug: cross-session starts

`cad_generation_started` fires once, at submission, which is correct. A user who
submits in one session and returns in another produces a completion with no start in
that second session. PostHog funnels are person-scoped, not session-scoped, so this
resolves itself at the query layer for identified users.

Do not implement the report's Fix B (re-emitting `cad_generation_started` with
`resumed: true`). It inflates the start count with events the user never triggered
and corrupts start-to-completion conversion.

If cross-session joining is wanted, add a durable `workflow_id` property to
`cad_generation_started`, `cad_generation_completed` and `cad_generation_failed`.
That makes the funnel reconstructable deterministically without inventing events.
This is the change worth making.

## Status: bugs A, B and C are fixed in this branch

Implemented 2026-08-28. What remains for engineering is step 1 (the by-day query,
to close the original report's bugs 1 and 3 with evidence) and step 2 (workflow_id),
which is optional.

| Bug | Fix shipped |
|---|---|
| A, dropped completions | `cad_generation_completed` now emitted from `GenerationsContext` at both CAD terminal sites, guarded by the existing `settledCadIds`. Removed from the page effect. Properties are captured at submission and carried on the tracked run, and persisted, so a refresh keeps them. |
| B, snapshot downloads | `WorkflowCard` passes `source` into `SnapshotPreviewModal`; both captures include it. |
| C, source_type fallthrough | `cadSourceFromSourceType` returns `undefined` for unrecognised values. Routing still defaults to Text-to-CAD, since a wrong route breaks the user while a guessed source only breaks the data. |

Verification: `npx tsc --noEmit` clean, `npx vitest run` 770 passed (the single
failure, `glb-url.test.ts`, is pre-existing and env-dependent -- it asserts
behaviour for an unset `VITE_AZURE_BLOB_BASE_URL`, which `.env` defines).
ESLint on `GenerationsContext.tsx` is at its 8-problem baseline, unchanged.

## Order of work

1. Run the by-day query above. If it confirms the pre-deploy explanation, close the
   report's bugs 1 and 3 with no code change.
2. Add `workflow_id` to the three generation events. Cheap, unblocks reporting.
3. Fix Bug A. This is the one that is actively losing data today.
4. Fix Bug B and Bug C. Both are small and local.

Tests ship with each per AI_RULES section 10: `cad-analytics.test.ts` for Bug C,
`posthog-events.test.ts` for the new `workflow_id` property, and a
`GenerationsContext` test for Bug A asserting completion fires with the page unmounted.
