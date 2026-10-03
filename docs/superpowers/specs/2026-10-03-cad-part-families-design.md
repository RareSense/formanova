# CAD workspace: part families, hover, Parts panel, wax/blue defaults

Date: 2026-10-03
Branch: `feat/cad-type-cards-download-menu` (tracks `origin/feature/jewelry-cad-workflows`)
User approval: design approved in session; explicit OK to change the protected `CADCanvas.tsx` (small, tested change).

## Goal

Stop clicking 40 pavé stones one by one. Parts are grouped into families (all pavé
stones, all prongs, …) and selected the way Figma selects groups:

| Action (3D view) | Result |
|---|---|
| Hover a part | Its whole family glows (soft white, distinct from the orange selection) |
| Click | Selects the whole family (replaces the selection) |
| Double-click | Selects just that one part |
| Shift / Ctrl / Cmd + click | Adds or removes the whole family |
| Shift / Ctrl / Cmd + double-click | Adds or removes just that one part |
| Esc, or click empty space | Clears (already works) |

On load, metal parts show green casting wax (`0x1f6e44`, satin) and stones show
steel-blue metallic, until the user picks a material.

## Families (`src/lib/cad-part-families.ts`, new, pure)

- `cadPartFamilyKey(name)`: split camelCase (`PaveGem` → `pave gem`), lowercase,
  split on anything that isn't a letter (drops digits, `.`, `_`, `-`), then drop
  tokens that are one letter long or are `l r left right up dn mesh copy`. Join
  with a space. Empty result → the lowercased name itself.
  - `Pave_Gem_00`, `Pave_Gem_-1_0`, `PaveGem_0` → `pave gem`
  - `pave_L_01_gem`, `pave_R_01_gem` → `pave gem`
  - `shankA_pave_l01_gem` → `shank pave gem`
  - `AccentStone.L.Up`, `AccentStone.R.Dn` → `accent stone`
  - `Prong_Claw_0_1`, `CenterProng_-1_1_mesh` → `prong claw`, `center prong`
  - `HaloDiamond.inner.00` vs `HaloDiamond.outer.00` stay separate (inner/outer kept)
- `cadPartKind(name)`: `classifyCadPartName` → `"stone"` (gem) / `"metal"` (metal, and unknown names — same convention as the classifier fixture and the viewer default).
- `groupCadParts(names)`: `{ key, label, kind, names }[]`; kinds ordered stone, metal; inside a kind, larger families first, then label A–Z. `label` = key with
  the first letter upper-cased (no pluralising).
- `cadFamilyMembers(name, allNames)`: every name with the same key.

## Selection state (`src/hooks/useCADMeshEditor.ts`)

- New `handleSelectFamily(name, multi)`: empty name clears. Without `multi` the
  selection becomes exactly the family. With `multi`: if every member is already
  selected, deselect the family; otherwise add all members.
- Existing `handleSelectMesh(name, multi)` stays the single-part action (used by
  double-click and by part rows in the panel).
- New hover state: `setHoveredPart(name | null)` and `hoveredFamilyNames: Set<string>`
  (the hovered part's family; empty when null).
- New `handleApplyGemToAll(matId)`: pushes undo, then applies the gem material to
  every part whose kind is `stone` through the existing `canvasRef.applyMaterial(matId, names)`;
  warns "No stones to update" when there are none.

## 3D view (`CADCanvas.tsx`, protected — minimal change)

- New optional props, threaded from the outer `CADCanvas` to the inner scene:
  `onMeshDoubleClick?(name, multi)`, `onMeshHover?(name | null)`,
  `highlightedMeshNames?: Set<string>`.
- Standard meshes (≈line 2340) and the BVH gem overlay (≈line 2530) get
  `onDoubleClick` (same guards as `onClick`) and `onPointerOver` / `onPointerOut`
  (`stopPropagation`; ignore while `_isTransformDragging` or while a mouse button
  is held, i.e. orbiting).
- Hover glow: when `highlightedMeshNames` has the part, render a child mesh with the
  same geometry and a shared module-level `HOVER_MATERIAL`
  (`MeshBasicMaterial`, white, `transparent`, `opacity 0.28`, `depthWrite false`,
  `polygonOffset` −1/−1), `raycast` disabled, so it follows the part's transform and
  explode. `SELECTION_MATERIAL`, `_isTransformDragging`, WebGL context code and
  `GemInstanceRenderer.ts` are not touched.
- Defaults: add `REFERENCE_MATERIALS.wax` (`kind "pearl"`, `color 0x1f6e44`, label
  "Casting Wax") and `REFERENCE_MATERIALS.stoneBlue` (`kind "metal"`, `color 0x3f6fc4`,
  `rough 0.22`, label "Stone Blue"). In `referenceKeyForMaterial`, the `flat-` branch
  returns `"stoneBlue"` for `category "gemstone"` and `"wax"` otherwise. The library
  materials (gold, diamond, …) are unchanged, so any user pick replaces the default
  as today. Magic Texturing is unchanged.

## Parts panel (`MeshPanel.tsx`, `ViewportOverlays.tsx`)

- "Meshes" → "Parts" (all four section headers, the stats label, "Search parts…",
  "Generate a piece to see its parts", "No matching parts", "Select a part to assign
  material").
- Grouped list from `groupCadParts`: kind headers (STONES / METAL), then family
  rows "Pave gem · 40" with a chevron. Click a family row → `onSelectFamily(firstName, multi)`.
  Chevron expands to part rows; click a part row → `onSelectMesh(name, multi)`.
  A family row shows selected when all members are selected, partly selected (dot)
  when some are. Hovering a family or part row → `onHoverPart(name)`; leaving → `onHoverPart(null)`.
  Search filters parts and keeps their family headers. Single-part families render as
  one row (no chevron).
- Shift-range selection in the old flat list is dropped (families replace it);
  Shift and Ctrl/Cmd both mean add/remove.
- "All stones" picker next to "All metal parts" (gem materials from `MATERIAL_LIBRARY`)
  → `onApplyGemToAll(matId)`; shown only when the page passes the handler.

## Pages

Both `TextToCAD.tsx` and `ImageToCAD.tsx`: `CADCanvas` gets
`onMeshClick={editor.handleSelectFamily}`, `onMeshDoubleClick={editor.handleSelectMesh}`,
`onMeshHover={editor.setHoveredPart}`, `highlightedMeshNames={editor.hoveredFamilyNames}`;
`MeshPanel` gets `onSelectFamily`, `onHoverPart`, `onApplyGemToAll`.

## Out of scope

Responsive workspace (next change), toolkit GLB metal/stone tags, magic texturing,
transform gizmos, export formats. "GLB · With my edits" exports what is on screen,
including wax/blue when no material was picked (intended).

## Testing

- Families: real names from `src/lib/cad-part-classifier.fixture.json` and the
  examples above.
- Hook: family select / toggle / clear, hover set, apply-to-all-stones (mocked canvas ref).
- Panel: grouping, family click, part click, partial state, hover callbacks, All stones,
  wording.
- 3D view: `referenceKeyForMaterial` defaults (unit test if the module imports in
  jsdom), plus a browser check with a stone-heavy demo model: hover glow on a whole
  family, click selects the family, double-click one part, panel in sync, wax/blue on
  load, a metal pick still applies.
- Full typecheck, eslint on touched files, full vitest suite.
