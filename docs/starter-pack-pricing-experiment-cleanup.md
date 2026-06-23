# Starter Pack Pricing A/B Experiment — Cleanup Guide

How to cleanly remove the `starter-pack-pricing-experiment` once results are in.
Run **exactly one** of the two code options below (depending on which variant won),
plus the PostHog steps. Do not run both.

## What the experiment is

- **Flag key:** `starter-pack-pricing-experiment`
- **control** = old multi-plan pricing grid
- **treatment** (or flag absent/undefined) = new single-offer $2 Starter Pack page
- **Primary metric:** `starter_pack_purchased`
- **Default-safe:** with the flag missing/disabled, eligible users see the new
  Starter Pack page (current behavior). So removing the flag in PostHog before the
  code cleanup causes no regression — everyone just gets the new page again.

## Files touched by the experiment

| File | What it added |
|------|----------------|
| `src/lib/posthog-events.ts` | `STARTER_PACK_EXPERIMENT_FLAG`, `getStarterPackPricingVariant()`, `onPostHogFlagsLoaded()` |
| `src/lib/posthog-events.test.ts` | tests for the two functions above |
| `src/hooks/use-starter-pack-experiment.ts` | `useStarterPackPricingVariant()` hook (whole file) |
| `src/pages/Credits.tsx` | hook call + variant gating around the starter-page early return |
| `src/pages/Pricing.tsx` | hook call + variant gating around the starter-page early return |

## PostHog steps (both outcomes)

1. PostHog → Experiments → "Starter Pack Purchase Rate" → **Stop / archive**.
2. Optionally disable or delete the feature flag `starter-pack-pricing-experiment`.
   (Disabling is enough; the code cleanup below removes all reads anyway.)

---

## Shared code steps (do these for EITHER outcome)

These remove the experiment plumbing. The only difference between outcomes is what
the page renders for eligible users (Option A vs B below).

1. **Delete the hook file:** `src/hooks/use-starter-pack-experiment.ts`.

2. **`src/lib/posthog-events.ts`** — delete the whole "Starter Pack pricing A/B
   experiment" block: `STARTER_PACK_EXPERIMENT_FLAG`, `getStarterPackPricingVariant`,
   and `onPostHogFlagsLoaded`.

3. **`src/lib/posthog-events.test.ts`** — remove `getStarterPackPricingVariant` and
   `onPostHogFlagsLoaded` from the import block, and delete their two `describe`
   blocks (`describe('getStarterPackPricingVariant', ...)` and
   `describe('onPostHogFlagsLoaded', ...)`).

4. **`src/pages/Credits.tsx` and `src/pages/Pricing.tsx`** — in each:
   - Remove the import: `import { useStarterPackPricingVariant } from '@/hooks/use-starter-pack-experiment';`
   - Remove the hook call line:
     `const { variant: starterPricingVariant, ready: starterPricingReady } = useStarterPackPricingVariant(starterEligible);`
   - Remove the `starterEligible` const if it is no longer used after the option below.
   - Remove the flag-loading spinner branch:
     `if (starterEligible && !starterPricingReady) { return (<Loader2 spinner/>); }`

Then apply Option A or Option B for the early-return itself.

---

## Option A — TREATMENT wins (keep the new Starter Pack page permanently)

In **both** `Credits.tsx` and `Pricing.tsx`, restore the simple eligibility gate so
eligible users always get the Starter Pack page:

Replace:
```tsx
if (starterEligible && starterPricingVariant !== 'control') {
```
with:
```tsx
if (!tiersLoading && starterTier) {
```

(`starterTier` is still declared near the top of each component — keep it.) Eligible
users now always see the Starter Pack page; no flag is read. Done — this is the
current default behavior, made permanent.

---

## Option B — CONTROL wins (revert to the old multi-plan grid permanently)

In **both** `Credits.tsx` and `Pricing.tsx`, delete the entire Starter Pack early
return so eligible users fall through to the normal grid:

Remove the whole block:
```tsx
if (starterEligible && starterPricingVariant !== 'control') {
  return (
    <>
      ...StarterPackPage...
    </>
  );
}
```

Then the normal multi-plan grid (which already renders the starter tier as a card)
shows for everyone. Optional deeper cleanup (only if you want the new page gone for
good):
- Delete `src/components/pricing/StarterPackPage.tsx` and its `src/assets/starter-pack/*` images.
- Remove the `<StarterPackPage>` import + `aboveOffer`/`starterHeading` logic from `Credits.tsx`.
- Note: `Credits.tsx` still uses the insufficient-credits notice + `requiredCredits`
  logic for the door-in flow — keep that; it is independent of this experiment.

---

## Verify (either option)

```bash
npx vitest run        # full suite green
npm run build         # clean
npx eslint src/pages/Credits.tsx src/pages/Pricing.tsx src/lib/posthog-events.ts
```

Confirm no dangling references:
```bash
grep -rn "starter-pack-pricing-experiment\|useStarterPackPricingVariant\|getStarterPackPricingVariant\|onPostHogFlagsLoaded" src/
```
Should return nothing after cleanup.
