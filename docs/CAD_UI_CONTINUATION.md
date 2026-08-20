# CAD UI continuation handoff — 2026-08-18

This is the source of truth for another coding agent continuing the current CAD UI pass. Read `AI_RULES.md` and `src/components/text-to-cad/CLAUDE.md` before changing code.

## Claude Code team launch

Project-local Claude settings enable experimental agent teams. Restart Claude Code after pulling this workspace state, then give the lead this prompt:

```text
Read docs/CAD_UI_CONTINUATION.md, AI_RULES.md, and every scoped CLAUDE.md before acting. Create an agent team with three read-only teammates: (1) History UI/accessibility reviewer, (2) 3DM artifact-contract verifier, and (3) regression/test verifier. Partition files so teammates do not edit shared files. Have them report evidence and exact minimal fixes to you. You are the only implementation owner: apply only verified minimal fixes, wait for all teammates, run the handoff test matrix, inspect git diff, and do not stage unrelated artifacts or modify protected CAD files. Do not commit or push until the human approves the final diff.
```

In the VS Code terminal, use `Shift+Down` to cycle through the in-process teammates and `Ctrl+T` to view their shared task list. `claude agents` opens Claude's separate agent-view dashboard. These are Claude sessions; they cannot attach to or control Codex's live agents.

## Safety boundaries

- Do not modify `src/components/text-to-cad/CADCanvas.tsx` or `GemInstanceRenderer.ts`.
- The light/material complaint is Generation History only: `ScissorGLBGrid.tsx` and its small helper modules.
- Keep History limited to completed generations. `isVisibleGeneration()` is the single status filter.
- Do not add polling to pages. Existing generation tracking belongs to `GenerationsContext` and the workflow hook.
- All authenticated `/api` requests must use `authenticatedFetch`.
- Never infer an artifact type from a filename or array position. GLB and 3DM URLs remain separately typed.
- Do not stage unrelated files under `artifacts/`; they predate this pass and belong to the user.

## Already committed and pushed

Commit `cfa271f1` on `feat/image-to-cad-v2` contains the first History/progress pass: compact CAD progress/email UI, History renderer material fallback and registration-race fix, public workflow labels, completed-only History filtering, and base CAD card refinements.

## Current uncommitted implementation

- `src/pages/DevCadGeneration.tsx` and test: development-only preview of the real CAD generating/loading/failure UI. It submits no workflow and spends no credits.
- `src/App.tsx`: exposes `/dev/cad-generation` only when `import.meta.env.DEV` is true and renders it above all auth, credit, generation, analytics, and router providers so the demo makes no backend calls.
- `LeftPanel.tsx`, `TextToCAD.tsx`, `ImageToCAD.tsx`: removes the post-generation **Upload Ring Part** action from both workspaces. The separately gated initial **upload a CAD file** entry point remains intentionally unchanged.
- `WorkflowCard.tsx` and test:
  - one extension-free design name;
  - a separate outlined **Manufacturing file / Native Rhino 3DM** area;
  - **Download 3DM** is the conspicuous primary deliverable;
  - **Open in Studio** is secondary;
  - **Export GLB** is removed from History;
  - actual credits are labeled `N credits used`.
- `cad-artifact-download.ts` and test:
  - selects only `threedm_url` for a 3DM request;
  - validates the Rhino header before saving;
  - refreshes the result with a 5-second bound and falls back only to the cached 3DM URL;
  - sends auth only to same-origin API/artifact routes.
- `generation-history-api.ts`, `Generations.tsx`, and tests: normalizes the backend credit-audit array/object variants, preserves a legitimate zero, and bounds/retries audit reads.
- `ScissorGLBGrid.tsx`: History-only tone-mapping exposure reduced from `0.8` to `0.65`.

## Required verification before commit

Run:

```powershell
npx vitest run src/pages/DevCadGeneration.test.tsx src/components/generations/WorkflowCard.test.tsx src/components/generations/cad-artifact-download.test.ts src/lib/generation-history-api.test.ts src/components/generations/ScissorGLBGrid.test.ts src/components/generations/scissor-glb-materials.test.ts src/components/generations/scissor-glb-registration.test.ts
npx tsc --noEmit
npm run build
git diff --check
```

Manually verify local development:

- `/dev/cad-generation` shows the real active, loading, failure, email edit, retry, and Keep Creating states.
- The route is absent from a production build.
- Completed CAD History cards show the 3DM deliverable and Open in Studio, never Export GLB.
- Downloaded `.3dm` bytes begin with a valid 32-byte Rhino header and use the edited design name.
- Failed/running generations do not render in History.
- Text to CAD and Image to CAD workspaces do not show Upload Ring Part.

## Backend contract response still to send

- Keep `model_fix` and `product_fix` distinct; do not collapse them into their base families.
- Map legacy `cad_render_v1` to `cad_render`.
- Rename only `cad_text`/`cad_sketch` aliases to `text_to_cad`/`image_to_cad`; retain `cad_render` as a distinct source type.
- Backfill all 12 existing `ring_cad_nurbs_v1` executions, including failed records for audit/admin consistency.

## Product Vault decision

The requested first-time rule is clear: do not show CAD Vault/Library until the user has uploaded a CAD or completed a text/image-to-CAD prompt, matching the Photoshoot empty-state logic. Full persistence is not implementable safely from the current frontend contract: `generated_cad` exists, but persistent uploaded CAD input (`cad_input`) and canonical eligibility fields are not exposed. Do not invent local-only eligibility as if it were a durable vault. Coordinate the backend contract first, then add a single shared eligibility helper and tests.

## Minimal-blast-radius commit rule

Stage only the named `src/` files, their tests, and this handoff. Do not stage the modified `artifacts/staging-cad-audit-2026-08-17/BACKEND-HANDOFF.md` or any untracked screenshots/audit folders unless the user explicitly requests those artifacts.
