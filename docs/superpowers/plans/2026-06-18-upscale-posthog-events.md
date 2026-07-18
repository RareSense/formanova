# Upscale PostHog Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three dedicated PostHog events (`upscale_started`, `upscale_completed`, `upscale_paywall_hit`) covering both upscale entry points, with source-tier / factor / credits-cost dimensions.

**Architecture:** Three typed `track*` functions are added to the single-file event API (`src/lib/posthog-events.ts`), TDD'd in `posthog-events.test.ts`. They are then called from the two upscale code paths: the history-card launcher (`useUpscaleLauncher.ts`) and the studio inline path (`useStudioGeneration.ts`). All changes are **additive** — no existing event call is modified or removed.

**Tech Stack:** React + TypeScript, Vitest, posthog-js (accessed only through `posthog-events.ts`).

**Spec:** `docs/superpowers/specs/2026-06-18-upscale-posthog-events-design.md`

## Global Constraints

- **Never import `posthog-js` directly** in pages/hooks/components. Import `track*` functions from `@/lib/posthog-events` only. An ESLint rule fails the build otherwise.
- **`category` must be singular.** Always pass `TO_SINGULAR[jewelryType] ?? jewelryType` (from `@/lib/jewelry-utils`). `TO_SINGULAR` is idempotent for already-singular values, so applying it twice is safe.
- **Do not modify or remove existing event calls.** `trackGenerationComplete` (`useStudioGeneration.ts`) and `trackPaywallHit` (`useStudioGeneration.ts`) keep firing for upscale exactly as today. New upscale events fire *alongside* them.
- **`credits_cost` source is `estimateUpscaleCostCached({ resolution, factor })`** from `@/lib/upscale-api` — the quoted hold price at launch. It returns `number | null`; coalesce null to `0`. Never reuse the tracked generation's `generationCost` (that is the *original* generation's cost, not the upscale's).
- **`surface`** is a hard-coded literal per call site: `'history'` in `useUpscaleLauncher.ts`, `'studio'` in `useStudioGeneration.ts`.
- **Existing test suite must stay green:** `npx vitest run src/lib/posthog-events.test.ts` (20 tests today → 23 after this plan).
- The dynamic pricing policy (`upscale_resolution_tiers_v1`) and backend are already live; **no backend changes**.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/lib/posthog-events.ts` | Single-file event API | Add 3 props interfaces + 3 `track*` functions |
| `src/lib/posthog-events.test.ts` | Event API tests | Add imports + 3 `describe` blocks (TDD, first) |
| `src/hooks/useUpscaleLauncher.ts` | History-card upscale launcher (`surface: 'history'`) | Fire all 3 events; carry props via a ref |
| `src/hooks/useStudioGeneration.ts` | Studio inline upscale (`surface: 'studio'`) | Fire all 3 events; add `upscalePropsRef`; existing events untouched |

---

## Task 1: Add the three event functions (TDD)

**Files:**
- Modify: `src/lib/posthog-events.ts` (append after `trackAIFixSubmitted`, currently end of file ~line 365)
- Test: `src/lib/posthog-events.test.ts` (add imports at the import block ~lines 9-35; add `describe` blocks at end of file ~line 488)

**Interfaces:**
- Produces (consumed by Tasks 2 and 3):
  - `trackUpscaleStarted(props: UpscaleStartedProps): void`
  - `trackUpscaleCompleted(props: UpscaleCompletedProps): void`
  - `trackUpscalePaywallHit(props: UpscalePaywallHitProps): void`
  - ```ts
    interface UpscaleStartedProps   { source_tier: string; factor: number; credits_cost: number; category: string; is_product_shot: boolean; surface: 'studio' | 'history'; }
    interface UpscaleCompletedProps { source_tier: string; factor: number; credits_cost: number; category: string; is_product_shot: boolean; surface: 'studio' | 'history'; }
    interface UpscalePaywallHitProps { source_tier: string; factor: number; credits_cost: number; category: string; surface: 'studio' | 'history'; }
    ```

- [ ] **Step 1: Write the failing tests**

In `src/lib/posthog-events.test.ts`, add the three new function names to the existing import statement (the block importing from `'./posthog-events'`, ~lines 9-35). Add these lines inside that import block (e.g. right after `trackAIFixSubmitted,`):

```ts
  trackUpscaleStarted,
  trackUpscaleCompleted,
  trackUpscalePaywallHit,
```

Then append these `describe` blocks at the very end of the file (after the `setUserProfession` describe block, ~line 487):

```ts
// ── Upscale events ──────────────────────────────────────────────────

describe('trackUpscaleStarted', () => {
  it('captures upscale_started with the full prop shape', () => {
    trackUpscaleStarted({
      source_tier: '2K',
      factor: 3,
      credits_cost: 20,
      category: 'ring',
      is_product_shot: true,
      surface: 'studio',
    })
    expect(posthog.capture).toHaveBeenCalledWith('upscale_started', {
      source_tier: '2K',
      factor: 3,
      credits_cost: 20,
      category: 'ring',
      is_product_shot: true,
      surface: 'studio',
    })
  })

  it('does not capture when __loaded is false', () => {
    ;(posthog as any).__loaded = false
    trackUpscaleStarted({
      source_tier: '1K', factor: 2, credits_cost: 6, category: 'ring',
      is_product_shot: false, surface: 'history',
    })
    expect(posthog.capture).not.toHaveBeenCalled()
    ;(posthog as any).__loaded = true
  })
})

describe('trackUpscaleCompleted', () => {
  it('captures upscale_completed with the full prop shape', () => {
    trackUpscaleCompleted({
      source_tier: '1K',
      factor: 4,
      credits_cost: 12,
      category: 'necklace',
      is_product_shot: false,
      surface: 'history',
    })
    expect(posthog.capture).toHaveBeenCalledWith('upscale_completed', {
      source_tier: '1K',
      factor: 4,
      credits_cost: 12,
      category: 'necklace',
      is_product_shot: false,
      surface: 'history',
    })
  })
})

describe('trackUpscalePaywallHit', () => {
  it('captures upscale_paywall_hit with the full prop shape', () => {
    trackUpscalePaywallHit({
      source_tier: '4K',
      factor: 2,
      credits_cost: 40,
      category: 'earring',
      surface: 'studio',
    })
    expect(posthog.capture).toHaveBeenCalledWith('upscale_paywall_hit', {
      source_tier: '4K',
      factor: 2,
      credits_cost: 40,
      category: 'earring',
      surface: 'studio',
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/posthog-events.test.ts`
Expected: FAIL — the import of `trackUpscaleStarted` / `trackUpscaleCompleted` / `trackUpscalePaywallHit` is undefined (module has no such exports).

- [ ] **Step 3: Implement the three functions**

In `src/lib/posthog-events.ts`, append at the end of the file (after the `trackAIFixSubmitted` function, ~line 365):

```ts

// ═══════ Upscale Events ══════════════════════════════════════════════

export interface UpscaleStartedProps {
  /** Source image tier that drives billing: '1K' | '2K' | '4K'. */
  source_tier: string;
  /** Integer multiplier the user chose (2-9). */
  factor: number;
  /** Quoted hold price at launch (from estimateUpscaleCostCached), not a settled charge. */
  credits_cost: number;
  /** Singular jewelry category. */
  category: string;
  is_product_shot: boolean;
  /** Where the upscale was launched from. */
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/posthog-events.test.ts`
Expected: PASS — 23 tests pass (20 existing + 3 new describe blocks).

- [ ] **Step 5: Commit**

```bash
git add src/lib/posthog-events.ts src/lib/posthog-events.test.ts
git commit -m "feat: add upscale PostHog event functions (TDD)

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Task 2: Instrument the history-card path (`useUpscaleLauncher.ts`)

**Files:**
- Modify: `src/hooks/useUpscaleLauncher.ts`

**Interfaces:**
- Consumes from Task 1: `trackUpscaleStarted`, `trackUpscaleCompleted`, `trackUpscalePaywallHit` and their prop types.
- Consumes from existing code: `estimateUpscaleCostCached` (`@/lib/upscale-api`), `TO_SINGULAR` (`@/lib/jewelry-utils`).

**Context — current file shape (for reference):**
- Imports are at lines 10-15. `launch` is a `useCallback` at lines 75-123. The completion effect is at lines 54-73 (`if (tracked.status === 'completed') { ... }`). `launch` receives `{ imageUri, resolution, factor, isProductShot, jewelryType, onCompleted }`. `resolution` is of type `Resolution` (`'1K' | '2K' | '4K'`).

- [ ] **Step 1: Add imports**

In `src/hooks/useUpscaleLauncher.ts`, change the existing import of `startUpscale` (line 14) to also pull in `estimateUpscaleCostCached`, and add two new imports below it. The import block (lines 10-15) becomes:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { useGenerations } from '@/contexts/GenerationsContext';
import { useCreditPreflight } from '@/hooks/use-credit-preflight';
import { markGenerationStarted } from '@/lib/generation-lifecycle';
import { startUpscale, tierForUpscale, estimateUpscaleCostCached, UPSCALE_POLL_TIMEOUT_MS } from '@/lib/upscale-api';
import { TO_SINGULAR } from '@/lib/jewelry-utils';
import { trackUpscaleStarted, trackUpscaleCompleted, trackUpscalePaywallHit } from '@/lib/posthog-events';
import type { Resolution } from '@/components/studio/OutputSettingsPills';
```

- [ ] **Step 2: Add a ref to carry the completion-event props**

In `useUpscaleLauncher`, find the existing `onCompletedRef` declaration (line 49):

```ts
  const onCompletedRef = useRef<(() => void) | undefined>(undefined);
```

Add a second ref directly after it:

```ts
  // Props captured at launch so the completion effect can emit upscale_completed
  // with the upscale's OWN dimensions (never the tracked generation's cost).
  const completedPropsRef = useRef<{
    source_tier: Resolution;
    factor: number;
    credits_cost: number;
    category: string;
    is_product_shot: boolean;
  } | null>(null);
```

- [ ] **Step 3: Fire `upscale_completed` in the completion effect**

Find the completed branch of the completion effect (lines 56-60):

```ts
    if (tracked.status === 'completed') {
      setStatus('completed');
      onCompletedRef.current?.();
      clearGeneration(activeId);
      setActiveId(null);
    } else if (tracked.status === 'failed') {
```

Replace it with (adds the `trackUpscaleCompleted` call, guarded by the ref):

```ts
    if (tracked.status === 'completed') {
      setStatus('completed');
      if (completedPropsRef.current) {
        trackUpscaleCompleted({ ...completedPropsRef.current, surface: 'history' });
      }
      onCompletedRef.current?.();
      clearGeneration(activeId);
      setActiveId(null);
    } else if (tracked.status === 'failed') {
```

- [ ] **Step 4: Fire `upscale_paywall_hit` and `upscale_started` in `launch`**

Find the body of `launch` from the `setStatus('starting')` line through the `trackGeneration({...})` call (lines 85-118):

```ts
    setStatus('starting');
    setError(null);

    const approved = await checkCredits('upscale_image', 1, {
      pricingContext: { image_size: tierForUpscale(resolution), factor },
    });
    if (!approved) {
      setStatus('idle');
      return;
    }

    try {
      const res = await startUpscale({
        imageUri,
        factor,
        resolution,
        idempotency_key: `upscale-${Date.now()}-${jewelryType}`,
      });
      const id = res.workflow_id;
      onCompletedRef.current = onCompleted;
      setActiveId(id);
      setStatus('processing');
      trackGeneration({
        workflowId: id,
        isProductShot,
        jewelryType,
        jewelryUrl: '',
        modelUrl: imageUri,
        aspectRatio: '',
        resolution,
        generationCost: null,
        timeoutMs: UPSCALE_POLL_TIMEOUT_MS,
      });
      markGenerationStarted(id);
    } catch {
```

Replace that span with (adds cost lookup, singular category, paywall event, started event, and the ref capture):

```ts
    setStatus('starting');
    setError(null);

    // Quoted hold price at launch (policy-driven, cache is warm from UpscaleControl).
    const credits_cost = (await estimateUpscaleCostCached({ resolution, factor })) ?? 0;
    const category = TO_SINGULAR[jewelryType] ?? jewelryType;

    const approved = await checkCredits('upscale_image', 1, {
      pricingContext: { image_size: tierForUpscale(resolution), factor },
    });
    if (!approved) {
      trackUpscalePaywallHit({ source_tier: resolution, factor, credits_cost, category, surface: 'history' });
      setStatus('idle');
      return;
    }

    try {
      const res = await startUpscale({
        imageUri,
        factor,
        resolution,
        idempotency_key: `upscale-${Date.now()}-${jewelryType}`,
      });
      const id = res.workflow_id;
      onCompletedRef.current = onCompleted;
      completedPropsRef.current = {
        source_tier: resolution, factor, credits_cost, category, is_product_shot: isProductShot,
      };
      trackUpscaleStarted({
        source_tier: resolution, factor, credits_cost, category,
        is_product_shot: isProductShot, surface: 'history',
      });
      setActiveId(id);
      setStatus('processing');
      trackGeneration({
        workflowId: id,
        isProductShot,
        jewelryType,
        jewelryUrl: '',
        modelUrl: imageUri,
        aspectRatio: '',
        resolution,
        generationCost: null,
        timeoutMs: UPSCALE_POLL_TIMEOUT_MS,
      });
      markGenerationStarted(id);
    } catch {
```

- [ ] **Step 5: Verify lint and types**

Run: `npm run lint`
Expected: PASS — no `posthog-js` direct-import violation (we import from `@/lib/posthog-events`), no unused-var errors.

Run: `npx vitest run src/lib/posthog-events.test.ts`
Expected: PASS — 23 tests still green.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useUpscaleLauncher.ts
git commit -m "feat: track upscale events from history-card launcher

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Task 3: Instrument the studio inline path (`useStudioGeneration.ts`)

**Files:**
- Modify: `src/hooks/useStudioGeneration.ts`

**Interfaces:**
- Consumes from Task 1: `trackUpscaleStarted`, `trackUpscaleCompleted`, `trackUpscalePaywallHit`.
- Consumes from existing code: `estimateUpscaleCostCached` (`@/lib/upscale-api`), `TO_SINGULAR` (already imported), `isProductShot` and `effectiveJewelryType` (hook params), `useRef` (already imported).

**Context — current file shape (for reference):**
- posthog imports are at lines 60-65; the upscale-api import is line 54. `isProductShot` / `effectiveJewelryType` are destructured hook params (lines 98-99). Upscale state is declared at lines 126-128. The upscale completion effect is at lines 205-233 (completed branch 207-221, which already calls `trackGenerationComplete`). `handleUpscale` is at lines 456-532: it computes `upscaleResolution` (461), `category` (485), calls `checkCredits` (475) with a `!hasCredits` branch (478-483) that already fires `trackPaywallHit`, then `startUpscale` (488) and `trackGeneration` (511).

- [ ] **Step 1: Add imports**

In `src/hooks/useStudioGeneration.ts`, update the upscale-api import (line 54) to add `estimateUpscaleCostCached`:

```ts
import { startUpscale, tierForUpscale, estimateUpscaleCostCached, UPSCALE_POLL_TIMEOUT_MS } from '@/lib/upscale-api';
```

Then update the posthog-events import block (lines 60-65) to add the three new functions:

```ts
import {
  trackPaywallHit,
  trackGenerationComplete,
  trackAIFixSubmitted,
  consumeFirstGeneration,
  trackUpscaleStarted,
  trackUpscaleCompleted,
  trackUpscalePaywallHit,
} from '@/lib/posthog-events';
```

- [ ] **Step 2: Add a ref to carry the completion-event props**

Find the upscale state declarations (lines 126-128):

```ts
  const [upscaleStatus, setUpscaleStatus] = useState<'idle' | 'starting' | 'processing' | 'completed' | 'error'>('idle');
  const [upscaleError, setUpscaleError] = useState<string | null>(null);
  const [activeUpscaleId, setActiveUpscaleId] = useState<string | null>(null);
```

Add a ref directly after line 128:

```ts
  // Captured at launch so the upscale completion effect emits the upscale's OWN
  // cost/tier/factor — NOT the tracked generation's generationCost (original gen).
  const upscalePropsRef = useRef<{
    source_tier: Resolution;
    factor: number;
    credits_cost: number;
    category: string;
  } | null>(null);
```

- [ ] **Step 3: Fire `upscale_completed` in the completion effect**

Find the completed branch of the upscale completion effect (lines 207-221):

```ts
    if (upscaleGeneration.status === 'completed') {
      setResultImages(upscaleGeneration.resultImages);
      setUpscaleStatus('completed');
      trackGenerationComplete({
        source: 'unified-studio',
        category: TO_SINGULAR[effectiveJewelryType] ?? effectiveJewelryType,
        upload_type: null,
        duration_ms: Date.now() - (upscaleGeneration.startedAt ?? Date.now()),
        is_first_ever: false,
        aspect_ratio: upscaleGeneration.aspectRatio,
        resolution: upscaleGeneration.resolution,
      });
      clearGeneration(activeUpscaleId!);
      setActiveUpscaleId(null);
    }
```

Replace it with (keeps the existing `trackGenerationComplete` untouched, adds `trackUpscaleCompleted` after it):

```ts
    if (upscaleGeneration.status === 'completed') {
      setResultImages(upscaleGeneration.resultImages);
      setUpscaleStatus('completed');
      trackGenerationComplete({
        source: 'unified-studio',
        category: TO_SINGULAR[effectiveJewelryType] ?? effectiveJewelryType,
        upload_type: null,
        duration_ms: Date.now() - (upscaleGeneration.startedAt ?? Date.now()),
        is_first_ever: false,
        aspect_ratio: upscaleGeneration.aspectRatio,
        resolution: upscaleGeneration.resolution,
      });
      if (upscalePropsRef.current) {
        trackUpscaleCompleted({
          ...upscalePropsRef.current,
          is_product_shot: isProductShot,
          surface: 'studio',
        });
      }
      clearGeneration(activeUpscaleId!);
      setActiveUpscaleId(null);
    }
```

- [ ] **Step 4: Fire `upscale_paywall_hit` in the `!hasCredits` branch**

Find the paywall branch in `handleUpscale` (lines 478-483):

```ts
    if (!hasCredits) {
      // Existing insufficient-credit modal is raised by checkCredits; just reset.
      setUpscaleStatus('idle');
      trackPaywallHit({ category: TO_SINGULAR[effectiveJewelryType] ?? effectiveJewelryType, steps_completed: 3 });
      return;
    }
```

Replace it with (keeps existing `trackPaywallHit`, adds the upscale-specific event with the quoted cost):

```ts
    if (!hasCredits) {
      // Existing insufficient-credit modal is raised by checkCredits; just reset.
      setUpscaleStatus('idle');
      trackPaywallHit({ category: TO_SINGULAR[effectiveJewelryType] ?? effectiveJewelryType, steps_completed: 3 });
      trackUpscalePaywallHit({
        source_tier: upscaleResolution,
        factor,
        credits_cost: (await estimateUpscaleCostCached({ resolution: upscaleResolution, factor })) ?? 0,
        category: TO_SINGULAR[effectiveJewelryType] ?? effectiveJewelryType,
        surface: 'studio',
      });
      return;
    }
```

- [ ] **Step 5: Fire `upscale_started` and capture the ref after `startUpscale` succeeds**

Find the post-`startUpscale` block in `handleUpscale` (lines 495-508), which begins with `const _upscaleId = startResponse.workflow_id;`:

```ts
      const _upscaleId = startResponse.workflow_id;
      // Record input urls so a restore (e.g. via the header indicator) keeps context.
      setGenerationInputUrlsMap(prev => ({
        ...prev,
        [_upscaleId]: {
          jewelryUrl: prevData?.jewelryUrl,
          modelUrl: sourceImageUrl,
          aspectRatio: upscaleAspectRatio,
          resolution: upscaleResolution,
          generationCost: prevData?.generationCost ?? generationCost,
        },
      }));
      setActiveUpscaleId(_upscaleId);
      setUpscaleStatus('processing');
```

Replace it with (adds the cost lookup, started event, and ref capture; `category` is already in scope from line 485):

```ts
      const _upscaleId = startResponse.workflow_id;
      // Quoted hold price at launch (policy-driven, cache warm from UpscaleControl).
      const upscaleCreditsCost = (await estimateUpscaleCostCached({ resolution: upscaleResolution, factor })) ?? 0;
      upscalePropsRef.current = {
        source_tier: upscaleResolution, factor, credits_cost: upscaleCreditsCost, category,
      };
      trackUpscaleStarted({
        source_tier: upscaleResolution, factor, credits_cost: upscaleCreditsCost, category,
        is_product_shot: isProductShot, surface: 'studio',
      });
      // Record input urls so a restore (e.g. via the header indicator) keeps context.
      setGenerationInputUrlsMap(prev => ({
        ...prev,
        [_upscaleId]: {
          jewelryUrl: prevData?.jewelryUrl,
          modelUrl: sourceImageUrl,
          aspectRatio: upscaleAspectRatio,
          resolution: upscaleResolution,
          generationCost: prevData?.generationCost ?? generationCost,
        },
      }));
      setActiveUpscaleId(_upscaleId);
      setUpscaleStatus('processing');
```

- [ ] **Step 6: Verify lint, types, and build**

Run: `npm run lint`
Expected: PASS — no direct `posthog-js` import, no unused vars.

Run: `npx vitest run src/lib/posthog-events.test.ts`
Expected: PASS — 23 tests green.

Run: `npm run build`
Expected: PASS — TypeScript compiles (confirms `upscaleResolution` is a `Resolution`, all prop types line up, no type errors in the modified hook).

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useStudioGeneration.ts
git commit -m "feat: track upscale events from studio inline path

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

---

## Final Verification

- [ ] Run the full event test suite: `npx vitest run src/lib/posthog-events.test.ts` → 23 pass.
- [ ] Run lint: `npm run lint` → clean.
- [ ] Run build: `npm run build` → compiles.
- [ ] Manual grep sanity check: `grep -rn "trackUpscale" src/` shows six call sites in hooks (`useUpscaleLauncher.ts` ×3, `useStudioGeneration.ts` ×3 — started + paywall + completed per hook), plus the three function definitions in `posthog-events.ts`, the three names in each hook's import block, and the three imports in `posthog-events.test.ts`.
- [ ] Confirm no existing event call was removed: `grep -n "trackGenerationComplete\|trackPaywallHit" src/hooks/useStudioGeneration.ts` still shows the original calls.

## Notes / Gotchas

- **Why a ref, not state, for completion props:** the completion effect fires on a status transition in a different render than `launch`/`handleUpscale`. A ref carries the launch-time values without adding a re-render or an effect dependency. This mirrors the existing `onCompletedRef` pattern in `useUpscaleLauncher.ts`.
- **`estimateUpscaleCostCached` is async but cheap:** it is already cached from `UpscaleControl.tsx` rendering the price, so `await`-ing it inside the already-async `launch`/`handleUpscale` adds ~no latency. Both call sites are already `async`.
- **Do not add `upscalePropsRef`/`completedPropsRef` to any effect dependency array.** Refs are stable; the existing effects intentionally key only on `tracked?.status` / `upscaleGeneration?.status` (see the eslint-disable comments already in both files). Leave those as-is.
- **`is_product_shot` is intentionally omitted from `upscale_paywall_hit`** (per spec) — kept lean. It is present on `upscale_started` and `upscale_completed`.
