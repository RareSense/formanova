# Metal Weight (frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the metal weight of every CAD version on the main CAD screen (bar under the viewer, card in the side
panel, tag on history cards, line in the download menu), computed only from a measured volume and a cited alloy
density, and let the request form send a metal and an optional target weight.

**Architecture:** Four pure modules under `src/lib/metal-weight/` (alloy table, maths, formatting, volume source)
plus a tiny request helper; one hook (`useMetalChoice`) that decides which alloy is shown; four presentational
components under `src/components/metal-weight/`. The workflow hook only gathers inputs (version volume, run result
volume or mass, what was sent) and hands them to `resolveMetalWeight`. Pages wire the pieces with a few lines each.

**Tech Stack:** Vite, React 18, TypeScript (loose: `strictNullChecks: false`), Tailwind, lucide-react, vitest +
@testing-library/react (jsdom).

Spec: `docs/superpowers/specs/2026-11-02-metal-weight-design.md`. Scope: sections 3.1 (frontend fallback), 3.2, 3.3
(sending `weight_target`), 4, 5, 6, 7, plus reading `metal_volume_mm3` from version and result payloads when present.

## Global Constraints

- Formula: weight (g) = metal volume (mm³) × alloy density (g/cm³) ÷ 1000.
- 1 dwt = 1.55517384 g. Finishing loss 5%, shown as "≈ X g after finishing (−5%)".
- Densities, labels, ids, named alloys and URLs: exactly Appendix A. No other numbers. No placeholders.
- Common-5 chips: au10y, au14y, au18y, ag925, pt950ru.
- Legacy ids keep resolving: sterling_silver→ag925, 14k_yellow_gold→au14y, 14k_white_gold→au14w,
  14k_rose_gold→au14r, 18k_yellow_gold→au18y, 18k_white_gold→au18w, 18k_rose_gold→au18r; `platinum_cobalt` → unavailable.
- Request payload `material: {alloy, density_g_cm3, density_source}` keeps its shape. New: `weight_target: {grams, tolerance_pct, alloy_id}`.
- Volume missing, zero, negative or non-finite → "Weight not available for this model" ("model has no closed metal volume"). Never NaN or 0 g.
- Unknown alloy id → default display alloy plus "Requested metal unavailable".
- A target without an alloy → status uses the displayed alloy.
- localStorage unavailable → in-memory choice only (every access in try/catch).
- Rounding: grams 2 dp, dwt 2 dp, percent 1 dp; maths on unrounded values. (The compact history tag shows grams to 1 dp, as the spec's screen shows "25.4 g · 10K".)
- Target status: deviation = (weight − target) ÷ target; on target if |deviation| ≤ tolerance (boundary inclusive).
- Default tolerance 5%. Default display alloy: au14y (a product default, not a number shown).
- Follow AI_RULES.md: tests ship with parsing/API changes; no new eslint-disable without the three-part comment; keep page diffs minimal.
- Strict TDD: failing test, run it red, implement, run green, commit, per task.

## File map

| File | Responsibility |
|---|---|
| Create `src/lib/metal-weight/alloys.ts` | cited table, `findAlloy`, legacy ids, common-5, groups, short label, request `material` block |
| Create `src/lib/metal-weight/weight.ts` | maths: grams, dwt, finished, volume from mass, target status |
| Create `src/lib/metal-weight/format.ts` | display strings |
| Create `src/lib/metal-weight/source.ts` | volume source picker, target reader, `resolveMetalWeight` |
| Create `src/lib/metal-weight/request.ts` | form value → `material` + `weight_target` |
| Create `src/hooks/useMetalChoice.ts` | which alloy is shown |
| Create `src/components/metal-weight/{types.ts,MetalSelect.tsx,WeightBar.tsx,WeightCard.tsx,WeightTag.tsx,MetalWeightStep.tsx}` | UI |
| Modify `src/lib/ring-cad-nurbs-api.ts` | re-export table; `weight_target` in body; parse `metal_volume_mm3` |
| Modify `src/lib/cad-result-api.ts`, `src/contexts/GenerationsContext.tsx` | carry `metalVolumeMm3` |
| Modify `src/lib/cad-versions-api.ts` | `metal_volume_mm3`, `weight_target` on `CadRingVersion` |
| Modify `src/hooks/useImageToCADWorkflow.ts` | send target, remember what was sent, expose `metalWeight` |
| Modify `src/components/downloads/CadDownloadMenu.tsx`, `src/components/text-to-cad/CadResultActions.tsx` | metal line |
| Modify `src/components/generations/WorkflowCard.tsx` | WeightTag |
| Modify `src/components/text-to-cad/CadWorkspaceLayout.tsx` | `viewportFooter` slot |
| Modify `src/pages/ImageToCAD.tsx`, `src/pages/TextToCAD.tsx`, `ImagePromptScreen.tsx`, `InitialPromptScreen.tsx` | wiring |

CAD-to-Catalog (`CADToCatalog.tsx`, `CatalogViewer.tsx`) works on local uploaded files with no version and no volume,
so it gets no WeightBar (the brief says not to force it).

---

### Task 1: Alloy table and the request re-export

**Files:**
- Create: `src/lib/metal-weight/alloys.ts`
- Test: `src/lib/metal-weight/alloys.test.ts`
- Modify: `src/lib/ring-cad-nurbs-api.ts:165-185` (replace profile table), `:355-361` (material block)
- Test: `src/lib/ring-cad-nurbs-api.test.ts` (add one case)

**Interfaces:**
- Produces: `MetalAlloy`, `MetalFamily`, `METAL_ALLOYS`, `findAlloy(id: unknown): MetalAlloy | null`,
  `DEFAULT_ALLOY_ID`, `COMMON_ALLOY_IDS`, `COMMON_ALLOYS`, `ALLOY_GROUPS`, `alloyShortLabel(a)`,
  `materialPayload(a): {alloy, density_g_cm3, density_source}`. `ring-cad-nurbs-api` keeps exporting
  `CadMaterialProfile` (= `MetalAlloy`) and `CAD_MATERIAL_PROFILES` (= `METAL_ALLOYS`).

- [ ] **Step 1: Write the failing tests** (`alloys.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { ALLOY_GROUPS, COMMON_ALLOY_IDS, COMMON_ALLOYS, DEFAULT_ALLOY_ID, METAL_ALLOYS, alloyShortLabel, findAlloy, materialPayload } from './alloys';

describe('alloy table', () => {
  it('has the 21 Appendix A alloys, each with a sane density and a source URL', () => {
    expect(METAL_ALLOYS).toHaveLength(21);
    for (const a of METAL_ALLOYS) {
      expect(a.density_g_cm3).toBeGreaterThanOrEqual(8);
      expect(a.density_g_cm3).toBeLessThanOrEqual(22);
      expect(a.source_url).toMatch(/^https:\/\//);
      expect(a.alloy.length).toBeGreaterThan(0);
    }
  });
  it('has unique ids', () => {
    expect(new Set(METAL_ALLOYS.map((a) => a.id)).size).toBe(METAL_ALLOYS.length);
  });
  it('uses the exact Appendix A densities', () => {
    const d = Object.fromEntries(METAL_ALLOYS.map((a) => [a.id, a.density_g_cm3]));
    expect(d).toEqual({ au9y: 11.1, au9w: 11.9, au9r: 11.1, au10y: 11.24, au10w: 11.0, au10wpd: 12.7, au10r: 11.68,
      au14y: 12.76, au14w: 12.55, au14wpd: 14.08, au14r: 13.16, au18y: 15.49, au18w: 14.59, au18wpd: 15.84, au18r: 15.09,
      au22y: 17.55, au24: 19.32, ag925: 10.36, pt950ru: 20.70, pt950ir: 21.50, pd950: 12.10 });
  });
  it('common-5 and default ids exist', () => {
    expect(COMMON_ALLOY_IDS).toEqual(['au10y', 'au14y', 'au18y', 'ag925', 'pt950ru']);
    expect(COMMON_ALLOYS.map((a) => a.id)).toEqual(COMMON_ALLOY_IDS);
    expect(findAlloy(DEFAULT_ALLOY_ID)?.label).toBe('14K Yellow Gold');
  });
  it('maps legacy profile ids, and platinum_cobalt to nothing', () => {
    expect(findAlloy('sterling_silver')?.id).toBe('ag925');
    expect(findAlloy('14k_yellow_gold')?.id).toBe('au14y');
    expect(findAlloy('14k_white_gold')?.id).toBe('au14w');
    expect(findAlloy('14k_rose_gold')?.id).toBe('au14r');
    expect(findAlloy('18k_yellow_gold')?.id).toBe('au18y');
    expect(findAlloy('18k_white_gold')?.id).toBe('au18w');
    expect(findAlloy('18k_rose_gold')?.id).toBe('au18r');
    expect(findAlloy('platinum_cobalt')).toBeNull();
  });
  it('resolves nothing for unknown or non-string ids, including prototype keys', () => {
    for (const id of ['nope', '', '__proto__', 'constructor', 'toString', null, undefined, 42, {}]) expect(findAlloy(id)).toBeNull();
  });
  it('groups every alloy once by family, and gives a short label', () => {
    expect(ALLOY_GROUPS.map((g) => g.label)).toEqual(['Gold', 'Silver', 'Platinum', 'Palladium']);
    expect(ALLOY_GROUPS.flatMap((g) => g.alloys)).toHaveLength(21);
    expect(['au10y', 'au24', 'ag925', 'pt950ir', 'pd950'].map((id) => alloyShortLabel(findAlloy(id)!))).toEqual(['10K', '24K', '925', 'Pt950', 'Pd950']);
  });
  it('builds the request material block in the existing shape', () => {
    expect(materialPayload(findAlloy('au10y')!)).toEqual({ alloy: '10K Yellow Gold', density_g_cm3: 11.24,
      density_source: 'UPMR 204 Standard Yellow: https://www.unitedpmr.com/wp-content/uploads/2021/07/204.pdf' });
  });
});
```

Add to `ring-cad-nurbs-api.test.ts`:

```ts
it('sends the chosen alloy as material with the unchanged keys', () => {
  const { payload } = buildRingCadStartBody({ referenceImages: [], userDescription: 'band', material: CAD_MATERIAL_PROFILES.find((p) => p.id === 'au18y') });
  expect(Object.keys(payload.material as object).sort()).toEqual(['alloy', 'density_g_cm3', 'density_source']);
  expect((payload.material as { density_g_cm3: number }).density_g_cm3).toBe(15.49);
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/metal-weight/alloys.test.ts src/lib/ring-cad-nurbs-api.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** `alloys.ts` (Appendix A rows verbatim; lookups via `Map` so prototype keys never resolve):

```ts
export type MetalFamily = 'gold' | 'silver' | 'platinum' | 'palladium';
export type MetalColour = 'yellow' | 'white' | 'rose';
export interface MetalAlloy { id: string; label: string; family: MetalFamily; karat: number | null; colour: MetalColour;
  density_g_cm3: number; alloy: string; source_url: string; }
export const METAL_ALLOYS: readonly MetalAlloy[] = [ /* the 21 Appendix A rows */ ];
const BY_ID = new Map(METAL_ALLOYS.map((a) => [a.id, a]));
const LEGACY_IDS = new Map<string, string | null>([['sterling_silver', 'ag925'], /* … */ ['platinum_cobalt', null]]);
export function findAlloy(id: unknown): MetalAlloy | null {
  if (typeof id !== 'string') return null;
  const direct = BY_ID.get(id); if (direct) return direct;
  const mapped = LEGACY_IDS.get(id); return mapped ? BY_ID.get(mapped) ?? null : null;
}
export const DEFAULT_ALLOY_ID = 'au14y';
export const COMMON_ALLOY_IDS = ['au10y', 'au14y', 'au18y', 'ag925', 'pt950ru'] as const;
export const COMMON_ALLOYS = COMMON_ALLOY_IDS.map((id) => BY_ID.get(id) as MetalAlloy);
export const ALLOY_GROUPS = ([['gold', 'Gold'], ['silver', 'Silver'], ['platinum', 'Platinum'], ['palladium', 'Palladium']] as const)
  .map(([family, label]) => ({ family, label, alloys: METAL_ALLOYS.filter((a) => a.family === family) }));
export function alloyShortLabel(a: MetalAlloy): string {
  if (a.family === 'gold') return `${a.karat}K`;
  if (a.family === 'silver') return '925';
  return a.family === 'platinum' ? 'Pt950' : 'Pd950';
}
export function materialPayload(a: MetalAlloy) {
  return { alloy: a.label, density_g_cm3: a.density_g_cm3, density_source: `${a.alloy}: ${a.source_url}` };
}
```

In `ring-cad-nurbs-api.ts` replace lines 165-185 with
`import { METAL_ALLOYS, materialPayload, type MetalAlloy } from '@/lib/metal-weight/alloys';` (at top) and
`export type CadMaterialProfile = MetalAlloy; export const CAD_MATERIAL_PROFILES = METAL_ALLOYS;`, and the material
block with `if (material) payload.material = materialPayload(material);`.

- [ ] **Step 4: Run** the same command → PASS.
- [ ] **Step 5: Commit** `feat(metal-weight): cited alloy table, legacy ids, unchanged material payload`.

---

### Task 2: Weight maths

**Files:** Create `src/lib/metal-weight/weight.ts`, test `weight.test.ts`.

**Interfaces:** Produces `GRAMS_PER_DWT`, `FINISHING_LOSS`, `DEFAULT_TOLERANCE_PCT`, `WeightTarget {grams, tolerancePct, alloyId}`,
`TargetStatus {kind: 'on'|'over'|'under', deviation}`, `isPositiveFinite`, `gramsFromVolume(volumeMm3, alloy) → number|null`,
`dwtFromGrams`, `gramsFromDwt`, `finishedGrams`, `volumeFromMass(mass, density) → number|null`, `targetStatus(weightG, target) → TargetStatus|null`.

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { findAlloy } from './alloys';
import { GRAMS_PER_DWT, dwtFromGrams, finishedGrams, gramsFromDwt, gramsFromVolume, targetStatus, volumeFromMass } from './weight';

describe('weight maths', () => {
  it('grams = volume × density ÷ 1000', () => {
    expect(gramsFromVolume(2192.4, findAlloy('au14y')!)).toBeCloseTo(27.975024, 9);
    expect(gramsFromVolume(1000, findAlloy('ag925')!)).toBeCloseTo(10.36, 12);
  });
  it('rejects zero, negative, NaN, Infinity and non-numbers', () => {
    const a = findAlloy('au14y')!;
    for (const v of [0, -1, NaN, Infinity, -Infinity, '2192.4', null, undefined]) expect(gramsFromVolume(v as number, a)).toBeNull();
    expect(gramsFromVolume(Number.MAX_VALUE, a)).toBeNull(); // overflows to Infinity
  });
  it('uses the troy pennyweight', () => {
    expect(GRAMS_PER_DWT).toBe(1.55517384);
    expect(dwtFromGrams(1.55517384)).toBe(1);
    expect(gramsFromDwt(20)).toBeCloseTo(31.1034768, 9);
  });
  it('removes 5% for finishing', () => { expect(finishedGrams(100)).toBeCloseTo(95, 12); });
  it('recovers volume from mass and the density it was computed with', () => {
    expect(volumeFromMass(27.975024, 12.76)).toBeCloseTo(2192.4, 9);
    for (const [m, d] of [[0, 12.76], [10, 0], [NaN, 1], [10, -1], [10, null]]) expect(volumeFromMass(m, d)).toBeNull();
  });
  it('target status is inclusive at exactly ±tolerance', () => {
    expect(targetStatus(21, { grams: 20, tolerancePct: 5 })).toEqual({ kind: 'on', deviation: 0.05 });
    expect(targetStatus(19, { grams: 20, tolerancePct: 5 })).toEqual({ kind: 'on', deviation: -0.05 });
    expect(targetStatus(21.01, { grams: 20, tolerancePct: 5 })?.kind).toBe('over');
    expect(targetStatus(18.99, { grams: 20, tolerancePct: 5 })?.kind).toBe('under');
  });
  it('target status is null for an invalid weight or target', () => {
    expect(targetStatus(NaN, { grams: 20, tolerancePct: 5 })).toBeNull();
    expect(targetStatus(20, { grams: 0, tolerancePct: 5 })).toBeNull();
    expect(targetStatus(20, null)).toBeNull();
  });
  it('a bad tolerance falls back to 5%', () => {
    expect(targetStatus(21, { grams: 20, tolerancePct: NaN })?.kind).toBe('on');
    expect(targetStatus(21, { grams: 20, tolerancePct: -3 })?.kind).toBe('on');
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/metal-weight/weight.test.ts` → FAIL.
- [ ] **Step 3: Implement**

```ts
import type { MetalAlloy } from './alloys';
export const GRAMS_PER_DWT = 1.55517384;
export const FINISHING_LOSS = 0.05;
export const DEFAULT_TOLERANCE_PCT = 5;
export interface WeightTarget { grams: number; tolerancePct: number; alloyId: string | null }
export interface TargetStatus { kind: 'on' | 'over' | 'under'; deviation: number }
export function isPositiveFinite(v: unknown): v is number { return typeof v === 'number' && Number.isFinite(v) && v > 0; }
export function gramsFromVolume(volumeMm3: number, alloy: Pick<MetalAlloy, 'density_g_cm3'>): number | null {
  if (!isPositiveFinite(volumeMm3) || !isPositiveFinite(alloy?.density_g_cm3)) return null;
  const g = (volumeMm3 * alloy.density_g_cm3) / 1000; return Number.isFinite(g) ? g : null;
}
export const dwtFromGrams = (g: number) => g / GRAMS_PER_DWT;
export const gramsFromDwt = (dwt: number) => dwt * GRAMS_PER_DWT;
export const finishedGrams = (g: number) => g * (1 - FINISHING_LOSS);
export function volumeFromMass(massG: unknown, densityGCm3: unknown): number | null {
  if (!isPositiveFinite(massG) || !isPositiveFinite(densityGCm3)) return null;
  const v = (massG * 1000) / densityGCm3; return Number.isFinite(v) ? v : null;
}
const BOUNDARY_EPSILON = 1e-9;
export function targetStatus(weightG: number, target: Pick<WeightTarget, 'grams' | 'tolerancePct'> | null): TargetStatus | null {
  if (!isPositiveFinite(weightG) || !target || !isPositiveFinite(target.grams)) return null;
  const pct = Number.isFinite(target.tolerancePct) && target.tolerancePct >= 0 ? target.tolerancePct : DEFAULT_TOLERANCE_PCT;
  const deviation = (weightG - target.grams) / target.grams;
  if (Math.abs(deviation) <= pct / 100 + BOUNDARY_EPSILON) return { kind: 'on', deviation };
  return { kind: deviation > 0 ? 'over' : 'under', deviation };
}
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(metal-weight): weight maths (grams, dwt, finishing, target status)`.

---

### Task 3: Formatting

**Files:** Create `src/lib/metal-weight/format.ts`, test `format.test.ts`. Depends on Tasks 1-2 and the `WeightSource` type of Task 4
(type-only import; Task 4 is written right after, so define `WeightSource` in `source.ts` within this task's commit if needed — here we import it type-only and create `source.ts` with just the type).

**Interfaces:** Produces `formatGrams`, `formatDwt`, `formatWeight(g) → "25.37 g · 16.31 dwt"`, `formatFixed2`,
`formatPercent(fraction) → "+1.5%" | "−14.6%" | "0.0%"`, `formatTargetStatus(status) → "On target +1.5%" | "14.6% over"`,
`FINISHING_NOTE = "after finishing (−5%)"`, `targetSummary(g, target, alloy) → {status, text} | null`,
`metalWeightLine(source, alloy) → "Metal: 10K Yellow Gold · Est. 25.37 g · 16.31 dwt" | null`, `formatTagWeight(g) → "25.4 g"`.

- [ ] **Step 1: Failing tests**

```ts
describe('format', () => {
  it('grams and dwt to 2 dp', () => { expect(formatWeight(27.975024)).toBe('27.98 g · 17.99 dwt'); });
  it('percent to 1 dp with sign, no negative zero', () => {
    expect(formatPercent(0.015)).toBe('+1.5%'); expect(formatPercent(-0.146)).toBe('−14.6%');
    expect(formatPercent(-0.0004)).toBe('0.0%'); expect(formatPercent(0)).toBe('0.0%');
  });
  it('target status words', () => {
    expect(formatTargetStatus({ kind: 'on', deviation: 0.015 })).toBe('On target +1.5%');
    expect(formatTargetStatus({ kind: 'over', deviation: 0.146 })).toBe('14.6% over');
    expect(formatTargetStatus({ kind: 'under', deviation: -0.03 })).toBe('3.0% under');
  });
  it('finishing note', () => { expect(FINISHING_NOTE).toBe('after finishing (−5%)'); });
  it('names the previewed alloy when it is not the target alloy', () => {
    const t = { grams: 28, tolerancePct: 5, alloyId: 'au14y' };
    expect(targetSummary(27.975024, t, findAlloy('au14y')!)?.text).toBe('On target −0.1%');
    expect(targetSummary(33.960276, t, findAlloy('au18y')!)?.text).toBe('21.3% over in 18K Yellow Gold');
    expect(targetSummary(33.960276, { ...t, alloyId: null }, findAlloy('au18y')!)?.text).toBe('21.3% over');
    expect(targetSummary(20, null, findAlloy('au18y')!)).toBeNull();
  });
  it('download line, or null when not available', () => {
    expect(metalWeightLine({ available: true, volumeMm3: 2192.4, from: 'version' }, findAlloy('au14y')!)).toBe('Metal: 14K Yellow Gold · Est. 27.98 g · 17.99 dwt');
    expect(metalWeightLine({ available: false, reason: 'x' }, findAlloy('au14y')!)).toBeNull();
  });
  it('tag grams to 1 dp', () => { expect(formatTagWeight(27.975024)).toBe('28.0 g'); });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (strings exactly as above; MINUS is U+2212). **Step 4:** PASS. **Step 5: Commit** `feat(metal-weight): display formatting`.

---

### Task 4: Volume source and target reader

**Files:** `src/lib/metal-weight/source.ts`, test `source.test.ts`.

**Interfaces:**
- `NO_VOLUME_REASON = 'model has no closed metal volume'`
- `WeightSource = {available: true, volumeMm3, from: 'version'|'result'|'mass'} | {available: false, reason}`
- `pickWeightSource({versionVolumeMm3?, resultVolumeMm3?, resultMassG?, resultDensityGCm3?}: unknown values) → WeightSource`
- `readWeightTarget(raw: unknown) → WeightTarget | null` (snake-case `{grams, tolerance_pct, alloy_id}` in)
- `SentMetal {workflowId, alloyId, densityGCm3, target}`; `MetalWeightInput {key, source, target, requestedAlloyId}`
- `resolveMetalWeight({shownVersion, workflowId, resultVolumeMm3, resultMassG, sent}) → MetalWeightInput`: the run's
  own result (and what was sent with it) applies only when no version is shown or the shown version was made by that run.

- [ ] **Step 1: Failing tests**

```ts
describe('pickWeightSource', () => {
  it('prefers the version volume, then the result volume, then mass ÷ density', () => {
    expect(pickWeightSource({ versionVolumeMm3: 2192.4, resultVolumeMm3: 1 })).toEqual({ available: true, volumeMm3: 2192.4, from: 'version' });
    expect(pickWeightSource({ versionVolumeMm3: null, resultVolumeMm3: 1500 })).toEqual({ available: true, volumeMm3: 1500, from: 'result' });
    const m = pickWeightSource({ resultMassG: 27.975024, resultDensityGCm3: 12.76 });
    expect(m.available && m.from).toBe('mass'); expect(m.available && m.volumeMm3).toBeCloseTo(2192.4, 9);
  });
  it('is not available for missing, zero, negative, non-finite or string volumes', () => {
    for (const v of [undefined, null, 0, -5, NaN, Infinity, '2192.4']) expect(pickWeightSource({ versionVolumeMm3: v })).toEqual({ available: false, reason: NO_VOLUME_REASON });
    expect(pickWeightSource({ resultMassG: 25 })).toEqual({ available: false, reason: NO_VOLUME_REASON }); // mass without density
  });
});
describe('readWeightTarget', () => {
  it('reads grams, tolerance and alloy id', () => { expect(readWeightTarget({ grams: 28, tolerance_pct: 3, alloy_id: 'au14y' })).toEqual({ grams: 28, tolerancePct: 3, alloyId: 'au14y' }); });
  it('defaults tolerance to 5 and a missing alloy to null', () => { expect(readWeightTarget({ grams: 28 })).toEqual({ grams: 28, tolerancePct: 5, alloyId: null }); });
  it('is null without positive grams', () => { for (const r of [null, 'x', {}, { grams: 0 }, { grams: '28' }, { grams: NaN }]) expect(readWeightTarget(r)).toBeNull(); });
});
describe('resolveMetalWeight', () => {
  const sent = { workflowId: 'wf-1', alloyId: 'au10y', densityGCm3: 11.24, target: { grams: 25, tolerancePct: 5, alloyId: 'au10y' } };
  it('uses the shown version and its own target', () => {
    const r = resolveMetalWeight({ shownVersion: { asset_id: 'v1', source_workflow_id: 'wf-1', metal_volume_mm3: 2192.4, weight_target: { grams: 28, tolerance_pct: 5, alloy_id: 'au14y' } }, workflowId: 'wf-1', resultVolumeMm3: null, resultMassG: null, sent });
    expect(r).toEqual({ key: 'v1', source: { available: true, volumeMm3: 2192.4, from: 'version' }, target: { grams: 28, tolerancePct: 5, alloyId: 'au14y' }, requestedAlloyId: 'au10y' });
  });
  it('falls back to this run’s mass and sent density and target', () => {
    const r = resolveMetalWeight({ shownVersion: null, workflowId: 'wf-1', resultVolumeMm3: null, resultMassG: 24.642576, sent });
    expect(r.source.available && r.source.from).toBe('mass'); expect(r.target).toEqual(sent.target); expect(r.key).toBe('wf-1');
  });
  it('never applies a run’s result to a version that run did not make', () => {
    const r = resolveMetalWeight({ shownVersion: { asset_id: 'v0', source_workflow_id: 'wf-0' }, workflowId: 'wf-1', resultVolumeMm3: 1500, resultMassG: 24.6, sent });
    expect(r.source.available).toBe(false); expect(r.target).toBeNull(); expect(r.requestedAlloyId).toBeNull();
  });
  it('ignores what was sent with a different run', () => {
    const r = resolveMetalWeight({ shownVersion: null, workflowId: 'wf-2', resultVolumeMm3: null, resultMassG: 24.6, sent });
    expect(r.source.available).toBe(false);
  });
});
```

- [ ] Steps 2-5: run red, implement (as specified in Interfaces), run green, commit `feat(metal-weight): volume source picker and target reader`.

---

### Task 5: Read `metal_volume_mm3` from result and version payloads

**Files:** Modify `src/lib/ring-cad-nurbs-api.ts` (`RingCadResult`, `parseRingCadResult` ~567-609), `src/lib/cad-result-api.ts`
(`CadModelUrls`, `resolveCadModel`), `src/contexts/GenerationsContext.tsx` (~185, ~742, ~880), `src/lib/cad-versions-api.ts`
(`CadRingVersion`). Tests: `ring-cad-nurbs-api.test.ts`, `cad-result-api.test.ts`, `cad-versions-api.test.ts`.

**Interfaces:** `RingCadResult.metalVolumeMm3: number | null` (finite number or null; validity judged by `pickWeightSource`);
`CadModelUrls.metalVolumeMm3`; `TrackedGeneration.metalVolumeMm3?`; `CadRingVersion.metal_volume_mm3?: number | null`,
`CadRingVersion.weight_target?: {grams?, tolerance_pct?, alloy_id?} | null`.

- [ ] **Step 1: Failing tests**
  - parse: a flat result with `metal_volume_mm3: 2192.4` → `metalVolumeMm3 === 2192.4`; nested under a sink node → found by deep search; absent or `"2192.4"` → `null`.
  - `resolveCadModel` reads it from a normal body; vault fallbacks return `metalVolumeMm3: null` (update the existing `toEqual`).
  - `fetchCadRings` keeps `metal_volume_mm3` and `weight_target` on versions.
- [ ] **Step 2:** run red.
- [ ] **Step 3:** implement: in `parseRingCadResult`
  `const volumeRaw = d.metal_volume_mm3 ?? findKeyDeep(root, (key) => key === 'metal_volume_mm3');`
  `const metalVolumeMm3 = typeof volumeRaw === 'number' && Number.isFinite(volumeRaw) ? volumeRaw : null;`
  and carry it through `resolveCadModel` and both completion paths in `GenerationsContext`.
- [ ] **Step 4:** green. **Step 5: Commit** `feat(metal-weight): read metal_volume_mm3 and weight_target from payloads`.

---

### Task 6: Send `weight_target`; expose `metalWeight` from the workflow hook

**Files:** Modify `src/lib/ring-cad-nurbs-api.ts` (`RingCadStartParams`, `buildRingCadStartBody`), `src/hooks/useImageToCADWorkflow.ts`
(param ~66, state ~110, mirror ~236, restore, start ~668, return). Create `src/lib/metal-weight/request.ts`.
Tests: `ring-cad-nurbs-api.test.ts`, `src/lib/metal-weight/request.test.ts`, `src/hooks/useImageToCADWorkflow.test.tsx`.

**Interfaces:**
- `WeightTargetPayload {grams, tolerance_pct, alloy_id: string|null}` exported from `ring-cad-nurbs-api.ts`; `RingCadStartParams.weightTarget?`.
  Sent only when grams is a positive finite number.
- `request.ts`: `MetalRequest {alloyId: string|null, target: {grams, tolerancePct}|null}`, `EMPTY_METAL_REQUEST`,
  `metalRequestPayload(r) → {material: MetalAlloy|null, weightTarget: WeightTargetPayload|null}` (`alloy_id` = resolved id or null).
- Hook: `WorkflowParams.weightTarget?: WeightTargetPayload | null`; returns `metalWeight: MetalWeightInput`
  computed by `resolveMetalWeight` from the version on screen (same `glb_url === glbUrl` rule as downloads), `sourceWorkflowId`,
  the run's `metalVolumeMm3` / `estimatedMetalMassG`, and a `SentMetal` recorded when the start returns a workflow id.

- [ ] **Step 1: Failing tests**
  - body: `weightTarget: {grams: 28, tolerance_pct: 5, alloy_id: 'au14y'}` → `payload.weight_target` equal; `grams: 0`/`NaN` or absent → no key.
  - request: `metalRequestPayload({alloyId: 'au14y', target: {grams: 28, tolerancePct: 5}})` → material au14y, target with alloy_id 'au14y';
    unknown alloy id → material null, alloy_id null; no target → weightTarget null.
  - hook: start with `material` + `weightTarget` → the POST body carries both; `metalWeight.target` and `requestedAlloyId` reflect them for the run;
    restore with a seed version carrying `metal_volume_mm3: 2192.4` → `metalWeight.source.available` and `key === 'v1'`; without → not available.
- [ ] **Step 2:** red. **Step 3:** implement. **Step 4:** green (whole hook test file).
- [ ] **Step 5: Commit** `feat(metal-weight): send weight_target and expose metal weight inputs from the CAD workflow`.

---

### Task 7: `useMetalChoice`

**Files:** Create `src/hooks/useMetalChoice.ts`, test `useMetalChoice.test.ts`.

**Interfaces:** `METAL_CHOICE_STORAGE_KEY = 'formanova_metal_alloy'`;
`useMetalChoice({key, target, requestedAlloyId}) → {alloy: MetalAlloy, setAlloyId(id), requestedUnavailable: boolean}`.
Order: in-session pick for this key → target alloy → requested alloy → stored last pick → au14y. `setAlloyId` ignores ids not in the table.

- [ ] **Step 1: Failing tests:** defaults to 14K Yellow Gold; target alloy wins over requested; requested wins over stored; stored pick used
  when nothing else; tampered stored value (`'<img onerror=1>'`, `'platinum_cobalt'`) → default; legacy id resolves; `platinum_cobalt` requested →
  default + `requestedUnavailable`; `setAlloyId('au18y')` shows it and stores it, `setAlloyId('bogus')` is ignored; a pick on key A does not
  override the target of key B; `localStorage.getItem/setItem` throwing → still works in memory.
- [ ] Steps 2-5: red, implement (try/catch around storage), green, commit `feat(metal-weight): useMetalChoice`.

---

### Task 8: MetalSelect and WeightBar

**Files:** Create `src/components/metal-weight/types.ts` (`WeightViewProps {source, target, alloy, setAlloyId, requestedUnavailable?}`),
`MetalSelect.tsx` (native grouped `<select>`: keyboard and screen readers for free, works on phones), `WeightBar.tsx`; test `WeightBar.test.tsx`.

**Interfaces:** `MetalSelect({value, onChange(id|null), label, id?, noneLabel?, disabled?, className?})`;
`WeightBar(WeightViewProps & {onAdjust?})`, root `role="group" aria-label="Metal weight"`, wraps (`flex-wrap`, `min-w-0`) so it never overflows 320 px.

- [ ] **Step 1: Failing tests:** shows `27.98 g · 17.99 dwt` for 2192.4 mm³ in 14K Yellow; the "Metal" combobox lists optgroups and every alloy;
  changing it calls `setAlloyId('au18y')`; target on → "On target −0.1%"; off → "21.3% over in 18K Yellow Gold" with Adjust only when
  `onAdjust` is given; not-available → "Weight not available for this model" and "model has no closed metal volume", no "g" figure;
  `requestedUnavailable` → "Requested metal unavailable".
- [ ] Steps 2-5: red, implement, green, commit `feat(metal-weight): weight bar and metal picker`.

---

### Task 9: WeightCard

**Files:** Create `src/components/metal-weight/WeightCard.tsx`, test `WeightCard.test.tsx`.

**Interfaces:** `WeightCard(WeightViewProps)`; collapsible section open by default (`aria-expanded`), big weight, dwt + alloy, "≈ 26.58 g after
finishing (−5%)", "Target 28.00 g ±5% · On target −0.1%", chips for the common 5 (`aria-pressed`), compare table (Metal, g, dwt, Finished) for the
common 5 with "Show all metals" (all 21), the density and its cited source link (`rel="noopener noreferrer"`).

- [ ] **Step 1: Failing tests:** open by default and collapses; numbers above; chip press calls `setAlloyId`; table has 5 rows then 21 after
  "Show all metals"; 18K Yellow row reads 33.96 / 21.84 / 32.26; the source link points at the alloy's `source_url`; not-available state.
- [ ] Steps 2-5: red, implement, green, commit `feat(metal-weight): side-panel weight card with compare table`.

---

### Task 10: WeightTag on history cards

**Files:** Create `src/components/metal-weight/WeightTag.tsx`, test `WeightTag.test.tsx`; modify `src/components/generations/WorkflowCard.tsx`.

**Interfaces:** `WeightTag({source, alloy, className?})` → "28.0 g · 14K" or nothing when not available. WorkflowCard: tag for the version
the card shows (`shownVaultVersion`), alloy from `useMetalChoice({key: asset_id, target: readWeightTarget(weight_target), requestedAlloyId: null})`.

- [ ] Steps: failing tag tests (text, title with full weight, null when unavailable), red, implement, wire, run `WorkflowCard.test.tsx` too, commit
  `feat(metal-weight): weight tag on CAD history cards`.

---

### Task 11: Download menu metal line

**Files:** Modify `CadDownloadMenu.tsx` (prop `estimatedMetalMassG` → `metalWeightLine?: string | null`, line ~286), `CadResultActions.tsx`
(pass-through), pages' call sites (Task 13), test `CadDownloadMenu.test.tsx` (replace the grams-only case).

- [ ] Steps: change the test to expect "Metal: 14K Yellow Gold · Est. 27.98 g · 17.99 dwt" (case kept: "g", not "G"), red, implement, green, commit
  `feat(metal-weight): metal and weight line in the download menu`.

---

### Task 12: MetalWeightStep (request form)

**Files:** Create `src/components/metal-weight/MetalWeightStep.tsx`, test `MetalWeightStep.test.tsx`.

**Interfaces:** `MetalWeightStep({value: MetalRequest, onChange, disabled?})`: grouped metal select with "Not set"; target number with a g/dwt
toggle (`aria-pressed`, converts the shown number, stores grams); tolerance (default 5).

- [ ] **Step 1: Failing tests:** picking 18K sends `{alloyId: 'au18y'}`; typing 28 g sends `{grams: 28, tolerancePct: 5}`; dwt toggle with 20 typed
  sends grams 31.1034768; switching unit converts "28" g to "18.00" dwt; tolerance 3 is sent; clearing the target sends `target: null`;
  `0`, `-2`, `abc` → `target: null`.
- [ ] Steps 2-5, commit `feat(metal-weight): metal and weight step for the request form`.

---

### Task 13: Wire the pages

**Files:** `CadWorkspaceLayout.tsx` (new `viewportFooter?: ReactNode`, rendered under the 3D view inside the viewport column in every mode, so the
canvas never remounts), `ImageToCAD.tsx`, `TextToCAD.tsx`, `ImagePromptScreen.tsx`, `InitialPromptScreen.tsx` (new `metalStep?: ReactNode` slot).
Test: `CadWorkspaceLayout.test.tsx` (footer renders outside `[data-cad-viewport]` in desktop, tablet and phone).

Page wiring (both pages, same lines):

```tsx
const [metalRequest, setMetalRequest] = useState<MetalRequest>(EMPTY_METAL_REQUEST);
const metalPayload = useMemo(() => metalRequestPayload(metalRequest), [metalRequest]);
const workflow = useImageToCADWorkflow({ ..., material: metalPayload.material, weightTarget: metalPayload.weightTarget });
const metal = useMetalChoice(workflow.metalWeight);
const weightView = { source: workflow.metalWeight.source, target: workflow.metalWeight.target, ...metal };
// CadResultActions: metalWeightLine={metalWeightLine(weightView.source, metal.alloy)}
// CadWorkspaceLayout: viewportFooter={showResult && <WeightBar {...weightView} />}
// right={(section) => <div className="flex h-full min-h-0 flex-col">{section !== 'parts' && <WeightCard {...weightView} />}<div className="min-h-0 flex-1"><MeshPanel …/></div></div>}
// prompt screen: metalStep={<MetalWeightStep value={metalRequest} onChange={setMetalRequest} disabled={workflow.isGenerating} />}
```

No Adjust button is wired: Improve takes no note today (`POST /api/cad/versions/{id}/improve` has no body), so a prefilled weight note has nowhere to go.

- [ ] Steps: failing layout test, red, implement, green; typecheck; commit `feat(metal-weight): weight bar, card and metal step on Image and Text to CAD`.

---

### Task 14: Integration test

**Files:** Create `src/components/metal-weight/metal-weight.integration.test.tsx`.

- [ ] A harness renders WeightBar, WeightCard, CadDownloadMenu and WeightTag from one mocked version
  `{asset_id: 'v1', source_workflow_id: 'wf-1', metal_volume_mm3: 2192.4, weight_target: {grams: 28, tolerance_pct: 5, alloy_id: 'au14y'}}`
  through `resolveMetalWeight` + `useMetalChoice`: all four agree on 27.98 g / 14K; switching to 18K in the bar updates the card, the download line
  and the tag (33.96 g, "21.3% over in 18K Yellow Gold"); an old version without volume shows not available everywhere and no download line.
  Request side is covered in Task 6 (hook POST body). Commit `test(metal-weight): result screen integration`.

---

## Verification

`npx vitest run`, `npm run typecheck`, `npm run lint`; dev server + headless browser on `/image-to-cad?workflow_id=…` with every `/api/**`
request answered by the browser script (no prod calls) and a version carrying `metal_volume_mm3: 2192.4`; screenshots at 1440, 1024 and 320 px.

## Self-review

- Spec coverage: 3.1 fallback (Task 4/6), 3.2 (Task 1), 3.3 (Task 6, 12), §4 units (Tasks 1-12), §5 screens (8-13), §6 edge cases (2, 4, 7, 8),
  §7 tests (all + 14). Not covered by design: two-tone note (no body count reaches the frontend), Adjust (no Improve note input).
- Names used across tasks: `findAlloy`, `gramsFromVolume`, `pickWeightSource`, `resolveMetalWeight`, `MetalWeightInput`, `WeightViewProps`,
  `metalWeightLine`, `metalRequestPayload`, `WeightTargetPayload` — consistent.
