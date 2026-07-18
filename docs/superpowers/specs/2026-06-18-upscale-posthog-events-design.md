# Upscale PostHog Events — Design

**Date:** 2026-06-18
**Status:** Approved (pending spec review)

## Problem

Post-generation upscaling shipped (PRs #74, #75) with no PostHog instrumentation.
Upscaling is a paid, dynamically-priced action — credit cost varies by the source
image's resolution tier (1K/2K/4K) and the chosen integer multiplier (x2–x9) — but
none of that is captured. We cannot answer: how often is upscale used, at which
tiers/factors, how much revenue it drives, or where users hit the paywall.

Today the upscale flow only emits the *generic* events shared with normal
generations:
- Studio inline upscale completion fires `generation_completed`
  (`useStudioGeneration.ts:210`).
- Studio inline upscale paywall fires `paywall_hit`
  (`useStudioGeneration.ts:481`).
- The history-card path (`useUpscaleLauncher.ts`) fires nothing upscale-specific.

So upscales are invisible as a distinct action and impossible to segment by
tier/factor/cost.

## Goal

Add three dedicated, typed PostHog events covering both upscale entry points, with
the dimensions needed to analyze the upscale funnel and its revenue.

## Non-Goals

- Do **not** modify or remove existing events. `generation_completed` and
  `paywall_hit` keep firing for upscale exactly as they do today. Upscale
  completions/paywalls will emit **both** the generic event and the new dedicated
  event — this is intentional and benign (different event names, no query
  double-counts).
- No `generation_type` discriminator on existing events (rejected: would require
  widening existing event payloads, which we explicitly avoid).
- No new UI, no backend changes. The dynamic pricing policy
  (`upscale_resolution_tiers_v1`) is already live in production.

## Events

All three are dedicated, additive events.

### `upscale_started`
Fired after credit approval succeeds **and** `startUpscale()` returns a
`workflow_id` (i.e. the job is genuinely submitted). No existing event fires on
upscale start, so this is the sole signal for that step.

| Property | Type | Source |
|---|---|---|
| `source_tier` | `'1K' \| '2K' \| '4K'` | `resolution` arg |
| `factor` | `number` (2–9) | `factor` arg |
| `credits_cost` | `number` | `estimateUpscaleCostCached({ resolution, factor })` |
| `category` | `string` (singular) | `TO_SINGULAR[jewelryType] ?? jewelryType` |
| `is_product_shot` | `boolean` | `isProductShot` |
| `surface` | `'studio' \| 'history'` | hard-coded per call site |

### `upscale_completed`
Fired when the tracked upscale generation transitions to `completed` in the
relevant completion effect. Coexists with the existing `generation_completed`
(studio path only — the history path does not fire `generation_completed`).

Same six properties as `upscale_started`, carried from launch time via refs
(`upscaleCostRef`, plus tier/factor/category/surface captured at start). No new
data sources are read at completion time.

### `upscale_paywall_hit`
Fired when `checkCredits('upscale_image', …)` returns false. Coexists with the
existing generic `trackPaywallHit` in the studio path (which stays).

| Property | Type | Source |
|---|---|---|
| `source_tier` | `'1K' \| '2K' \| '4K'` | `resolution` arg |
| `factor` | `number` (2–9) | `factor` arg |
| `credits_cost` | `number` | `estimateUpscaleCostCached({ resolution, factor })` |
| `category` | `string` (singular) | `TO_SINGULAR[jewelryType] ?? jewelryType` |
| `surface` | `'studio' \| 'history'` | hard-coded per call site |

## `credits_cost` source — `estimateUpscaleCostCached`

`credits_cost` is the **quoted hold price at launch**, not a settled post-run
charge. It is read from `estimateUpscaleCostCached({ resolution, factor })`
(`upscale-api.ts`). This is the right source because:

1. **Authoritative.** It calls `/api/credits/estimate`, which resolves against the
   live `upscale_resolution_tiers_v1` pricing policy and returns the matched
   `cost` as `projected_max_hold`. The request shape already matches the policy's
   `when` conditions (`image_size: '1k'|'2k'|'4k'`, integer `factor`).
2. **Already warm.** `UpscaleControl.tsx:115` calls the same cached function to
   render the price the user sees before clicking. At launch the cache is hot for
   the selected factor, so re-reading returns the exact number shown to the user
   with ~zero latency.
3. **Never empty.** `estimateUpscaleCost` falls back to `fallbackUpscalePrice`
   (the in-code mirror of the server policy) on any network failure, so
   `credits_cost` is non-null whenever the (tier, factor) pair is valid.

`startResponse.projected_cost` was considered and rejected: it is typed optional,
is never read anywhere else in the codebase (so nothing proves the backend
populates it), and offers no accuracy advantage over the estimate.

Both call sites are already inside `async` functions (they `await checkCredits`),
so `await`-ing one cached estimate at launch is free and identical across paths.

## Two entry points (both instrumented)

| Surface | File | `surface` value |
|---|---|---|
| Studio inline upscale | `src/hooks/useStudioGeneration.ts` (`handleUpscale` + upscale completion effect) | `'studio'` |
| History-card upscale | `src/hooks/useUpscaleLauncher.ts` (`launch` + completion effect) | `'history'` |

### Studio path notes (`useStudioGeneration.ts`)
- This is the large, central generation hook. Changes are surgical and confined to
  `handleUpscale` (start + paywall) and the existing upscale completion effect.
- The existing `trackGenerationComplete` (line ~210) and `trackPaywallHit`
  (line ~481) calls are **left untouched**; the new upscale events are added
  alongside them.
- The tracked generation's `generationCost` field holds the *original*
  generation's cost, not the upscale's. The upscale `credits_cost` must therefore
  be captured into a dedicated `upscaleCostRef` at launch and read in the
  completion effect — do **not** reuse `generationCost`.

### History path notes (`useUpscaleLauncher.ts`)
- Standalone launcher used by history cards. Add `upscale_started` /
  `upscale_paywall_hit` in `launch`, and `upscale_completed` in the existing
  completion effect (the `tracked.status === 'completed'` branch).
- Carry tier/factor/category/cost/surface from `launch` into the completion effect
  via refs (mirrors the existing `onCompletedRef` pattern already in the file).

## Implementation in `posthog-events.ts`

Add three exported, typed functions following the established single-file pattern:

```ts
export interface UpscaleStartedProps {
  source_tier: string;
  factor: number;
  credits_cost: number;
  category: string;
  is_product_shot: boolean;
  surface: 'studio' | 'history';
}
export function trackUpscaleStarted(props: UpscaleStartedProps) {
  capture('upscale_started', { ...props });
}

export interface UpscaleCompletedProps {
  source_tier: string;
  factor: number;
  credits_cost: number;
  category: string;
  is_product_shot: boolean;
  surface: 'studio' | 'history';
}
export function trackUpscaleCompleted(props: UpscaleCompletedProps) {
  capture('upscale_completed', { ...props });
}

export interface UpscalePaywallHitProps {
  source_tier: string;
  factor: number;
  credits_cost: number;
  category: string;
  surface: 'studio' | 'history';
}
export function trackUpscalePaywallHit(props: UpscalePaywallHitProps) {
  capture('upscale_paywall_hit', { ...props });
}
```

## Testing (TDD — tests first, per CLAUDE.md)

Add to `src/lib/posthog-events.test.ts` **before** implementing the functions:
- `trackUpscaleStarted` captures `upscale_started` with the full prop shape.
- `trackUpscaleCompleted` captures `upscale_completed` with the full prop shape.
- `trackUpscalePaywallHit` captures `upscale_paywall_hit` with the full prop shape.
- Each respects the existing `__loaded` guard (no capture when not loaded) — at
  least one of the three covers this, consistent with the existing suite style.

`category` values must be singular (use `TO_SINGULAR[...] ?? ...` at every call
site that receives a `jewelryType` from a URL/param), per the PostHog rules in
CLAUDE.md.

Run: `npx vitest run src/lib/posthog-events.test.ts` (existing 20 tests stay
green; new tests added).

## Files touched

| File | Change |
|---|---|
| `src/lib/posthog-events.ts` | Add 3 functions + 3 props interfaces |
| `src/lib/posthog-events.test.ts` | Add tests first (TDD) |
| `src/hooks/useUpscaleLauncher.ts` | Fire all 3 events; carry props via refs |
| `src/hooks/useStudioGeneration.ts` | Fire all 3 events; add `upscaleCostRef`; existing events untouched |

## Risks

- **Blast radius in `useStudioGeneration.ts`** — central revenue path. Mitigation:
  additive-only changes, no edits to existing event calls or generation logic.
- **`credits_cost` accuracy** — it is the quoted hold, not the settled charge.
  Accepted and documented; correct for funnel analytics.
- **Event volume** — upscale completions/paywalls emit two events. Accepted;
  upscale is low-frequency relative to generations.
