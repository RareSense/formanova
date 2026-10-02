# CAD prompt screens: jewelry-type cards and one Download menu

Date: 2026-10-03
Branch: `feat/cad-type-cards-download-menu` (from `feature/jewelry-cad-workflows` at a0586b7d)

## Goal

Make Text to CAD and Image to CAD simpler and clearer, with minimal blast radius
and no regressions:

1. Remove the admin-only model picker.
2. Remove the material dropdown.
3. Replace the jewelry-type dropdown with square, selectable cards shown as Step 1.
4. Make the wording follow the chosen piece.
5. Turn the split Download button into one Download button that opens a format list.

Out of scope: backend, ring examples, My Rings / history panels, download
functions themselves, any page outside the CAD prompt screens and the shared
download control.

## 1. Model picker removed

- `TextToCAD.tsx` and `ImageToCAD.tsx` always use `RING_CAD_DEFAULT_TIER`
  (GPT-6 Astra via OpenAI direct, already the customer default).
- Remove the `modelPick` state, the admin branch, and the `modelPicker` prop on
  `InitialPromptScreen` and `ImagePromptScreen`.
- Delete `CadModelPicker.tsx` and `CadModelPicker.test.tsx` once unused.
- `useIsAdmin` and `cad-model-picker.ts` stay if anything else still imports
  them; `cad-model-picker.ts` is deleted only if nothing imports it.

## 2. Material dropdown removed

- Remove the `material` state in both pages and the `material` / `setMaterial`
  props on both prompt screens.
- Runs then pass no material. `ring-cad-nurbs-api.ts` already omits `material`
  from the payload when it is `null`, so the request is identical to today's
  "no material picked" request.
- Delete `CadMaterialSelect.tsx` once unused. `CadMaterialProfile` and the
  workflow hook's optional `material` parameter stay untouched.

## 3. Jewelry-type cards

New component `src/components/text-to-cad/CadJewelryTypeCards.tsx`, replacing
`CadJewelryTypeSelect.tsx` (deleted once unused).

- Built from `CAD_JEWELRY_TYPES`. Order: Ring, Necklace, Bracelet, Earring,
  Other. Default stays `DEFAULT_CAD_JEWELRY_TYPE` (`ring`).
- Photo cards: square, photo fills the card (`object-cover`, centred), label
  below in the same uppercase mono style the dropdown used.
- Images: the user's four renders (black metal, mint stones, grey background),
  converted to WebP at about 480 px square in
  `src/assets/cad-jewelry-types/{ring,necklace,bracelet,earring}.webp`.
  The bracelet source is 4:3 and is centre-cropped to square.
- Other card: same size, a plain muted background close to the photos' grey,
  a small lucide `Sparkles` line icon, label OTHER, subtext
  "Brooches, tiaras, watches & more".
- Selected: border in the app's gold accent (`formanova-hero-accent`) plus a
  small check badge in the top-right corner. Unselected: normal `border-border`,
  darkening on hover. No scale, bounce, glow or gradient.
- Semantics: a radio group (`role="radiogroup"`, `aria-label="Jewelry type"`,
  each card `role="radio"` with `aria-checked`), roving tabindex, arrow keys move
  the selection. All cards are disabled while generating.
- Layout: `grid grid-cols-3 sm:grid-cols-5 gap-3`, every card the same size,
  top and bottom edges aligned. On a phone: 3 then 2, left-aligned.

## 4. Page order and wording

Image to CAD (left column):
1. `IMAGE TO CAD · STEP 1`, heading "What are you making?", the cards.
2. `STEP 2`, heading "Upload Your {Noun} Images", drop zone, optional description.
3. Generate button alone, right-aligned.

Text to CAD (centred 680 px column): title, subtitle
"Describe your {noun} design" (replaces "Describe your ring design · Rings only"),
the cards, the description box, the Generate button.

Wording that follows the card, via one helper `cadJewelryNoun(type)` in
`ring-cad-nurbs-api.ts`: ring, necklace, bracelet, earring, and "piece" for Other.
Applied to: Image to CAD upload heading, drop-zone label
("Drop your {noun} images or sketches here"), Text to CAD subtitle and textarea
placeholder ("Describe your {noun}, e.g. …"; the ring example sentence is kept
only for Ring, other types get a generic "Describe your {noun}").

Unchanged: ring examples, My Rings, history library, Generate cost display.

## 5. Download menu

`src/components/downloads/CadDownloadMenu.tsx`, shared by the 3D viewport
toolbar, the result action bar and the Generations history card.

- One button: download icon, "Download", chevron. The whole button opens the
  menu; nothing downloads on the first click. While busy it reads
  "Preparing..." and is disabled, as today.
- Menu order, each row a format plus a short hint, only for formats the run has:
  - 3DM: Rhino, editable
  - GLB: 3D preview
  - 3DM: Viewer only (mesh)
  - STEP: Other CAD software
  - STL: 3D printing
- Estimated metal weight stays at the top of the menu.
- "GLB: With my edits" sits below a separator, only when `onExportEdited` is passed.
- If no format is available the control renders nothing (as today).
- Same heights and widths per variant as today (`viewport` 42 px, `result`
  56 px at `CAD_RESULT_ACTION_WIDTH`, `card` 44 px full width), so nothing
  around it moves. Props are unchanged, so callers do not change.

## Testing

- New `CadJewelryTypeCards.test.tsx`: renders five options in order; the
  selected one has `aria-checked=true`; clicking calls `onChange`; arrow keys
  move selection; disabled state blocks changes.
- Prompt screen tests: cards render, no material or model controls, wording
  follows the selected type.
- `CadDownloadMenu.test.tsx` and `CadResultActions.test.tsx` updated: one
  trigger labelled Download, menu order, hints, missing formats hidden, edits row
  only when edited, busy state.
- Before finishing: `npm run typecheck` clean and full `npx vitest run`
  (baseline after the test fix: 1400 passing, 0 failing), then desktop and
  phone screenshots checked with design-review.
