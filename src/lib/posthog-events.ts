import posthog from 'posthog-js';
import type { UserType } from '@/lib/onboarding-api';

/** Safe wrapper — only fires when PostHog is loaded */
function capture(event: string, properties?: Record<string, unknown>) {
  // posthog.__loaded is always true after eager init in main.tsx.
  // Guard kept as a safety net in case init order ever changes.
  if (posthog.__loaded) {
    posthog.capture(event, properties);
  }
}

// ═══════ localStorage helper ════════════════════════════════════════

const PH_FIRST_GEN_KEY = 'ph_first_generation_done';

/** Returns true only on the very first generation_completed call ever.
 *  Flips to false permanently after that.
 *  Stored in localStorage — robust to session resets, not to storage clears. */
export function consumeFirstGeneration(): boolean {
  const done = localStorage.getItem(PH_FIRST_GEN_KEY) === '1';
  if (!done) localStorage.setItem(PH_FIRST_GEN_KEY, '1');
  return !done;
}

// ═══════ Types ══════════════════════════════════════════════════════

export type UserProfession = 'jewelry_brand' | 'freelancer' | 'researcher_student' | 'content_creator' | 'other';

export interface CategorySelectedProps {
  category: string;
  is_first_selection: boolean;
  mode?: 'product-shot' | 'model-shot';
}

export interface JewelryUploadedProps {
  category: string;
  upload_type: string;
  was_flagged: boolean;
}

export interface ValidationFlaggedProps {
  category: string;
  detected_label: string;
}

export interface ModelSelectedProps {
  category: string;
  model_type: 'catalog' | 'custom_upload';
}

export interface PaywallHitProps {
  category: string;
  steps_completed: number;
}

export interface CadGenerationCompletedProps {
  category: string;
  prompt_length: number;
  duration_ms: number;
}

export interface GenerationCompleteProps {
  source: string;
  category: string;
  upload_type: string | null;
  duration_ms: number;
  is_first_ever: boolean;
  aspect_ratio?: string;
  resolution?: string;
}

export interface PaymentSuccessProps {
  package: string;
  amount_usd: number;
  currency_shown: string;
}

export interface UserTypeSelectedProps {
  user_type: UserType;
}

export interface FeedbackSubmittedProps {
  category: string;
  generation_type: string;
  complaint_length: number;
  workflow_id: string | null;
}

export interface FeedbackModalOpenedProps {
  category: string;
  workflow_id: string | null;
  via_tooltip: boolean;
}

// ═══════ Feedback ═══════════════════════════════════════════════════

export function trackFeedbackModalOpened(props: FeedbackModalOpenedProps) {
  capture('feedback_modal_opened', { ...props });
}

export function trackFeedbackSubmitted(props: FeedbackSubmittedProps) {
  capture('feedback_submitted', { ...props });
}

// ═══════ Onboarding / Upload Guide ══════════════════════════════════

export function trackUploadGuideViewed() {
  capture('upload_guide_viewed');
}

export function trackUploadGuideAcknowledged() {
  capture('upload_guide_acknowledged');
}

export function trackProductShotGuideViewed() {
  capture('product_shot_guide_viewed');
}

export function trackProductShotGuideAcknowledged() {
  capture('product_shot_guide_acknowledged');
}

export function trackUserTypeSelected(props: UserTypeSelectedProps) {
  capture('user_type_selected', { ...props });
  if (posthog.__loaded) posthog.setPersonProperties({ user_type: props.user_type });
}

// ═══════ Auth Events ════════════════════════════════════════════════

export function trackSignup(method: string, email?: string) {
  capture('user_signed_up', { method, email });
}

export function trackLogin(method: string, email?: string) {
  capture('user_logged_in', { method, email });
}

export function trackLogout() {
  capture('user_logged_out');
  if (posthog.__loaded) posthog.reset();
}

// ═══════ Feature Usage ══════════════════════════════════════════════

export function trackStudioOpen(category: string) {
  capture('studio_opened', { category });
}

export function trackStudioTypeSelected(mode: 'product-shot' | 'model-shot') {
  capture('studio_type_selected', { mode });
}

export function trackStudioModeSwitched(mode: 'product-shot' | 'model-shot') {
  capture('studio_mode_switched', { mode });
}

export function trackBatchSubmit(imageCount: number, category: string) {
  capture('batch_submitted', { image_count: imageCount, category });
}

export function trackGenerationStart(source: string) {
  capture('generation_started', { source });
}

// Signature change: was trackGenerationComplete(source: string, durationMs?: number)
// Only one call site — UnifiedStudio.tsx. Update it when updating this function.
export function trackGenerationComplete(props: GenerationCompleteProps) {
  capture('generation_completed', { ...props });
}

// ═══════ New Funnel Events ═══════════════════════════════════════════

export function trackMyProductsCategoryFiltered(props: { category: string }) {
  capture('my_products_category_filtered', { ...props });
}

export function trackCategorySelected(props: CategorySelectedProps) {
  capture('category_selected', { ...props });
}

export function trackJewelryUploaded(props: JewelryUploadedProps) {
  capture('jewelry_uploaded', { ...props });
}

export function trackValidationFlagged(props: ValidationFlaggedProps) {
  capture('validation_flagged', {
    ...props,
    validation_reason: 'wrong_shot_type', // static — only reason currently
  });
}

export function trackModelSelected(props: ModelSelectedProps) {
  capture('model_selected', { ...props });
}

export function trackInspirationSelected(props: { category: string; inspiration_id: string; inspiration_label: string; inspiration_category: string | null }) {
  capture('inspiration_selected', { ...props });
}

export function trackPaywallHit(props: PaywallHitProps) {
  capture('paywall_hit', { ...props });
}

export function trackCadGenerationCompleted(props: CadGenerationCompletedProps) {
  capture('cad_generation_completed', { ...props });
}

// ═══════ Conversion / Checkout ══════════════════════════════════════

export function trackCheckoutStart(plan?: string) {
  capture('checkout_started', { plan });
}

// Signature change: was trackPaymentSuccess(plan?: string)
// Only one call site — PaymentSuccess.tsx:63. Update it when updating this function.
export function trackPaymentSuccess(props: PaymentSuccessProps) {
  capture('payment_success', { ...props });
}

export function trackPaymentCancel() {
  capture('payment_cancelled');
}

export function trackStarterPackPurchased() {
  capture('starter_pack_purchased');
}

// ═══════ Engagement ═════════════════════════════════════════════════

export function trackButtonClick(buttonName: string, context?: string) {
  capture('button_clicked', { button: buttonName, context });
}

export function trackFormSubmit(formName: string) {
  capture('form_submitted', { form: formName });
}

// ═══════ 3D Rendering Diagnostics ═══════════════════════════════════

export function trackWebGLContextLost(stats: Record<string, unknown>) {
  capture('webgl_context_lost', stats);
}

export function trackWebGLContextRestored(stats: Record<string, unknown>) {
  capture('webgl_context_restored', stats);
}

// ═══════ User Identification ═════════════════════════════════════════

export function identifyUser(userId: string, properties?: Record<string, unknown>) {
  if (posthog.__loaded) {
    posthog.identify(userId, properties);
  }
}

export function setUserProfession(profession: UserProfession) {
  if (posthog.__loaded) {
    posthog.setPersonProperties({ profession });
  }
}

// ─── A/B EXPERIMENT: button-labels-experiment ───────────────────────────────
// Cleanup instructions (both outcomes): docs/superpowers/plans/2026-05-09-button-labels-experiment.md → Task 6
// TO REMOVE when experiment ends: delete trackButtonLabelExperimentExposure,
// getButtonLabelVariant, their tests in posthog-events.test.ts,
// the call in AuthContext.tsx, and the isNewLabels logic in StudioResultsStep.tsx.
// ────────────────────────────────────────────────────────────────────────────

export function trackButtonLabelExperimentExposure() {
  if (!posthog.__loaded) return;
  posthog.onFeatureFlags(() => {
    posthog.getFeatureFlag('button-labels-experiment');
  });
}

export function getButtonLabelVariant(): string | undefined {
  if (!posthog.__loaded) return undefined;
  return posthog.getFeatureFlag('button-labels-experiment') as string | undefined;
}

// ─── A/B EXPERIMENT: tooltip-first-gen-experiment ────────────────────────────
// Owner: frontend dev
// Reason: test whether nudging first-time users toward the human-edit workflow
//         increases subsequent credit purchases (payment_success).
// Removal: when experiment concludes — delete trackTooltipExperimentExposure,
//          getTooltipExperimentVariant, trackTooltipShown, and their tests in
//          posthog-events.test.ts, plus the exposure call in AuthContext.tsx, and
//          the isFirstGeneration + tooltipVariant logic in useStudioGeneration.ts,
//          UnifiedStudio.tsx, and StudioResultsStep.tsx.
// ─────────────────────────────────────────────────────────────────────────────

export function trackTooltipExperimentExposure() {
  if (!posthog.__loaded) return;
  posthog.onFeatureFlags(() => {
    posthog.getFeatureFlag('tooltip-first-gen-experiment');
  });
}

export function getTooltipExperimentVariant(): string | undefined {
  if (!posthog.__loaded) return undefined;
  return posthog.getFeatureFlag('tooltip-first-gen-experiment') as string | undefined;
}

export function trackTooltipShown() {
  capture('tooltip_shown', { experiment: 'tooltip-first-gen-experiment' });
}

export function trackTooltipDismissed() {
  capture('tooltip_dismissed', { experiment: 'tooltip-first-gen-experiment' });
}

const FIX_BUTTON_CLICKED_KEY = 'formanova_fix_button_ever_clicked';

export function hasClickedFixButton(): boolean {
  return localStorage.getItem(FIX_BUTTON_CLICKED_KEY) === '1';
}

export function markFixButtonClicked() {
  localStorage.setItem(FIX_BUTTON_CLICKED_KEY, '1');
}

// ═══════ Studio Actions ══════════════════════════════════════════════

// No breaking change — new optional `category` property added
export function trackDownloadClicked(props?: {
  file_name?: string;
  file_type?: string;
  context?: string;
  category?: string;
}) {
  capture('download_clicked', props ?? {});
}

// Signature change: was trackRegenerateClicked(context?: string)
// Only called in UnifiedStudio.tsx — update it alongside this change.
export function trackRegenerateClicked(props?: {
  context?: string;
  category?: string;
  regeneration_number?: number;
}) {
  capture('regenerate_clicked', props ?? {});
}

export interface AIFixSubmittedProps {
  category: string;
  prompt_length: number;
  workflow_id: string | null;
  regeneration_number: number;
}

export function trackAIFixSubmitted(props: AIFixSubmittedProps) {
  capture('ai_fix_submitted', { ...props });
}
