# Catalog from CAD (CAD to Pictures in FormaNova): design

Date: 2026-10-29. Branch `feat/cad-to-catalog` (from `main` 5968fb71).
Backend: the FormaNova CAD to Catalog toolkit (RareSense/cad-to-pictures-fof, branch
`feat/cad-to-catalog`, `formanova_cad_to_catalog/`), called through GraphFlow workflows.

## Goal

The CAD to Pictures experience that testers found intuitive, inside FormaNova, in
FormaNova's look, plus bulk: drop many CAD files, set angles / metals / background once,
and watch every piece get shot. Nothing happens out of sight: each piece is opened in the
3D view while it is shot and every picture appears as it is made.

## Out of scope (separate work)

The dashboard rework (rooms Design / CAD / Photography, paused by the user), custom metals,
Design / Redesign pages. Until the dashboard work, the page is reached at `/cad-to-catalog`
by allowlisted users.

## Hard rules (repo)

- `CADCanvas.tsx`, `cad-studio/materials.ts`, `GemInstanceRenderer.ts` are protected: not touched,
  not imported. The page has its own viewer (ported from the tool).
- Minimal blast radius: new files under `src/components/cad-to-catalog/`, `src/lib/cad-to-catalog-*`,
  `src/hooks/useCatalog*`; edits to existing files limited to: route in `App.tsx`, flag in
  `feature-flags.ts`, `TOOL_COSTS` key, `workflow-classifier.ts` rule, `posthog-events.ts`
  functions (TDD per CLAUDE.md), Header `activePaths`.
- AI_RULES: `authenticatedFetch` for every call; workflow = start / status / result, shared
  `pollWorkflow`, parser, timeout, cancel on unmount; files < 500 lines; API / polling / parsing /
  rendering separate; tests for API, polling, parsers; a local error boundary around WebGL.
- UI rules from CLAUDE.md: lucide `Diamond` icon on the upload areas, equal gaps in picture grids,
  side-by-side buttons the same size, no `cursor-pointer` on buttons, mobile-first, every viewport.
- three stays at the repo's 0.160 (no upgrade). Anything in the tool that needs newer three is
  adapted in the port.

## Page

Route `/cad-to-catalog`, `<ProtectedRoute>` + allowlist flag `VITE_CAD_TO_CATALOG_ALLOWLIST_EMAILS`
(`isCadToCatalogEnabled(email)`); not allowlisted -> redirect to `/dashboard`.
Layout: `CadWorkspaceLayout` (left panel / 3D view / right panel, its responsive behaviour).

```
┌ PIECES ─────────────┬──────────── 3D VIEW ────────────┬ PARTS ─────────┐
│ + Add CAD files     │                                  │ Metal ▸ band…  │
│ ▣ ENG-172  ✓ 12/12  │      (the piece, live, orbit)     │ Stones ▸ ×14   │
│ ▣ ENG-181  ◐ 5/12   │                                  │ MATERIALS      │
│ ▢ SOL-204  waiting  │  [undo][redo][zoom][fit][light]  │ ◉◉◉◉ metals    │
├─────────────────────┤                                  │ ◉◉◉◉ stones    │
│ 1 TYPE   Rings ▾    │                                  │ Polish ──●──   │
│ 2 ANGLES ▦▦▦▦▦      │                                  │                │
│ 3 METALS ☑Y ☑W ☐R   ├──────────────────────────────────┴────────────────┤
│ 4 BACKGROUND ▦▦▦    │ PICTURES  ▦ ▦ ▦ ◐ ◐ ▢ ▢   (fill in live as made)  │
│ 5 SIZE 1:1 ▾        │                                                    │
│ [ SHOOT ALL (3) ]   │                                                    │
└─────────────────────┴────────────────────────────────────────────────────┘
```

- One piece: drop a CAD file (.3dm, .glb/.gltf, .step/.stp, .stl, .obj, .ply), it opens in the
  view as in the tool (Rhino layers, colours, hidden layers, blocks; stones as refractive gems).
  Steps 1-5, Shoot; each picture appears in the strip as it is drawn.
- Bulk: Pieces takes many files or a folder. Each row: thumbnail, name, type guessed from the
  name (changeable), status (waiting / opening / shooting n/m / placing / done / failed).
  Steps 1-5 apply to all. Any piece can be opened to check it or change parts/materials before
  shooting; its own changes are kept for it. Shoot all opens each piece in turn in the view
  (the user watches) and fills its pictures in. Pause / Stop at any time; failed pieces are marked
  with the reason and a Retry. Download all = one zip, a folder per piece.
- White / transparent pictures are drawn in the browser (no server, no cost, no upload of the
  CAD file). A picture on a photo background: the transparent render + background go to the
  `cad_to_catalog_place_v1` workflow; its tile shows "Placing…" until the photo arrives; it is a
  normal run (Generations lists it).
- Angles: per jewellery type; defaults = the tool's tuned angles (shipped in code), "Save as
  default" keeps a user's own per type in localStorage; per-run edits as in the tool.
- Backgrounds: the tool's photos shipped as WebP in `public/cad-to-catalog/backgrounds/`, plus
  the user's own (kept for the session; sent with each placement).
- Heavy .3dm (> 10 MB): opened through `cad_to_catalog_fastload_v1` (skeleton + exact meshes),
  as the tool does. Surfaces saved without render meshes: listed as dashed parts that cannot be
  shown (as the tool), with "Mesh in Rhino" via `cad_to_catalog_rhino_mesh_v1` only when that
  workflow reports available.

## Code

```
src/components/cad-to-catalog/
  engine/            port of cad-to-pictures web/js (TS, each < 500 lines)
    scene.ts         renderer, camera, controls, light, look (tone curve, AO, backdrop), resize
    formats.ts       loaders (.3dm via Rhino3dmLoader + Rhino attributes, GLB, STEP/OCCT, STL/OBJ/PLY), fastload unpack
    parts.ts         parts, groups, metal/stone classification, split by connectivity
    materials.ts     metal + gem presets (the tool's reference look), applyChoice
    gems.ts          refraction gem material (BVH)
    angles.ts        angle math (apply/current/fit), category guess
    capture.ts       picture capture (frame, white/transparent, shadow)
    engine.ts        CatalogEngine class: open(file), parts, setMaterial, applyAngle, capture, dispose
  CatalogViewer.tsx  canvas host + CADRuntimeErrorBoundary-style local boundary
  PiecesPanel.tsx, ShootSteps.tsx, PartsPanel.tsx, PicturesStrip.tsx
src/pages/CADToCatalog.tsx      page (the name CLAUDE.md reserves for CAD-to-Catalog): composes the above, < 300 lines
src/lib/cad-to-catalog-api.ts   workflow names, body builders, result/failure parsers
src/lib/cad-to-catalog-run.ts   start + pollWorkflow + error mapping (as design-image-run.ts)
src/lib/cad-to-catalog-queue.ts pure reducer: pieces, jobs, statuses, pause/stop/retry
src/lib/cad-to-catalog-angles.ts defaults + localStorage store
src/hooks/useCatalogShoot.ts    drives the queue against the engine + placements; abort on unmount
src/lib/cad-to-catalog-zip.ts   Download all (jszip, folder per piece)
```

## Workflows (GraphFlow, one node each, registered by a script in the toolkit repo)

| Workflow | Node | Payload | Result read |
|---|---|---|---|
| `cad_to_catalog_place_v1` | `formanova_cad_to_catalog_place_in_scene` | `render_image` (data: URL), `background_image` (data: URL or artifact), `materials`, `aspect`, `model: "gpt"` | `image` artifact |
| `cad_to_catalog_fastload_v1` | `formanova_cad_to_catalog_cad_fastload` | `cad_file` (artifact from `/upload`) | `skeleton_3dm`, `meshes`, `triangles` |
| `cad_to_catalog_rhino_mesh_v1` | `formanova_cad_to_catalog_rhino_mesh` | `cad_file` | `cad_file`, `meshed_count` |

Toolkit change: a file field also accepts a plain string (data: URL, azure:// or https://), the
shape GraphFlow passes on after storing a data: URL.

## Credits, analytics, history

- `TOOL_COSTS['cad_to_catalog_place_v1']` with a placeholder (price decided later; backend
  billing policy is the real source). The shared credit preflight runs before Shoot for the number
  of placements; insufficient credits -> the existing modal; credits refresh after.
- `workflow-classifier.ts`: `cad_to_catalog_*` -> "Catalog from CAD" (checked before the generic
  CAD/render rules).
- PostHog: `trackCatalogShootStarted`, `trackCatalogShootCompleted`, `trackDownloadClicked`
  (context `catalog`), `trackPaywallHit` on a failed credit gate (TDD per CLAUDE.md).

## Errors

- A file that cannot open: its row says why (same words as the tool); the queue moves on.
- WebGL context lost: the viewer's boundary shows "Reload the view", the queue pauses.
- Placement failed: tile shows the `user_message`, Retry on the tile.
- Workflows down (`CAD_SERVICE_DOWN`): photo backgrounds disabled with a note; white pictures
  still work.

## Testing

- vitest: api builders/parsers, run (mocked `authenticatedFetch` + poller), queue reducer,
  angles store, zip naming, posthog events, classifier rule, feature flag.
- `npm run typecheck`, `npx vitest run`, `npm run build`; existing suites stay green.
- Engine: the port is checked against the tool by opening the same FoF files and comparing
  pictures (same angle, same metal) side by side, in a real browser.
- Page checked in a browser through the local no-login preview (not committed).
