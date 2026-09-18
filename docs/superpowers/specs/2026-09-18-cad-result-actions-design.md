# CAD Result Actions, Versions, and History Inspiration Images

Date: 2026-09-18
Branch: `improved-cad-design` (based on `origin/main` at 92155821)
Pages affected: `/image-to-cad` (ImageToCAD.tsx) and `/text-to-cad` (TextToCAD.tsx)

## Problem

When a CAD run finishes, the finished object is the whole point of the page, but
the one action that completes the task (Download 3DM) sits in the top-right
corner of the viewport toolbar, next to controls that manipulate the object. It
reads as another tool rather than as the end of the job.

Two related gaps:

1. A ring will soon have versions (V1, V2, V3). There is no place in the UI for
   them and no "improve from the latest version" action.
2. Opening a completed run from history restores the 3D model but not the
   inspiration images that produced it, so the left panel looks empty for a run
   that definitely had reference images.

## Scope

In scope:

- Move the download control to a result action bar at the bottom center of the
  viewport, on both CAD pages.
- Add an "Improve from Vn" action beside it, rendered only when the run reports
  versions.
- Add a VERSIONS section to the left panel, rendered only when the run reports
  versions.
- Restore inspiration images when a run is opened from history.

Out of scope:

- The rest of the left panel layout (already correct).
- Generation flow, credits, viewport tools, CADCanvas (protected file).
- Any backend change. The versions data source does not exist yet.

## Design

### 1. CadResultActions

New component: `src/components/text-to-cad/CadResultActions.tsx`.

A bottom-center absolutely positioned bar inside the viewport, rendered under
the same condition the download uses today:

```
workflow.hasModel && !workflow.isGenerating && !workflow.isModelLoading
```

Contents, left to right:

- `Improve from V{n}` button, rendered only when `latestVersionLabel` is passed.
- `CadDownloadMenu`, moved out of `ViewportToolbar`'s `downloadSlot`.

Sizing rule (CLAUDE.md, equal-size siblings): both controls share one height and
one `min-w`, so the download is exactly the same size whether it stands alone or
sits beside the Improve button. Adding versions later must not resize the
download or shift it.

`CadDownloadMenu` gains a third variant, `result`, for this larger placement.
The existing `viewport` and `card` variants are untouched, so the history card
and any other consumer are unaffected.

Vertical placement: above the existing Ready indicator and gem toggle, which
stay at `bottom-4`. The bar does not overlap either one at any panel width.

Responsive: side by side on `sm` and up; stacked full width below that, still
equal width as siblings.

`ViewportToolbar`'s `downloadSlot` prop is removed along with its two call
sites, since nothing else passes it.

### 2. Versions (wired, dark)

An optional `versions` value is threaded from `useImageToCADWorkflow` into both
pages, then into `LeftPanel` and `CadResultActions`.

Shape:

```ts
interface CadVersion {
  id: string;
  label: string;      // "V1"
  thumbnailUrl: string | null;
  createdAt: string;  // ISO
}
```

The hook returns `undefined` today because no endpoint supplies this. With
`undefined` or an empty array:

- no VERSIONS section in the left panel
- no Improve button in the action bar
- the download keeps its exact current size and position

So this ships as a no-op visually and lights up when the backend lands.

The left panel VERSIONS section follows the mockup: a section header with the
count on the right, then a row of version tiles, each with its label and time,
the latest one marked with a LATEST badge and a selected border.

`onSelectVersion` and `onImproveFromVersion` are optional callbacks. When the
backend lands, the pages wire them; until then they are not passed and the UI
that would call them does not render.

### 3. Inspiration images on history restore

`restoreCompletedWorkflow` in `useImageToCADWorkflow` currently restores the GLB
and the 3DM but nothing about the input.

`reference_image_urls` is already produced by `listMyWorkflows` in
`src/lib/generation-history-api.ts`, mapped from the backend's
`input.reference_image_artifacts`. The per-run details endpoint does not carry
it.

So: a new helper looks the workflow up by id in the user's workflow list and
returns its `reference_image_urls`. The page feeds those URLs into the existing
Inspiration Image section of `LeftPanel` through a new
`restoredReferenceImageUrls` value, which is merged with the locally uploaded
previews (locally uploaded wins when both exist, since those are the live
session's own files).

Failure behaviour: if the lookup fails, throws, or the run is not in the list,
the value stays empty and the panel renders exactly as it does today. The
restore itself never fails because of this: the lookup is fired separately from
the GLB restore and its result is additive.

Known limit: the list endpoint is paginated, so only reasonably recent runs are
found. If that proves too narrow, the fix is a backend field on the per-run
details endpoint, not more client paging.

## Testing

Vitest, colocated with the components:

- `CadResultActions.test.tsx`
  - renders the download alone when no versions are passed
  - renders both controls when a latest version label is passed
  - both controls carry the same size class, so siblings stay equal
  - renders nothing while generating or while the model is loading
- `LeftPanel` versions
  - no VERSIONS section when versions is undefined or empty
  - one tile per version, LATEST badge on the newest only
- restore
  - inspiration URLs from the looked-up workflow reach the panel
  - a failed lookup leaves the restore successful and the panel empty

Existing tests that must stay green: `src/lib/posthog-events.test.ts`,
`src/hooks/useCadRestoreFromUrl.test.tsx`, `src/lib/cad-result-api.test.ts`.

## Risks

- Moving the download changes muscle memory for existing users. Mitigated by
  the new position being both larger and where the eye already is when a result
  appears.
- The bottom of the viewport is crowded (gem toggle, Ready dot). Placement must
  be checked at narrow panel widths and in fullscreen.
- The versions shape here is a guess at what the backend will send. It is
  internal and unexported beyond these components, so renaming it later is a
  local change.
