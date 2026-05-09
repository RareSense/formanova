# Button Labels A/B Experiment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the PostHog `button-labels-experiment` flag so the "Fix this result" and "Regenerate" buttons in StudioResultsStep show "Redo with human" / "Redo with AI" for the treatment variant.

**Architecture:** Add two exports to `posthog-events.ts` (exposure tracker + flag reader), call the exposure tracker in `AuthContext.tsx` on login, read the flag in `StudioResultsStep.tsx` to switch label strings. PostHog auto-correlates downstream events (`feedback_submitted`, `regenerate_clicked`) with the active variant — no changes to those event functions needed.

**Tech Stack:** React + TypeScript, posthog-js (via `@/lib/posthog-events` — never import posthog-js directly in components, ESLint enforces this), Vitest for tests.

---

## File Map

| File | Change |
|------|--------|
| `src/lib/posthog-events.ts` | Add `trackButtonLabelExperimentExposure()` and `getButtonLabelVariant()` |
| `src/lib/posthog-events.test.ts` | Add tests for both new functions |
| `src/contexts/AuthContext.tsx` | Call `trackButtonLabelExperimentExposure()` on login |
| `src/components/studio/StudioResultsStep.tsx` | Import `getButtonLabelVariant`, conditionally switch button labels |

---

## Task 1: Create feature branch

- [ ] **Step 1: Create and check out the branch**

```bash
git checkout -b experiment/button-labels
```

Expected: `Switched to a new branch 'experiment/button-labels'`

---

## Task 2: Add posthog-events functions (TDD)

**Files:**
- Modify: `src/lib/posthog-events.test.ts`
- Modify: `src/lib/posthog-events.ts`

### Step 1: Write failing tests

- [ ] Open `src/lib/posthog-events.test.ts`. Add these two `describe` blocks at the bottom of the file (before the closing), and add `trackButtonLabelExperimentExposure` and `getButtonLabelVariant` to the import list at the top:

**Import change** — find the existing import block (line ~9) and add the two new names:

```ts
import {
  consumeFirstGeneration,
  trackMyProductsCategoryFiltered,
  trackCategorySelected,
  trackJewelryUploaded,
  trackValidationFlagged,
  trackModelSelected,
  trackPaywallHit,
  trackCadGenerationCompleted,
  trackGenerationComplete,
  trackDownloadClicked,
  trackRegenerateClicked,
  trackPaymentSuccess,
  trackUploadGuideViewed,
  trackUploadGuideAcknowledged,
  trackUserTypeSelected,
  trackFeedbackSubmitted,
  setUserProfession,
  trackButtonLabelExperimentExposure,
  getButtonLabelVariant,
} from './posthog-events'
```

**New test blocks** — append at the bottom of the file:

```ts
// ── trackButtonLabelExperimentExposure ──────────────────────────────

describe('trackButtonLabelExperimentExposure', () => {
  it('calls onFeatureFlags and then getFeatureFlag with button-labels-experiment', () => {
    let captured: (() => void) | undefined;
    (posthog.onFeatureFlags as any).mockImplementation((fn: () => void) => {
      captured = fn;
    });
    trackButtonLabelExperimentExposure();
    expect(posthog.onFeatureFlags).toHaveBeenCalled();
    captured!();
    expect(posthog.getFeatureFlag).toHaveBeenCalledWith('button-labels-experiment');
  });
})

// ── getButtonLabelVariant ───────────────────────────────────────────

describe('getButtonLabelVariant', () => {
  it('returns the flag value when treatment', () => {
    (posthog.getFeatureFlag as any).mockReturnValue('treatment');
    expect(getButtonLabelVariant()).toBe('treatment');
    expect(posthog.getFeatureFlag).toHaveBeenCalledWith('button-labels-experiment');
  });

  it('returns undefined when flag is not yet loaded', () => {
    (posthog.getFeatureFlag as any).mockReturnValue(undefined);
    expect(getButtonLabelVariant()).toBeUndefined();
  });
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/lib/posthog-events.test.ts
```

Expected: FAIL — `trackButtonLabelExperimentExposure is not a function` (or similar import error).

- [ ] **Step 3: Add the two functions to posthog-events.ts**

Open `src/lib/posthog-events.ts`. Find the end of `trackFreeGenerationExperimentExposure` (around line 259). Insert immediately after the closing `}`:

```ts

/** TO REMOVE when experiment ends: delete this function, getButtonLabelVariant below,
 *  and the call in AuthContext.tsx (~line 40). */
export function trackButtonLabelExperimentExposure() {
  if (!posthog.__loaded) return;
  posthog.onFeatureFlags(() => {
    posthog.getFeatureFlag('button-labels-experiment');
  });
}

/** Sync read of the button-labels-experiment flag value.
 *  Returns 'treatment' | 'control' | undefined.
 *  undefined means flags not yet loaded — callers must treat it as control.
 *  TO REMOVE when experiment ends. */
export function getButtonLabelVariant(): string | undefined {
  if (!posthog.__loaded) return undefined;
  return posthog.getFeatureFlag('button-labels-experiment') as string | undefined;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run src/lib/posthog-events.test.ts
```

Expected: all tests pass (previously 30, now 33).

- [ ] **Step 5: Commit**

```bash
git add src/lib/posthog-events.ts src/lib/posthog-events.test.ts
git commit -m "feat: add trackButtonLabelExperimentExposure and getButtonLabelVariant"
```

---

## Task 3: Fire experiment exposure on login

**Files:**
- Modify: `src/contexts/AuthContext.tsx`

- [ ] **Step 1: Update the import on line 3**

Find:
```ts
import { trackLogin, trackLogout, identifyUser, trackFreeGenerationExperimentExposure } from '@/lib/posthog-events';
```

Replace with:
```ts
import { trackLogin, trackLogout, identifyUser, trackFreeGenerationExperimentExposure, trackButtonLabelExperimentExposure } from '@/lib/posthog-events';
```

- [ ] **Step 2: Call the exposure function on login**

Find (around line 39):
```ts
        trackFreeGenerationExperimentExposure();
```

Replace with:
```ts
        trackFreeGenerationExperimentExposure();
        trackButtonLabelExperimentExposure();
```

- [ ] **Step 3: Run the full test suite to check nothing broke**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/contexts/AuthContext.tsx
git commit -m "feat: fire button-labels-experiment exposure on login"
```

---

## Task 4: Switch button labels in StudioResultsStep

**Files:**
- Modify: `src/components/studio/StudioResultsStep.tsx`

- [ ] **Step 1: Add getButtonLabelVariant to the import**

Find line 15:
```ts
import { trackRegenerateClicked } from '@/lib/posthog-events';
```

Replace with:
```ts
import { trackRegenerateClicked, getButtonLabelVariant } from '@/lib/posthog-events';
```

- [ ] **Step 2: Read the flag at the top of the component**

Find this exact line (the closing of the props destructure, around line 60):
```ts
}: StudioResultsStepProps) {
  return (
```

Replace with:
```ts
}: StudioResultsStepProps) {
  const isNewLabels = getButtonLabelVariant() === 'treatment';
  return (
```

- [ ] **Step 3: Switch the Fix button label**

Find:
```tsx
            Fix this result
```

Replace with:
```tsx
            {isNewLabels ? 'Redo with human' : 'Fix this result'}
```

- [ ] **Step 4: Switch the Regenerate button label**

Find:
```tsx
            <RefreshCw className="h-4 w-4" />
            Regenerate
            <span className="ml-1 flex items-center gap-1 text-xs normal-case tracking-normal opacity-70">
```

Replace with:
```tsx
            <RefreshCw className="h-4 w-4" />
            {isNewLabels ? 'Redo with AI' : 'Regenerate'}
            <span className="ml-1 flex items-center gap-1 text-xs normal-case tracking-normal opacity-70">
```

- [ ] **Step 5: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/studio/StudioResultsStep.tsx
git commit -m "feat: show Redo with AI / Redo with human labels for treatment variant"
```

---

## Task 5: Push branch and open PR

- [ ] **Step 1: Push the branch**

```bash
git push -u origin experiment/button-labels
```

- [ ] **Step 2: Open a PR**

```bash
gh pr create \
  --title "experiment: button labels A/B test (button-labels-experiment)" \
  --body "$(cat <<'EOF'
## Summary

- Wires up the PostHog `button-labels-experiment` feature flag
- Control: current labels — "Fix this result" / "Regenerate"
- Treatment: new labels — "Redo with human" / "Redo with AI"
- Adds `trackButtonLabelExperimentExposure()` (fires on login) and `getButtonLabelVariant()` (read at render) to `posthog-events.ts`
- No changes to event tracking functions — PostHog correlates existing `feedback_submitted` and `regenerate_clicked` events to the variant automatically

## Test plan

- [ ] Run `npx vitest run src/lib/posthog-events.test.ts` — all 33 tests pass
- [ ] Log in to the app and open browser devtools console — confirm no errors
- [ ] To force treatment variant locally, run in console: `posthog.featureFlags.overrideFeatureFlags({ flags: { 'button-labels-experiment': 'treatment' } })` then navigate to a results screen — buttons should read "Redo with human" and "Redo with AI"
- [ ] To verify control: `posthog.featureFlags.overrideFeatureFlags({ flags: { 'button-labels-experiment': 'control' } })` — buttons should read "Fix this result" and "Regenerate"
- [ ] Clear override: `posthog.featureFlags.overrideFeatureFlags({})`

## Do NOT launch the PostHog experiment until this PR is merged and deployed.
EOF
)"
```

Expected: PR URL printed to terminal. Share it with your frontend developer for review.

---

## Task 6: Experiment conclusion — cleanup (run AFTER results are in)

> Run exactly one of the two options below depending on which variant won. Do not run both.
> Archive the experiment in PostHog (Experiments → Button Labels Experiment → Stop) before or after the code change — order doesn't matter.

---

### Option A: Control wins — revert to original labels permanently

Original labels: **"Fix this result"** and **"Regenerate"**

- [ ] **Step 1: Remove the exposure call from AuthContext.tsx**

Find:
```ts
import { trackLogin, trackLogout, identifyUser, trackFreeGenerationExperimentExposure, trackButtonLabelExperimentExposure } from '@/lib/posthog-events';
```

Replace with:
```ts
import { trackLogin, trackLogout, identifyUser, trackFreeGenerationExperimentExposure } from '@/lib/posthog-events';
```

Then find:
```ts
        trackFreeGenerationExperimentExposure();
        trackButtonLabelExperimentExposure();
```

Replace with:
```ts
        trackFreeGenerationExperimentExposure();
```

- [ ] **Step 2: Remove isNewLabels and revert labels in StudioResultsStep.tsx**

Find:
```ts
}: StudioResultsStepProps) {
  const isNewLabels = getButtonLabelVariant() === 'treatment';
  return (
```

Replace with:
```ts
}: StudioResultsStepProps) {
  return (
```

Find:
```ts
import { trackRegenerateClicked, getButtonLabelVariant } from '@/lib/posthog-events';
```

Replace with:
```ts
import { trackRegenerateClicked } from '@/lib/posthog-events';
```

Find:
```tsx
            {isNewLabels ? 'Redo with human' : 'Fix this result'}
```

Replace with:
```tsx
            Fix this result
```

Find:
```tsx
            {isNewLabels ? 'Redo with AI' : 'Regenerate'}
```

Replace with:
```tsx
            Regenerate
```

- [ ] **Step 3: Delete the two functions from posthog-events.ts**

Find and delete this entire block (including the blank line before it):

```ts

/** TO REMOVE when experiment ends: delete this function, getButtonLabelVariant below,
 *  and the call in AuthContext.tsx (~line 40). */
export function trackButtonLabelExperimentExposure() {
  if (!posthog.__loaded) return;
  posthog.onFeatureFlags(() => {
    posthog.getFeatureFlag('button-labels-experiment');
  });
}

/** Sync read of the button-labels-experiment flag value.
 *  Returns 'treatment' | 'control' | undefined.
 *  undefined means flags not yet loaded — callers must treat it as control.
 *  TO REMOVE when experiment ends. */
export function getButtonLabelVariant(): string | undefined {
  if (!posthog.__loaded) return undefined;
  return posthog.getFeatureFlag('button-labels-experiment') as string | undefined;
}
```

- [ ] **Step 4: Delete the tests from posthog-events.test.ts**

Find and delete the import names `trackButtonLabelExperimentExposure` and `getButtonLabelVariant` from the import block at the top.

Find and delete this entire block:

```ts
// ── trackButtonLabelExperimentExposure ──────────────────────────────

describe('trackButtonLabelExperimentExposure', () => {
  it('calls onFeatureFlags and then getFeatureFlag with button-labels-experiment', () => {
    let captured: (() => void) | undefined;
    (posthog.onFeatureFlags as any).mockImplementation((fn: () => void) => {
      captured = fn;
    });
    trackButtonLabelExperimentExposure();
    expect(posthog.onFeatureFlags).toHaveBeenCalled();
    captured!();
    expect(posthog.getFeatureFlag).toHaveBeenCalledWith('button-labels-experiment');
  });
})

// ── getButtonLabelVariant ───────────────────────────────────────────

describe('getButtonLabelVariant', () => {
  it('returns the flag value when treatment', () => {
    (posthog.getFeatureFlag as any).mockReturnValue('treatment');
    expect(getButtonLabelVariant()).toBe('treatment');
    expect(posthog.getFeatureFlag).toHaveBeenCalledWith('button-labels-experiment');
  });

  it('returns undefined when flag is not yet loaded', () => {
    (posthog.getFeatureFlag as any).mockReturnValue(undefined);
    expect(getButtonLabelVariant()).toBeUndefined();
  });
})
```

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit and push**

```bash
git add src/lib/posthog-events.ts src/lib/posthog-events.test.ts src/contexts/AuthContext.tsx src/components/studio/StudioResultsStep.tsx
git commit -m "cleanup: remove button-labels-experiment flag, revert to original labels"
git push
```

---

### Option B: Treatment wins — ship new labels permanently

Permanent labels: **"Redo with human"** and **"Redo with AI"**

- [ ] **Step 1: Same as Option A Steps 1, 3, 4** — remove the exposure call, the two functions, and the tests. Identical — follow those steps exactly.

- [ ] **Step 2: Hardcode the new labels and remove isNewLabels in StudioResultsStep.tsx**

Find:
```ts
}: StudioResultsStepProps) {
  const isNewLabels = getButtonLabelVariant() === 'treatment';
  return (
```

Replace with:
```ts
}: StudioResultsStepProps) {
  return (
```

Find:
```ts
import { trackRegenerateClicked, getButtonLabelVariant } from '@/lib/posthog-events';
```

Replace with:
```ts
import { trackRegenerateClicked } from '@/lib/posthog-events';
```

Find:
```tsx
            {isNewLabels ? 'Redo with human' : 'Fix this result'}
```

Replace with:
```tsx
            Redo with human
```

Find:
```tsx
            {isNewLabels ? 'Redo with AI' : 'Regenerate'}
```

Replace with:
```tsx
            Redo with AI
```

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Commit and push**

```bash
git add src/lib/posthog-events.ts src/lib/posthog-events.test.ts src/contexts/AuthContext.tsx src/components/studio/StudioResultsStep.tsx
git commit -m "cleanup: remove button-labels-experiment flag, ship Redo with AI / Redo with human permanently"
git push
```
