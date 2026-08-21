# CAD Download Consistency - Design

Date: 2026-08-21
Status: Approved, implementing

## Problem

Four separate defects make CAD downloads unpredictable. Which file you get, and
whether you can get it at all, depends on which screen you happen to be on.

### 1. The studio GLB is not the backend's file

`TextToCAD.tsx:247` and `ImageToCAD.tsx` download the GLB by calling
`canvasRef.current.exportSceneBlob()`, a three.js re-encode of the live scene.
The backend GLB is only used as a fallback when there is no canvas.

GLTFExporter rewrites materials and scene structure, so the downloaded file
renders differently from what the user saw. History, by contrast, downloads the
raw backend GLB. Same button label, two different files.

### 2. "Export GLB" shows where "Download 3DM" belongs

The studio label is `workflow.threedmArtifact ? "Download 3DM" : "Export GLB"`.
When a run is opened from history, `?glb=` renders the model immediately while
`threedmArtifact` only arrives later from `fetchCadResult`. The toolbar shows
the wrong action during that gap, and permanently when `threedm_url` is absent.

### 3. Each screen offers a different subset

| Screen | 3DM | GLB |
|---|---|---|
| CAD studio viewport | yes, or GLB, never both | only as the alternative |
| History card (`WorkflowCard`) | yes, gated on `supportsThreedm` | no |
| Snapshot popup (`SnapshotPreviewModal`) | no | yes, but unreachable from CAD |

### 4. The history buttons are invisible in dark mode

They are `variant="outline"` with `border-border bg-transparent`. In dark mode
that is a `0 0% 20%` border on a `0 0% 5%` card. The button shape effectively
disappears. Downloading the deliverable is the primary action on that card, so
this also violates the Dominant CTAs rule in CLAUDE.md.

## Format constraint driving the design

`.3dm` is NURBS, built server-side. The browser never holds the NURBS data, only
a tessellated triangle mesh, and a mesh cannot be turned back into clean NURBS
client-side. So viewport edits can never be written into a `.3dm`.

`.glb` is a triangle mesh, which is exactly what the viewport holds, so edits can
be exported there. This asymmetry is a format constraint, not a design choice,
and it is why the two files must be presented as distinct things rather than as
two encodings of the same thing.

## Decisions

**Downloads return the backend's bytes unmodified.** Both `.3dm` and `.glb` are
fetched and written exactly as the backend returned them. No re-encoding, no
truncation.

**Edited exports remain possible, but are never the default.** Editing is live
(`useCADMeshEditor`, wired at `TextToCAD.tsx:92`; the `CAD_EDIT_TOOLS_ENABLED`
flag that CLAUDE.md describes does not exist in `feature-flags.ts`). Removing
the edited export would take away the only way an edit leaves the app. So it
becomes a third, explicitly labelled menu item that appears only when
`undoStack.length > 0`.

**One split button everywhere.** `Download 3DM` is the default action, since the
machinable NURBS file is the deliverable people actually came for. A small
chevron opens the alternatives. The same component on both screens, so the
answer to "how do I get my file" stops depending on where the user clicked.

Both files the backend produces are reachable; the chevron decides which is
one click and which is two, not which exists.

```
  DOWNLOAD 3DM            [v]
     |
     +-- Download 3DM                 machinable, as generated
     +-- Download GLB                 3D preview, as generated
     +-- Export GLB with my edits     only when edits exist
```

**The snapshot popup is out of scope because it is unreachable from CAD.** The
CAD card renders an interactive 3D preview (`GLBPreviewSlot`,
`WorkflowCard.tsx:208`), not angle thumbnails. `setPreviewIndex` is only ever
called as `setPreviewIndex(null)` on close, so `previewIndex !== null` is never
true and `SnapshotPreviewModal` never opens from a CAD card. Its GLB button is
dead code on this path. Left alone rather than instrumented or restyled; worth a
separate cleanup.

## Structure

`cad-artifact-download.ts` currently lives in `src/components/generations/`. The
CAD pages need it too, and a CAD page importing from `generations/` would cross a
module boundary. It moves to `src/lib/cad-artifact-download.ts`, per the
CLAUDE.md rule that shared utilities live in `src/lib/`.

The split button goes in `src/components/downloads/CadDownloadMenu.tsx`, a
neutral location. It cannot live under `components/cad*` because the generations
feature is not a CAD feature and must not import from those folders.

`CADCanvas.tsx` is protected and is not modified. `exportSceneBlob` already
exists on its handle; the change is only that it stops being the default path.

## Files

| File | Change |
|---|---|
| `src/lib/cad-artifact-download.ts` | Moved from `components/generations/`, imports updated |
| `src/components/downloads/CadDownloadMenu.tsx` | New split button |
| `src/pages/TextToCAD.tsx`, `src/pages/ImageToCAD.tsx` | Use the menu; GLB becomes the raw backend file; edited export gated on `undoStack.length` |
| `src/components/generations/WorkflowCard.tsx` | Use the menu, gains GLB, solid button style |
| `src/components/cad/ViewportToolbar.tsx` | Accepts the menu in place of a single button |

## Testing

- `CadDownloadMenu`: renders 3DM as the default action, lists GLB in the menu,
  shows the edited item only when edits exist, and calls the right handler per
  item
- Raw-bytes guarantee: the GLB path fetches the backend URL and never calls
  `exportSceneBlob` when there are no edits
- The late-`threedmArtifact` case: label is correct once the artifact arrives
- Existing `WorkflowCard.test.tsx` cases stay green

## Out of scope

`.3dm` upload. It needs a rhino3dm WASM loader plus NURBS tessellation, since
browsers cannot render `.3dm` at all. Parked deliberately; see the conversation
of 2026-08-21.

## Implementation notes

**Integrity is checked against the hash in the URL.** The backend serves
artifacts at `/api/artifacts/<sha256>` and the response's `sha256` field is the
same value, so the URL alone says what the bytes should hash to. This matters
because `useImageToCADWorkflow` reconstructs artifacts with `bytes: 0` and
`sha256: ''` hardcoded (lines 139, 141, 195, 217), discarding what
`parseRingCadResult` correctly parsed. Deriving the hash from the URL needs no
plumbing change. It matters most for `.3dm`, which carries no internal length
field, so a truncated one is otherwise indistinguishable from a good file and
only fails later, in Rhino.

**The history card download is now solid, not outlined.** The previous style was
deliberate, with a test asserting it: two filled blocks under the ring preview
compete for attention. That concern is real, so only the download was promoted
and Open in Studio stays outlined. The reason for changing it is that
`border-border` on `card` in dark mode is a 20%-lightness border on a
5%-lightness surface, which is effectively invisible. The test now asserts the
new split and carries the updated rationale.

**Shared logic went into a hook, not into the pages.** `useCadArtifactDownloads`
holds the download actions both workspaces need. Inlining them would have
duplicated roughly sixty lines twice and pushed both pages further past the
file-size guidance in AI_RULES section 8.

**The "Export GLB" label bug is fixed by construction.** The label was
`threedmArtifact ? "Download 3DM" : "Export GLB"`, so a late-arriving artifact
showed the wrong action. The menu now derives its default from which artifacts
exist, and the GLB is a real backend download rather than a fallback, so there
is no longer a wrong state to show.

**Removed along the way:** the pages' hand-rolled `showSaveFilePicker` blocks,
which carried four of the nine pre-existing ESLint errors on those files.

## Verification

- `npx vitest run`: 703 passed, 74 files, 0 failed
- `npx tsc --noEmit`: clean
- `npm run build`: built in 1m 28s
- ESLint on touched files: 5 errors, all pre-existing, down from 9. New files
  are clean.
