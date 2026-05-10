# Button Labels A/B Experiment — Design Spec

**Date:** 2026-05-09
**Status:** Ready for implementation

## Hypothesis

Using explicit mechanism labels ("Redo with AI" / "Redo with human") instead of vague action labels ("Regenerate" / "Fix this result") will result in higher overall click-through rate on both buttons, because users will better understand what each action does.

## What we're testing

Two buttons in `StudioResultsStep.tsx` (the results screen after a generation completes):

| Button | Control (current) | Treatment (new) |
|--------|-------------------|-----------------|
| Opens FeedbackModal → emails admin to manually fix result | Fix this result | Redo with human |
| Re-runs the AI generation | Regenerate | Redo with AI |

Only the text labels change. Icons, styling, credit cost display, and click handlers are identical across variants.

## PostHog experiment (already configured)

- **Experiment name:** Button Labels Experiment
- **Flag key:** `button-labels-experiment`
- **Status:** DRAFT — do not launch until code is deployed
- **Variants:** `control` (50%) / `treatment` (50%)
- **Primary metric:** `regenerate_clicked` — Funnel, Goal: Increase
- **Secondary metric:** `feedback_submitted` — Funnel, Goal: Increase
- **Statistics:** Bayesian / 95%

To launch: go to PostHog → Experiments → Button Labels Experiment → Launch.

## Code changes

### 1. `src/lib/posthog-events.ts`

Add two exports after `trackFreeGenerationExperimentExposure`:

**`trackButtonLabelExperimentExposure()`** — fires `$feature_flag_called` for `button-labels-experiment` after identify, enrolling the user under their identified UUID. Same pattern as `trackFreeGenerationExperimentExposure`. Call once on login only.

**`getButtonLabelVariant()`** — thin sync read of `posthog.getFeatureFlag('button-labels-experiment')`. Returns `string | undefined`. Exported so components can read the flag without importing `posthog-js` directly (ESLint rule).

Add a cleanup comment: `TO REMOVE when experiment ends: delete both functions and their call sites.`

### 2. `src/contexts/AuthContext.tsx`

Call `trackButtonLabelExperimentExposure()` on the same line/block as the existing `trackFreeGenerationExperimentExposure()` call (~line 39). They are logically identical — fire-and-forget on login.

### 3. `src/components/studio/StudioResultsStep.tsx`

- Import `getButtonLabelVariant` from `@/lib/posthog-events`
- Call it once at the top of the component: `const isNewLabels = getButtonLabelVariant() === 'treatment'`
- Conditionally set label strings:
  - Fix button: `isNewLabels ? 'Redo with human' : 'Fix this result'`
  - Regenerate button: `isNewLabels ? 'Redo with AI' : 'Regenerate'`
- Nothing else changes — icons, className, handlers, credit cost span all stay identical

Fallback: if `getButtonLabelVariant()` returns `undefined` (flags not yet loaded), `isNewLabels` is `false`, so control labels render. Safe default.

### 4. `src/lib/posthog-events.test.ts`

Add two tests:
- `trackButtonLabelExperimentExposure` calls `posthog.onFeatureFlags` and `posthog.getFeatureFlag` with `'button-labels-experiment'`
- `getButtonLabelVariant` returns the mocked `getFeatureFlag` return value

## No changes needed

- `trackRegenerateClicked` — PostHog auto-correlates via `$active_feature_flags`; no variant property needed
- `trackFeedbackSubmitted` — same reason
- Button styling, layout, icons, credit cost display — unchanged by design (single-variable experiment)

## Launch sequence

1. Merge and deploy the code changes
2. Verify in PostHog that `$feature_flag_called` events appear for `button-labels-experiment`
3. Go to PostHog → Experiments → Button Labels Experiment → **Launch**
4. Monitor results after ~1–2 weeks or when PostHog signals significance
