# Metal weight: estimate, target and display

Date: 2026-11-02 · Status: approved design, awaiting spec review · Branch: `feat/metal-weight`

## 1. Goal

A jeweller or caster asks two things about any piece: what it is made of, and how much it weighs. FormaNova
should answer both on screen, for every CAD version, in the units the trade uses, and let the user:

- **Before generating:** pick the metal, and optionally set a target weight with a tolerance.
- **After generating:** see the weight of the finished model, switch metals and see the new weight instantly,
  compare all metals at once, and see whether the model is on target.

Success means:

- Weight is visible on the main CAD screen without opening any menu.
- Every number shown comes from a measured model volume and a density with a cited source. Nothing is guessed.
- Switching metal never starts a new run or waits on the server.

## 2. Industry practice this follows

- **Formula:** weight (g) = metal volume (mm³) × alloy density (g/cm³) ÷ 1000. Converting between metals uses
  the ratio of densities (Stuller).
- **Units:** grams and pennyweight. 1 dwt = 1.55517384 g.
- **Finishing loss:** CAD metals tables (for example RhinoArtisan's) show a "processed" weight with about 5%
  removed for finishing and polishing. We show it as "≈ X g after finishing (−5%)".
- **Gems are excluded** from metal weight. Carat weight belongs to the stone list.
- **Sprue and casting-tree allowances** (+15–35%) are for the caster's metal order, not the customer. They are
  out of scope here.

## 3. Where the numbers come from (data flow)

```
Toolkit cad_postprocess ──► Backend (version record) ──► Frontend
  casting_body union          stores metal_volume_mm3       volume × density(alloy) = grams
  volume_mm3 per metal        + target, + chosen alloy      formats g / dwt / finished / target status
```

### 3.1 Volume (the only measured input)

- The toolkit's `casting_body` operation already fuses each metal into one closed solid and reports its
  `volume_mm3` (OCCT union, overlap removed). That is the right volume: it is the metal that gets cast.
- **Toolkit change (small):** add a top-level `metal_volume_mm3` to the automatic postprocess result: the sum of
  the completed casting bodies' `volume_mm3`. Add `metal_volume_source: "casting_body_union"`. It is null when
  the casting body did not complete. This needs no density, so it is always produced, unlike
  `estimated_metal_mass_g`.
- **Backend change:** store `metal_volume_mm3` on the CAD version and return it in `GET /api/cad/models`
  (`CadVersionItem.metal_volume_mm3: number | null`). Hand-built versions uploaded through the admin CAD queue
  take it from an optional upload field, because our packages already measure it.
- **Frontend fallback** for runs that predate the field: if the result has `estimated_metal_mass_g` and the
  density it was computed with, volume = mass × 1000 ÷ density. Otherwise weight is "not available for this
  model". That state is shown on screen, not hidden.

### 3.2 Density (one shared, cited table)

- New module `src/lib/metal-weight/alloys.ts` replaces `CAD_MATERIAL_PROFILES` in `ring-cad-nurbs-api.ts`.
  The old export is kept as a re-export, so the request payload shape is unchanged.
- Each entry: `id`, `label`, `family` (gold / silver / platinum / palladium), `karat`, `colour`,
  `density_g_cm3`, `alloy` (the named alloy the value belongs to), `source_url`.
- **Rule:** an alloy without a cited density is not in the table, so it cannot be selected. No placeholder
  values.
- Target list: Gold 9K/10K/14K/18K in yellow, white and rose; 22K and 24K yellow; Silver 925; Platinum 950;
  Palladium 950. Densities and their sources are in Appendix A.

### 3.3 Target weight

- The request form sends `weight_target: { grams, tolerance_pct, alloy_id }` with the generation request. The
  backend passes it into the build brief and stores it on the run and its versions.
- The frontend computes the status. `deviation = (weight − target) ÷ target`:
  - on target if |deviation| ≤ tolerance;
  - otherwise over or under, by the percentage.
- The target is in the chosen alloy. When the user previews another alloy, the status compares that alloy's
  weight against the same gram target and says so ("in 14K Yellow Gold"). Metal changes weight, and that is
  exactly what the user wants to see.

## 4. Frontend units (each small, single-purpose, tested alone)

| Unit | File | Does | Depends on |
|---|---|---|---|
| Alloy table | `lib/metal-weight/alloys.ts` | cited densities, lookup by id, the common-5 list | – |
| Weight maths | `lib/metal-weight/weight.ts` | `gramsFromVolume`, `dwtFromGrams`, `finishedGrams`, `volumeFromMass`, `targetStatus` | alloys |
| Formatting | `lib/metal-weight/format.ts` | "25.37 g · 16.31 dwt", "+1.5%", fixed decimals | weight |
| Version weight source | `lib/metal-weight/source.ts` | picks volume from version → result fallback → none, with the reason | – |
| Metal preference | `hooks/useMetalChoice.ts` | the alloy shown per version: target alloy → requested alloy → user's last pick; stored in localStorage (wrapped in try/catch) | alloys |
| Weight bar | `components/metal-weight/WeightBar.tsx` | always-visible strip under the 3D viewer: weight, metal picker, target badge | maths, format |
| Weight card | `components/metal-weight/WeightCard.tsx` | side-panel card: big weight, finished weight, target, metal chips, compare table (common 5, "Show all metals") | maths, format |
| Weight tag | `components/metal-weight/WeightTag.tsx` | "25.4 g · 10K" on version and history cards | maths, format |
| Metal & weight step | `components/metal-weight/MetalWeightStep.tsx` | request-form inputs: alloy select (grouped), target with g/dwt toggle, tolerance (default 5%) | alloys |
| Download line | `CadDownloadMenu.tsx` (edit) | "Metal: 10K Yellow Gold · Est. 25.37 g · 16.31 dwt", replacing today's grams-only line | format |

Wiring: `ImageToCAD.tsx`, `TextToCAD.tsx` and the CAD-to-Catalog viewer render WeightBar and WeightCard;
`WorkflowCard.tsx` renders WeightTag; the request forms render MetalWeightStep and pass `material` and
`weight_target` through `useImageToCADWorkflow`.

## 5. Screens

**Viewer weight bar (always visible):**
`⚖ 25.37 g · 16.31 dwt   10K Yellow Gold ▾   ✓ On target +1.5%`. Off target turns amber:
`⚠ 14.6% over` with **Adjust**, which opens Improve with a prefilled weight note.

**Side-panel weight card (open by default):** weight; "≈ 24.10 g after finishing (−5%)"; the target line;
chips for the 5 common metals; a compare table (metal, g, dwt, finished) for those 5, with "Show all metals".

**Version and history cards:** a small "25.4 g · 10K" tag.

**Request form, "Metal & weight" step:** a grouped alloy select; an optional target with a g/dwt toggle; a
tolerance (default ±5%).

**Download menu:** the metal and weight line above the file list.

**Not available:** the bar reads "Weight not available for this model" with a short reason ("model has no
closed metal volume"). It never shows a number it can't stand behind.

## 6. Edge cases and errors

- Volume missing, zero, negative or non-finite → not available. Never NaN or 0 g.
- Unknown alloy id (old run, removed alloy) → fall back to the default display alloy and show "requested metal
  unavailable".
- Two-tone pieces (more than one casting body) → v1 shows the total in the chosen alloy and a "two-tone" note.
  Per-metal weights are a later step.
- A target without an alloy → the status uses the displayed alloy.
- localStorage unavailable → in-memory choice only. The page still works.
- Rounding: grams 2 dp, dwt 2 dp, percent 1 dp. The maths runs on unrounded values.

## 7. Testing (TDD)

- **Unit:** maths (known volume × density pairs, dwt constant, finishing, the target status boundaries at
  exactly ±tolerance, invalid inputs); alloy table integrity (every entry has a density in a sane range, 8–22,
  and a source URL; ids unique; the common-5 ids exist); the source picker; formatting.
- **Component:** WeightBar, WeightCard, WeightTag and MetalWeightStep render the right numbers, switch alloy,
  show the not-available state, and keyboard and ARIA work for the picker.
- **Integration:** the result page with a mocked version payload carrying `metal_volume_mm3` → bar, card,
  download line and tag all agree; the request form sends `material` and `weight_target` in the payload; an
  old run without volume shows not available.
- After the feature: a points-only break-it review (bad payloads, extreme values, injection in labels,
  localStorage tampering), plus a scope-of-improvement list.

## 8. Out of scope (v1)

Per-metal weights for two-tone pieces, prices and live metal prices, sprue allowance and caster views, wax
weight, and putting the weight in the toolkit's spec sheet PDF. Each can follow once v1 is live.

## 9. Delivery order

1. Frontend (this repo): units + screens, working today from the fallback, and immediately from
   `metal_volume_mm3` once present. It is safe to ship first: no volume means "not available".
2. Toolkit: `metal_volume_mm3` in the postprocess result (small PR, with tests).
3. Backend handoff: store and return `metal_volume_mm3`; accept and store `weight_target`; admin upload field.

## Appendix A: alloy densities

Decisions (owner, 2026-11-02):
- Source: UPMR named casting alloys first. Cookson fills 9K, and Stuller's chart covers fine gold and sterling.
- White gold: both families, labelled "(nickel)" and "(palladium)". Nickel is the default White chip.
- Pt950/Co is left out until a supplier confirms its density. Published values conflict: 20.80 vs 20.1.

Every value was read from the source document. UPMR densities are for the finished karat alloy.

| id | Label | g/cm³ | Named alloy | Source |
|---|---|---|---|---|
| au9y | 9K Yellow Gold | 11.1 | Cookson 9ct CY | https://www.cooksongold.com/downloads/files/bullion/9ctCY_properties_sheet.pdf |
| au9w | 9K White Gold | 11.9 | Cookson 9ct WM (silver-based white) | https://www.cooksongold.com/downloads/files/bullion/9ctWM_properties_sheet.pdf |
| au9r | 9K Rose Gold | 11.1 | Cookson 9ct MR (5N red) | https://www.cooksongold.com/downloads/files/bullion/9ctMR_properties_sheet.pdf |
| au10y | 10K Yellow Gold | 11.24 | UPMR 204 Standard Yellow | https://www.unitedpmr.com/wp-content/uploads/2021/07/204.pdf |
| au10w | 10K White Gold (nickel) | 11.0 | UPMR 900 Premium White | https://www.unitedpmr.com/wp-content/uploads/2021/11/900.pdf |
| au10wpd | 10K White Gold (palladium) | 12.7 | UPMR PD1 | https://www.unitedpmr.com/wp-content/uploads/2021/10/PD1.pdf |
| au10r | 10K Rose Gold | 11.68 | UPMR 520 Russian Red | https://www.unitedpmr.com/wp-content/uploads/2021/10/520.pdf |
| au14y | 14K Yellow Gold | 12.76 | UPMR 204 Standard Yellow | https://www.unitedpmr.com/wp-content/uploads/2021/07/204.pdf |
| au14w | 14K White Gold (nickel) | 12.55 | UPMR 900 Premium White | https://www.unitedpmr.com/wp-content/uploads/2021/11/900.pdf |
| au14wpd | 14K White Gold (palladium) | 14.08 | UPMR PD1 | https://www.unitedpmr.com/wp-content/uploads/2021/10/PD1.pdf |
| au14r | 14K Rose Gold | 13.16 | UPMR 520 Russian Red | https://www.unitedpmr.com/wp-content/uploads/2021/10/520.pdf |
| au18y | 18K Yellow Gold | 15.49 | UPMR 713 Bright Yellow | https://www.unitedpmr.com/wp-content/uploads/2021/10/713.pdf |
| au18w | 18K White Gold (nickel) | 14.59 | UPMR 900 Premium White | https://www.unitedpmr.com/wp-content/uploads/2021/11/900.pdf |
| au18wpd | 18K White Gold (palladium) | 15.84 | UPMR PD2 Vanilla White | https://www.unitedpmr.com/wp-content/uploads/2026/08/Alloy-PD-2.pdf |
| au18r | 18K Rose Gold | 15.09 | UPMR 520 Russian Red | https://www.unitedpmr.com/wp-content/uploads/2021/10/520.pdf |
| au22y | 22K Yellow Gold | 17.55 | UPMR 821 | https://www.unitedpmr.com/wp-content/uploads/2021/10/821.pdf |
| au24 | 24K Fine Gold | 19.32 | Pure gold | https://www.stuller.com/articles/view/specific-gravity-melting-point-or-various-metals-and-alloys/ |
| ag925 | Sterling Silver 925 | 10.36 | Sterling (Ag/Cu) | https://www.stuller.com/articles/view/specific-gravity-melting-point-or-various-metals-and-alloys/ |
| pt950ru | Platinum 950 (ruthenium) | 20.70 | UPMR 95% Pt / 5% Ru | https://www.unitedpmr.com/wp-content/uploads/2024/06/PT95RUTH.pdf |
| pt950ir | Platinum 950 (iridium) | 21.50 | 5% iridium platinum | https://www.stuller.com/articles/view/specific-gravity-melting-point-or-various-metals-and-alloys/ |
| pd950 | Palladium 950 | 12.10 | UPMR PD950-GR7 | https://unitedpmr.com/wp-content/uploads/2024/07/PD950GR7.pdf |

The common-5 chips are au10y, au14y, au18y, ag925 and pt950ru. Note that the old profile ids
(`14k_yellow_gold` and the rest) must keep resolving, because they are already sent in requests. They are
mapped to the new entries, and `platinum_cobalt` maps to "unavailable".
