# CAD Studio "My Rings" / "My Prompts" Library Panel — Implementation Plan

**Status:** Approved design direction, ready to implement. Not started.
**Origin:** `/design-shotgun` session, saved at
`~/.gstack/projects/uswii-formanova/designs/cad-studio-library-panel-20260818/`
(`approved.json`, `variant-A.png`, `variant-F.png` for reference).

---

## What this replaces

`docs/CAD_UI_CONTINUATION.md`'s "Product Vault decision" said: *"Full
persistence is not implementable safely from the current frontend contract...
Coordinate the backend contract first."* That was correct when written. It
is no longer the constraint — see "What changed" below. This doc supersedes
that section for the specific scope here (input reuse, not the full
Generated CAD Product Vault, which is still a separate, larger effort).

## What changed (verified today, not assumed)

1. **Backend now resolves `source_type` server-side for CAD.**
   `temporal-agentic-pipeline` PR #52 (`f54c8f2`, merged to `main` today)
   added `_resolve_cad_source_type()` in `src/api/_workflow_helpers.py`.
   `GET /history/workflows/me` and `GET /result/{workflow_id}` now both
   return a correctly-resolved `source_type: "text_to_cad" | "image_to_cad" | "unknown"`
   for `ring_cad_nurbs_v1`, computed from the *actual stored*
   `reference_image_artifacts` list — not a client-declared count.
   **Action before relying on this:** confirm it's deployed to whatever API
   `VITE_PIPELINE_API_URL` points at (staging/prod), not just merged to the
   backend repo's `main`. A merge doesn't imply deployment.

2. **The data this feature needs is already in the existing list response,
   unused.** `GET /history/workflows/me`'s `input` field
   (`src/api/routes_history.py:93`, `await denormalise_payload(w.input_payload)`)
   already carries, per past CAD workflow:
   - `reference_image_artifacts`: `[{ type: string, uri: string }]` — the
     actual uploaded reference images (confirmed shape from
     `tests/unit/test_workflow_helpers.py`).
   - `user_description`: the text prompt (used by `_resolve_cad_source_type`
     itself to detect text-to-CAD).

   The frontend already fetches this response (`listMyWorkflows()`,
   `src/lib/generation-history-api.ts:104-173`) but only reads
   `input.reference_image_count` (a number) to classify source type, then
   discards the rest. **Bug worth fixing in the same pass:** the existing
   fallback at `generation-history-api.ts:134`
   (`Array.isArray(w.input?.reference_images)`) checks the wrong field name —
   the real field is `reference_image_artifacts`, not `reference_images`.
   That fallback branch has never matched real data.

3. **No new backend endpoint is needed for the input-reuse library.** Both
   "My Rings" (image thumbnails) and "My Prompts" (text snippets) can be
   built entirely from data already in `listMyWorkflows()`'s response, once
   the frontend stops discarding it.

## What's still an open question, not a blocker

Whether `ring_cad_nurbs_v1`'s image-to-CAD output node has
`produces_user_asset: true` set (per
`docs/superpowers/specs/2026-04-15-unified-asset-vault-design.md`, marked
"upcoming" for image-to-CAD as of that spec). This only affects a *future*
Generated CAD Product Vault (past **outputs**), not this plan (past
**inputs** users can reuse to start a new generation). Confirm with backend
before scoping that separate effort; not needed here.

---

## Approved design direction

**Text-to-CAD** (`src/pages/TextToCAD.tsx`, `src/components/text-to-cad/InitialPromptScreen.tsx`):
2-column layout. Left column unchanged (prompt textarea, Generate button).
Right column: **"My Prompts"** — full history of past prompt briefs,
searchable, paginated, each card showing the prompt text (truncated), a
small result thumbnail, and a relative timestamp. Clicking a card populates
the prompt textarea (does not auto-submit).

**Image-to-CAD** (`src/pages/ImageToCAD.tsx`, `src/components/text-to-cad/ImagePromptScreen.tsx`,
`src/components/text-to-cad/ReferenceImageUploader.tsx`): 2-column layout.
Left column: **today's already-shipped equal-size reference-image grid,
unchanged** — do not regress the fix in `ReferenceImageUploader.tsx` that
made the primary and secondary reference tiles the same size. Right column:
**"My Rings"** — full history of past uploaded reference images, searchable,
paginated, mirroring Photo Studio's `StudioVaultUploadStep.tsx` /
`VaultProductCards.tsx` pattern (rename this doc's "My Designs" language to
"My Rings" throughout — matches Photo Studio's per-category naming, e.g.
"My Necklaces"). Clicking a card adds that image as a reference (respecting
the existing 5-image cap).

**Progressive disclosure** (both screens, matches Photo Studio's Upload
Guide vs. My Products pattern): a user with no prompt/upload history sees
the existing "Try an example" section unchanged. Once they have history,
"Try an example" is replaced by "My Prompts" / "My Rings". Do not show both
at once — that's visual noise for both audiences.

**Mobile**: library collapses to a horizontally-scrollable strip beneath the
existing content, not a second column (confirmed via variant-G in the
design session — Photo Studio's 3-column grid doesn't fit CAD Studio's
narrower centered layout on small viewports).

---

## Implementation sketch

### 1. Stop discarding data the backend already sends

`src/lib/generation-history-api.ts`:
- Add `reference_image_artifacts` and `user_description` (renamed
  something like `prompt`) to `WorkflowSummary`, populated in
  `listMyWorkflows()`'s `mapped` object instead of only deriving a count.
- Resolve each artifact's `uri` (`azure://...`) through the existing
  `azureUriToUrl()` (`src/lib/azure-utils.ts`) — same pattern already used
  for GLB/3DM URLs, do not invent a second resolution path.
- Fix the dead fallback (`reference_images` → `reference_image_artifacts`)
  while touching this code, per AI_RULES.md minimal-blast-radius — it's a
  one-line fix directly adjacent to what's already being changed.
- Once confirmed deployed, prefer the backend's `source_type` directly and
  simplify/retire `resolveSourceType()`'s CAD-guessing branch — but only
  after confirming deployment (see "What changed" #1). Don't do this
  speculatively; a premature switch would silently break classification if
  staging/prod haven't picked up the backend change yet.

### 2. New shared library components (mirrors the Photo Studio split)

Following the existing concern-boundary pattern (`StudioVaultUploadStep.tsx`
composing `VaultProductCards.tsx`, per that file's own docstring citing
AI_RULES.md #8): add `src/components/text-to-cad/CadHistoryLibrary.tsx`
(presentational: search box, pagination, grid/list rendering) plus a data
hook `src/hooks/useCadHistoryLibrary.ts` (owns fetching/filtering
`listMyWorkflows()` results by `source_type`, search-term matching, and
pagination state) — do not fetch data inside the presentational component,
matching this repo's established pattern.

Two render modes within the same component (`variant: 'prompts' | 'images'`
prop), since the two screens need different card content but identical
shell (search/pagination/empty-state/progressive-disclosure logic) — not
two separate components, to avoid the exact kind of drift the "keep in sync
in three places" warnings elsewhere in this codebase's CLAUDE.md exist to
prevent.

### 3. Wire into both screens

- `ImagePromptScreen.tsx` / `InitialPromptScreen.tsx`: add the right column,
  gated on `effortModeEnabled`-style feature flag if this ships gradually
  (see AI_RULES.md #7 — new feature flags need an owner, reason, and removal
  condition; don't add one if this ships to everyone at once).
- Both screens already know `user?.email`/auth context for scoping — the
  library only needs `listMyWorkflows()` filtered client-side by
  `source_type === 'text_to_cad' | 'image_to_cad'`, no new auth wiring.

### 4. Tests (AI_RULES.md #10 — result parsing changes require tests)

- `generation-history-api.test.ts`: assert `reference_image_artifacts` and
  the prompt field are correctly extracted and URL-resolved from a raw
  `listMyWorkflows()` response fixture; assert the `reference_images` →
  `reference_image_artifacts` fallback fix.
- New test for `CadHistoryLibrary`: empty state shows "Try an example",
  populated state shows the library, search filters correctly, clicking a
  card fires the right callback (populate prompt / add reference image).

---

## Explicitly not in this pass

- The Generated CAD Product Vault (past **outputs**, browsing/reusing
  finished designs) — separate effort, depends on confirming the
  `produces_user_asset` flag question above.
- Any change to `CADCanvas.tsx` or `GemInstanceRenderer.ts` (protected,
  unrelated to this feature).
- Backend changes — this plan is written to need none. If deployment
  confirmation (step 1 above) reveals the source_type resolver isn't live
  yet, that's a "wait" not a "build," and doesn't block starting on the
  library UI itself (it can ship against the existing client-side
  `resolveSourceType()` fallback and switch over later, zero rework needed
  in the library components themselves).
