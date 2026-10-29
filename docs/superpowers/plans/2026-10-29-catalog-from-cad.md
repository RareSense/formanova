# Catalog from CAD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The CAD to Pictures page inside FormaNova at `/cad-to-catalog`, with bulk, backed by the CAD to Catalog toolkit through GraphFlow workflows.

**Architecture:** A self-contained viewer engine (TypeScript port of cad-to-pictures `web/js`) behind a small class API; React panels around it in `CadWorkspaceLayout`; a pure queue reducer driven by one hook; workflows started and polled exactly like `design-image-run.ts`.

**Tech Stack:** React 18, TS (loose), three 0.160 (+ three/examples Rhino3dmLoader, GLTF/STL/OBJ/PLY loaders, EffectComposer, GTAOPass), three-mesh-bvh (already in deps through drei), jszip, vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-29-catalog-from-cad-design.md`.
- Never touch `CADCanvas.tsx`, `cad-studio/materials.ts`, `GemInstanceRenderer.ts`; never import from `text-to-cad/` or `cad-studio/`.
- Every new file < 500 lines; API / polling / parsing / rendering separate.
- `authenticatedFetch` for every backend call; workflows via `/api/run/state/<name>`, `pollWorkflow`.
- three stays 0.160; no new npm dependency unless unavoidable (then say so).
- `npm run typecheck`, `npx vitest run`, `npm run build` green before every commit that touches src.
- Toolkit: `python -m pytest formanova_cad_to_catalog/tests -q` green.

## Stage A: toolkit (RareSense/cad-to-pictures-fof, feat/cad-to-catalog)

- [ ] A1 `FileIn` accepts a plain string (data: URL, azure://, https://); tests.
- [ ] A2 `save_pictures` tool: in `piece`, `category?`, `pictures[{name, angle?, metal?, image}]` (<= 64);
      out `images[{name, angle, metal, file}]`; PNG/JPEG/WebP only; tests; tools.yaml regenerated.
- [ ] A3 `graphflow/workflows.py`: the four one-node v2 specs + `register` CLI (POST /spec-v2/register,
      activate), dry-run prints JSON; README section. Push.

## Stage B: engine port (src/components/cad-to-catalog/engine/)

- [ ] B1 `formats.ts` + `package.ts`: open .3dm (Rhino3dmLoader, Rhino attributes: visibility, layer
      colours, blocks), GLB/GLTF, STL, OBJ, PLY, STEP (occt-import-js from CDN); fastload unpack + swap
      (pure, unit-tested with a packed fixture made by fastload.py).
- [ ] B2 `parts.ts`, `materials.ts`, `gems.ts`: parts/groups/classify, metal + gem presets of the
      tool's reference look, refraction gem material.
- [ ] B3 `scene.ts`, `capture.ts`, `angles.ts`, `engine.ts`: renderer + look (custom tone curve, GTAO,
      backdrop), camera/controls, fit, apply angle, capture white/transparent; `CatalogEngine` API.
- [ ] B4 `CatalogViewer.tsx` + a dev-only route check: the same FoF files open and shoot like the tool
      (side-by-side pictures).

## Stage C: page

- [ ] C1 `cad-to-catalog-api.ts`/`-run.ts` (place, save, fastload, rhino_mesh) + tests.
- [ ] C2 `cad-to-catalog-queue.ts` reducer + tests; `cad-to-catalog-angles.ts` + tests; `-zip.ts` + tests.
- [ ] C3 `useCatalogShoot.ts`; panels `PiecesPanel`, `ShootSteps`, `PartsPanel`, `PicturesStrip`;
      page `CADToCatalog.tsx`; route + flag; backgrounds as WebP in `public/cad-to-catalog/backgrounds/`.
- [ ] C4 classifier rule, `TOOL_COSTS` key, credit preflight, PostHog events (TDD), Header activePaths.
- [ ] C5 browser check (no-login preview, not committed); typecheck, vitest, build; push branch.
