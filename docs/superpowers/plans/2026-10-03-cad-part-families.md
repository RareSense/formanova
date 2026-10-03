# CAD Part Families Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hover highlights a part's whole family, click selects the family, double-click selects one part; the panel becomes a grouped "Parts" tree with "All stones"; metal loads as wax green and stones as steel blue.

**Architecture:** Family logic is a pure lib (`cad-part-families.ts`). Selection/hover state lives in `useCADMeshEditor`. The protected `CADCanvas.tsx` only reports hover/double-click, draws a hover overlay for names it is given, and maps flat defaults to two new reference looks. `MeshPanel.tsx` renders the grouped tree. Pages wire it up.

**Tech Stack:** React 18 + TS, react-three-fiber/three, Tailwind, Vitest + Testing Library.

Spec: `docs/superpowers/specs/2026-10-03-cad-part-families-design.md`

## Global Constraints

- Repo `C:\Users\Clubinternet\OneDrive\Desktop\frontend\formanova-gemini-tier`, branch `feat/cad-type-cards-download-menu` (tracks `origin/feature/jewelry-cad-workflows`). Do not push (the controller pushes).
- User explicitly approved changing `src/components/text-to-cad/CADCanvas.tsx` for THIS feature only, minimally. Still never touch `SELECTION_MATERIAL`, `_isTransformDragging` semantics, WebGL context code, `GemInstanceRenderer.ts`, or `src/components/cad-studio/materials.ts`.
- Minimal blast radius; follow CLAUDE.md UI rules (no `cursor-pointer` on `<button>`, siblings same size, no overflowing text) and AI_RULES.md.
- jest-dom matchers are NOT registered globally: in new test files add `import '@testing-library/jest-dom/vitest';` or use `toBeTruthy()/toBeNull()`.
- Exact values: wax `0x1f6e44` (kind `"pearl"`, label "Casting Wax"); stone blue `0x3f6fc4` (kind `"metal"`, `rough: 0.22`, label "Stone Blue"); hover overlay white, opacity `0.28`.
- Every commit ends with a blank line then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (use a second `-m`). Explicit paths in `git add`.
- Baseline: typecheck clean; `npx vitest run` = 91 files / 1414 tests passing.

---

### Task 1: Family helpers

**Files:**
- Create: `src/lib/cad-part-families.ts`
- Test: `src/lib/cad-part-families.test.ts`

**Interfaces:**
- Consumes: `classifyCadPartName` from `@/lib/cad-part-classifier`.
- Produces:
  ```ts
  export type CadPartFamilyKind = "stone" | "metal" | "other";
  export interface CadPartFamily { key: string; label: string; kind: CadPartFamilyKind; names: string[] }
  export function cadPartFamilyKey(name: string): string;
  export function cadPartKind(name: string): CadPartFamilyKind;
  export function groupCadParts(names: string[]): CadPartFamily[];
  export function cadFamilyMembers(name: string, allNames: string[]): string[];
  ```

- [ ] **Step 1: Failing test** — create `src/lib/cad-part-families.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import fixture from './cad-part-classifier.fixture.json';
import { cadFamilyMembers, cadPartFamilyKey, cadPartKind, groupCadParts } from './cad-part-families';

describe('cadPartFamilyKey', () => {
  it.each([
    ['Pave_Gem_00', 'pave gem'],
    ['Pave_Gem_-1_0', 'pave gem'],
    ['PaveGem_0', 'pave gem'],
    ['pave_L_01_gem', 'pave gem'],
    ['pave_R_01_gem', 'pave gem'],
    ['shankA_pave_l01_gem', 'shank pave gem'],
    ['AccentStone.L.Up', 'accent stone'],
    ['AccentStone.R.Dn', 'accent stone'],
    ['Prong_Claw_0_1', 'prong claw'],
    ['CenterProng_-1_1_mesh', 'center prong'],
    ['HaloDiamond.inner.00', 'halo diamond inner'],
    ['HaloDiamond.outer.00', 'halo diamond outer'],
    ['shank_copy_2', 'shank'],
    ['42', '42'],
  ])('%s -> %s', (name, key) => {
    expect(cadPartFamilyKey(name)).toBe(key);
  });
});

describe('cadPartKind', () => {
  it('sorts stones, metal and unknown parts', () => {
    expect(cadPartKind('Pave_Gem_00')).toBe('stone');
    expect(cadPartKind('Prong_Claw_0_1')).toBe('metal');
    expect(cadPartKind('rose_outer_upper_fold')).toBe('other');
  });

  it('agrees with the classifier on every recorded part name', () => {
    const { gem, metal } = fixture as { gem: string[]; metal: string[] };
    for (const name of gem) expect(cadPartKind(name)).toBe('stone');
    for (const name of metal) expect(cadPartKind(name)).toBe('metal');
  });
});

describe('groupCadParts', () => {
  const names = [
    'Shank_Base_mesh', 'Pave_Gem_00', 'Pave_Gem_01', 'Pave_Gem_02',
    'Prong_Claw_0_1', 'Prong_Claw_0_2', 'center_diamond', 'rose_petal_1',
  ];

  it('puts stones first, then metal, then other; bigger families first', () => {
    const groups = groupCadParts(names);
    expect(groups.map((g) => [g.kind, g.label, g.names.length])).toEqual([
      ['stone', 'Pave gem', 3],
      ['stone', 'Center diamond', 1],
      ['metal', 'Prong claw', 2],
      ['metal', 'Shank base', 1],
      ['other', 'Rose petal', 1],
    ]);
  });

  it('keeps the original part names in each family, in input order', () => {
    expect(groupCadParts(names)[0].names).toEqual(['Pave_Gem_00', 'Pave_Gem_01', 'Pave_Gem_02']);
  });
});

describe('cadFamilyMembers', () => {
  it('returns every part with the same family', () => {
    const all = ['pave_L_01_gem', 'pave_R_07_gem', 'Prong_Claw_0_1'];
    expect(cadFamilyMembers('pave_R_07_gem', all)).toEqual(['pave_L_01_gem', 'pave_R_07_gem']);
  });
});
```

Before writing the test, open `src/lib/cad-part-classifier.fixture.json` and confirm its shape. If it is not `{ gem: string[]; metal: string[] }`, adapt only the destructuring line in the second `cadPartKind` test to the real shape.

- [ ] **Step 2: Run** `npx vitest run src/lib/cad-part-families.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** `src/lib/cad-part-families.ts`:

```ts
/**
 * Part families: the sets of CAD parts a jeweller treats as one thing — every
 * pavé stone, every prong. Hovering or clicking one part in the CAD workspace
 * acts on its whole family, so a 40-stone pavé is one click, not forty.
 *
 * A family is the part name without numbers and side words: `pave_L_01_gem`
 * and `pave_R_07_gem` are both "pave gem". Inner/outer are kept, because a
 * double halo's two rows are usually chosen separately.
 */
import { classifyCadPartName } from "@/lib/cad-part-classifier";

export type CadPartFamilyKind = "stone" | "metal" | "other";

export interface CadPartFamily {
  key: string;
  label: string;
  kind: CadPartFamilyKind;
  names: string[];
}

const DROPPED_TOKENS = new Set(["l", "r", "left", "right", "up", "dn", "mesh", "copy"]);
const KIND_ORDER: Record<CadPartFamilyKind, number> = { stone: 0, metal: 1, other: 2 };

export function cadPartFamilyKey(name: string): string {
  const tokens = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((t) => t.length > 1 && !DROPPED_TOKENS.has(t));
  return tokens.length > 0 ? tokens.join(" ") : name.toLowerCase();
}

export function cadPartKind(name: string): CadPartFamilyKind {
  const kind = classifyCadPartName(name);
  return kind === "gem" ? "stone" : kind === "metal" ? "metal" : "other";
}

export function groupCadParts(names: string[]): CadPartFamily[] {
  const byKey = new Map<string, CadPartFamily>();
  for (const name of names) {
    const key = cadPartFamilyKey(name);
    const family = byKey.get(key);
    if (family) family.names.push(name);
    else byKey.set(key, { key, label: key.charAt(0).toUpperCase() + key.slice(1), kind: cadPartKind(name), names: [name] });
  }
  return [...byKey.values()].sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.names.length - a.names.length || a.label.localeCompare(b.label),
  );
}

export function cadFamilyMembers(name: string, allNames: string[]): string[] {
  const key = cadPartFamilyKey(name);
  return allNames.filter((n) => cadPartFamilyKey(n) === key);
}
```

Note: a family's `kind` comes from its first part. If the fixture test shows a family whose parts disagree, report it (do not change the classifier).

- [ ] **Step 4: Run** the test → PASS. Fix the key rule only if an expectation above is wrong for a reason you can explain; report any change.
- [ ] **Step 5: Commit** `git add src/lib/cad-part-families.ts src/lib/cad-part-families.test.ts` → `git commit -m "Group CAD parts into families (all pavé stones, all prongs, …)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

---

### Task 2: Family selection, hover and "all stones" in the mesh editor hook

**Files:**
- Modify: `src/hooks/useCADMeshEditor.ts`
- Test: `src/hooks/useCADMeshEditor.test.ts` (create)

**Interfaces:**
- Consumes: `cadFamilyMembers`, `cadPartKind` (Task 1).
- Produces (added to the hook's returned object, next to `handleSelectMesh` / `handleApplyMetalToAll`):
  - `handleSelectFamily(name: string, multi: boolean): void`
  - `setHoveredPart(name: string | null): void`
  - `hoveredFamilyNames: Set<string>`
  - `handleApplyGemToAll(matId: string): void`

- [ ] **Step 1: Failing test** — create `src/hooks/useCADMeshEditor.test.ts` using `renderHook`/`act` from `@testing-library/react`. Build the hook with `canvasRef = { current: { applyMaterial: vi.fn(), getSnapshot: () => null } as unknown as CADCanvasHandle }`, `transformMode: 'orbit'`, `setTransformMode: vi.fn()`. Seed parts with `result.current.handleMeshesDetected([...])` using names `Pave_Gem_00`, `Pave_Gem_01`, `Pave_Gem_02`, `Prong_Claw_0_1`, `Prong_Claw_0_2`, `Shank_Base_mesh` (verts/faces any numbers). Tests:
  1. `handleSelectFamily('Pave_Gem_01', false)` → `selectedNames` equals the three pavé names.
  2. Then `handleSelectFamily('Prong_Claw_0_1', false)` → only the two prongs (replaces).
  3. `handleSelectFamily('Pave_Gem_00', true)` after prongs → five selected; calling it again with `true` → back to the two prongs.
  4. `handleSelectFamily('', false)` → nothing selected.
  5. `handleSelectMesh('Pave_Gem_02', false)` after a family select → only `Pave_Gem_02` (single-part action unchanged).
  6. `setHoveredPart('Prong_Claw_0_2')` → `hoveredFamilyNames` has exactly the two prongs; `setHoveredPart(null)` → size 0.
  7. `handleApplyGemToAll('diamond')` → `canvasRef.current.applyMaterial` called once with `('diamond', ['Pave_Gem_00','Pave_Gem_01','Pave_Gem_02'])`. With no stone parts detected, it is not called.
  If `useCADMeshEditor` needs other hook context (e.g. `sonner` toast), mock it with `vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }))`.

- [ ] **Step 2: Run** `npx vitest run src/hooks/useCADMeshEditor.test.ts` → FAIL (functions missing).

- [ ] **Step 3: Implement** in `src/hooks/useCADMeshEditor.ts`:
  - `import { cadFamilyMembers, cadPartKind } from "@/lib/cad-part-families";`
  - Hover state: `const [hoveredPart, setHoveredPart] = useState<string | null>(null);` and
    ```ts
    const hoveredFamilyNames = useMemo(
      () => new Set(hoveredPart ? cadFamilyMembers(hoveredPart, meshes.map((m) => m.name)) : []),
      [hoveredPart, meshes],
    );
    ```
  - Family select, next to `handleSelectMesh`:
    ```ts
    const handleSelectFamily = useCallback((name: string, multi: boolean) => {
      if (!name) {
        setMeshes((prev) => prev.map((m) => ({ ...m, selected: false })));
        return;
      }
      setMeshes((prev) => {
        const members = new Set(cadFamilyMembers(name, prev.map((m) => m.name)));
        if (!multi) return prev.map((m) => ({ ...m, selected: members.has(m.name) }));
        const allSelected = prev.every((m) => !members.has(m.name) || m.selected);
        return prev.map((m) => (members.has(m.name) ? { ...m, selected: !allSelected } : m));
      });
    }, []);
    ```
  - All stones, next to `handleApplyMetalToAll` (mirror its undo/warning style exactly; read it first):
    ```ts
    const handleApplyGemToAll = useCallback((matId: string) => {
      const stones = meshesRef.current.filter((m) => cadPartKind(m.name) === "stone").map((m) => m.name);
      if (stones.length === 0) { showSelectionWarning("No stones to update"); return; }
      pushUndo("Material: all stones");
      canvasRef.current?.applyMaterial(matId, stones);
    }, [canvasRef, pushUndo, showSelectionWarning]);
    ```
  - Return `handleSelectFamily`, `setHoveredPart`, `hoveredFamilyNames`, `handleApplyGemToAll` from the hook.
- [ ] **Step 4: Run** the test → PASS; `npm run typecheck` → exit 0.
- [ ] **Step 5: Commit** both files: `"Select a whole part family, hover a family, and set all stones at once"` + trailer.

---

### Task 3: Parts panel

**Files:**
- Modify: `src/components/text-to-cad/MeshPanel.tsx`, `src/components/text-to-cad/ViewportOverlays.tsx` (stats label only)
- Test: `src/components/text-to-cad/MeshPanel.test.tsx` (create)

**Interfaces:**
- Consumes: `groupCadParts`, `CadPartFamily` (Task 1).
- Produces: `MeshPanelProps` gains optional `onSelectFamily?(name, multi)`, `onHoverPart?(name | null)`, `onApplyGemToAll?(matId)`. Existing props unchanged. Both pages pass all three (Task 5). If `onSelectFamily` is missing, render every part as its own row (no family rows), so the panel still works.

- [ ] **Step 1: Failing test** — `MeshPanel.test.tsx` renders `<MeshPanel meshes={...} onSelectMesh onSelectFamily onHoverPart onApplyGemToAll onAction onApplyMaterial onSceneAction />` with parts `Pave_Gem_00..02` (one selected), `Prong_Claw_0_1`, `Shank_Base_mesh`. Mock `@/components/cad-studio/MaterialSphere` to a stub if it touches WebGL. Assert:
  1. Header text "Parts" present, "Meshes" absent; search placeholder "Search parts...".
  2. Kind headings "Stones" and "Metal" present (case-insensitive); a family row button named like `/pave gem.*3/i`.
  3. Clicking the "Pave gem" family row calls `onSelectFamily('Pave_Gem_00', false)`; Ctrl+click calls it with `true`.
  4. The pavé family row shows partly-selected (e.g. `aria-pressed="mixed"` — implement it that way) when 1 of 3 is selected, `"true"` when all are, `"false"` when none.
  5. Expanding the pavé family (button named `/show parts/i` or the chevron with `aria-expanded`) reveals 3 part rows; clicking `Pave_Gem_01` calls `onSelectMesh('Pave_Gem_01', false)`.
  6. A one-part family (`Shank base`) has no expand control and clicking it calls `onSelectMesh('Shank_Base_mesh', false)`.
  7. Hovering the pavé family row calls `onHoverPart('Pave_Gem_00')`; mouse leave calls `onHoverPart(null)`.
  8. "All stones" picker present (`aria-label="Apply one gem to all stones"`) only when `onApplyGemToAll` is passed.
  9. Empty meshes → "Generate a piece to see its parts".
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** in `MeshPanel.tsx`:
  - Replace every `title="Meshes"` with `title="Parts"`; "Search meshes..." → "Search parts..."; empty texts → "Generate a piece to see its parts" / "No matching parts"; "Select a mesh to assign material" → "Select a part to assign material".
  - Replace the flat `MeshList` rendering with a grouped list: `const groups = useMemo(() => groupCadParts(filtered.map((m) => m.name)), [filtered])` and a `byName` map for `selected`/`visible`. Render per kind a small heading (`font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground`, text "Stones" / "Metal") then family rows. Family row = one `<button>` (`aria-pressed` true/false/"mixed", text `label` + `· count`), plus — when `names.length > 1` — a separate chevron `<button aria-expanded aria-label={`Show parts in ${label}`}>`. Expanded state is a `Set<string>` of family keys in component state. Part rows reuse today's row look (name, `[H]` hidden marker, verts/faces) indented `pl-6`. Keep row styling consistent with the existing rows (same text sizes/borders); both buttons in a row have equal height.
  - Clicks: family row → `onSelectFamily(names[0], e.shiftKey || e.ctrlKey || e.metaKey)`; part row → `onSelectMesh(name, e.shiftKey || e.ctrlKey || e.metaKey)`. Remove `lastClickedIdx` and the shift-range loop.
  - Hover: `onMouseEnter={() => onHoverPart?.(names[0] or part name)}`, `onMouseLeave={() => onHoverPart?.(null)}` on family and part rows.
  - "All stones": in `MaterialContent`, below "All metal parts", the same `Select` pattern with label text "All stones", `aria-label="Apply one gem to all stones"`, placeholder "Choose a gem…", items `MATERIAL_LIBRARY.filter((m) => m.category === "gemstone")`, rendered only when `onApplyGemToAll` is passed. Thread the prop through like `onApplyMetalToAll`.
  - `ViewportOverlays.tsx` ~line 96: label `"Meshes"` → `"Parts"`.
- [ ] **Step 4: Run** the panel test → PASS; run any existing tests that mention "Meshes" (`grep -rn "Meshes" src --include=*.test.*`) and update only wording. `npm run typecheck`, eslint on touched files.
- [ ] **Step 5: Commit** touched files: `"Parts panel groups parts into families, with All stones"` + trailer.

---

### Task 4: 3D view hover, double-click and wax/blue defaults (protected file, minimal)

**Files:**
- Modify: `src/components/text-to-cad/CADCanvas.tsx`
- Test: `src/components/text-to-cad/cad-canvas-defaults.test.ts` (create, only if the import works in jsdom — see Step 1)

**Interfaces:**
- Produces (optional props on the exported `CADCanvas` and threaded to the inner scene component that renders meshes ~line 2819 → ~1005): `onMeshDoubleClick?: (name: string, multi: boolean) => void`, `onMeshHover?: (name: string | null) => void`, `highlightedMeshNames?: Set<string>`. Also `export function referenceKeyForMaterial` (export only; no behaviour change besides Step 3a).

- [ ] **Step 1: Failing test (defaults)** — try `import { referenceKeyForMaterial } from './CADCanvas'` in `cad-canvas-defaults.test.ts`. Assert: a flat metal def `{ id: 'flat-metal-band', category: 'metal' }` → `'wax'`; a flat gem def `{ id: 'flat-gem-pave', category: 'gemstone' }` → `'stoneBlue'`; a library def `{ id: 'gold-yellow-polished' }` → `'gold18k'` (unchanged); `undefined` material with name `'Pave_Gem_00'` → `'diamond'` (unchanged). If importing CADCanvas in jsdom fails for environment reasons (WebGL/three addons), delete this test file, note it in the report, and rely on the browser check in Task 6.
- [ ] **Step 2: Run** → FAIL (not exported / old mapping).
- [ ] **Step 3a: Defaults.** In `REFERENCE_MATERIALS` (~line 62) add after `blackRhodium`:
  ```ts
  // Default look on load, before the user picks a material: green casting wax for
  // metal and steel blue for stones, the way CAD tools show unassigned parts.
  wax:          { label: "Casting Wax", kind: "pearl", color: 0x1f6e44 },
  stoneBlue:    { label: "Stone Blue", kind: "metal", color: 0x3f6fc4, rough: 0.22 },
  ```
  In `referenceKeyForMaterial` (~line 136) replace the `flat-` branch body with `return material.category === "gemstone" ? "stoneBlue" : "wax";`. Export the function. Check that neither key appears in any UI material list (MeshPanel uses `MATERIAL_LIBRARY`, not `REFERENCE_MATERIALS`; confirm with grep and report).
- [ ] **Step 3b: Events.** On the standard `<mesh>` (~line 2340) and the BVH gem overlay `<mesh>` (~line 2530) add, next to the existing `onClick`:
  ```tsx
  onDoubleClick={(e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (_isTransformDragging) return;
    onMeshDoubleClick?.(NAME, e.nativeEvent.shiftKey || e.nativeEvent.ctrlKey || e.nativeEvent.metaKey);
  }}
  onPointerOver={(e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (_isTransformDragging || e.nativeEvent.buttons !== 0) return;
    onMeshHover?.(NAME);
  }}
  onPointerOut={(e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onMeshHover?.(null);
  }}
  ```
  (`NAME` = `md.name` / `meshName`.) Thread `onMeshDoubleClick` and `onMeshHover` the same way `onMeshClick` is threaded (outer props → inner scene → `SyncedGemOverlay` → `ReferenceGemMesh`).
- [ ] **Step 3c: Hover glow.** Module level, near `SELECTION_MATERIAL` (do not modify it):
  ```ts
  /** Soft white glow on every part of the hovered family; distinct from the orange selection. */
  const HOVER_MATERIAL = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const NO_RAYCAST = () => null;
  ```
  Inside the standard `<mesh>` element (make it non-self-closing), add the child
  `{highlightedMeshNames?.has(md.name) && <mesh geometry={md.geometry} material={HOVER_MATERIAL} raycast={NO_RAYCAST} renderOrder={2} />}`.
  Do NOT add `highlightedMeshNames` to the big materials `useMemo` dependency list (~line 2244); it is read only in JSX. If the frame does not update on hover (frameloop is `"demand"`), add a `useEffect(() => { invalidate(); }, [highlightedMeshNames, invalidate])` in the scene component (use the existing `inv`/`invalidate` the file already uses).
- [ ] **Step 4: Run** the defaults test (if kept), `npm run typecheck`, eslint on CADCanvas.tsx (0 new errors; report pre-existing ones separately), and the full suite.
- [ ] **Step 5: Commit** `CADCanvas.tsx` (+ test if kept): `"3D view: hover a family, double-click one part, wax and blue on load"` + trailer.

---

### Task 5: Wire both pages

**Files:**
- Modify: `src/pages/TextToCAD.tsx`, `src/pages/ImageToCAD.tsx`

**Interfaces:** consumes Tasks 2–4.

- [ ] **Step 1:** On each page's `<CADCanvas ...>` (TextToCAD ~356, ImageToCAD ~333): change `onMeshClick={editor.handleSelectMesh}` to `onMeshClick={editor.handleSelectFamily}` and add `onMeshDoubleClick={editor.handleSelectMesh}`, `onMeshHover={editor.setHoveredPart}`, `highlightedMeshNames={editor.hoveredFamilyNames}`.
- [ ] **Step 2:** On each `<MeshPanel ...>` (TextToCAD ~551, ImageToCAD ~514) add `onSelectFamily={editor.handleSelectFamily}`, `onHoverPart={editor.setHoveredPart}`, `onApplyGemToAll={editor.handleApplyGemToAll}`.
- [ ] **Step 3:** `npm run typecheck`, eslint on both pages (0 new errors), full suite.
- [ ] **Step 4: Commit** both pages: `"CAD pages use part families in the 3D view and the Parts panel"` + trailer.

---

### Task 6: Browser check and push (controller)

- [ ] Throwaway preview worktree at HEAD with the local no-auth patch (ProtectedRoute + authenticated-fetch from `formanova-demo`), `public/demo` assets, `.env.local` with `VITE_DEMO_NO_AUTH=true`, `VITE_DEMO_GLB_URL=/demo/firefly.glb`, `VITE_DEMO_3DM_URL=/demo/firefly.3dm`, `VITE_DEMO_STEP_MS=300`; never committed.
- [ ] Playwright at 1440×900: generate (demo), screenshot on load (wax/blue), hover a stone (family glows), click (family selected; panel family row pressed), double-click (one part), Ctrl+click another family (added), Esc (cleared), panel family hover (3D glow), "All stones" → a gem applies to all stones, "All metal parts" still works.
- [ ] Final whole-branch review of the feature commits, fix findings, full suite, then `git push origin HEAD:feature/jewelry-cad-workflows`. Remove the preview worktree (delete the node_modules junction first).
