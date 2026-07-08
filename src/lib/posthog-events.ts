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
  /** Effort tier of this generation: 'low' or 'high'. Only set for real photoshoot
   *  generations (not upscales), so low-vs-high counts exclude upscales. */
  effort?: 'low' | 'high';
  /** How many jewelry images were actually used for this generation (1-3). 1 for
   *  low effort; up to 3 for high effort. Captured at generate time, so uploading
   *  N images without generating never counts. */
  jewelry_image_count?: number;
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
}

export interface AIFixModalOpenedProps {
  category: string;
  workflow_id: string | null;
}

// ═══════ Feedback ═══════════════════════════════════════════════════

export function trackAIFixModalOpened(props: AIFixModalOpenedProps) {
  capture('ai_fix_modal_opened', { ...props });
}

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

// ═══════ Starter Pack pricing A/B experiment ═════════════════════════
// control = old multi-plan grid; treatment = new single-offer Starter Pack page.
// Default-safe: callers treat anything except 'control' as the Starter Pack page,
// so behaviour is unchanged until the PostHog flag actively buckets a user (no
// regression before the experiment is configured / after it ends).
//
// TO REMOVE when experiment ends: delete STARTER_PACK_EXPERIMENT_FLAG,
// getStarterPackPricingVariant, onPostHogFlagsLoaded, their tests, the
// useStarterPackPricingVariant hook, and the gating in Credits.tsx / Pricing.tsx.

export const STARTER_PACK_EXPERIMENT_FLAG = 'starter-pack-pricing-experiment';

/**
 * Variant for the starter-pack pricing experiment: 'control' = old multi-plan
 * grid, 'treatment' (or undefined) = new single-offer Starter Pack page.
 *
 * Read only after identify so eligible buyers bucket on the right distinct_id;
 * reading the flag here is also what records the PostHog exposure
 * ($feature_flag_called). Callers gate this behind eligibility so exposure fires
 * only for the experiment's real population.
 */
export function getStarterPackPricingVariant(): string | undefined {
  if (!posthog.__loaded || !posthog._isIdentified()) return undefined;
  return posthog.getFeatureFlag(STARTER_PACK_EXPERIMENT_FLAG) as string | undefined;
}

/**
 * Run `cb` once PostHog feature flags are available (and on later changes),
 * returning an unsubscribe fn. Lets a full-page A/B wait for flags before
 * choosing a variant, avoiding a control->treatment flash. If PostHog never
 * loaded, `cb` runs immediately so callers fall back to the default variant.
 */
export function onPostHogFlagsLoaded(cb: () => void): () => void {
  if (!posthog.__loaded) {
    cb();
    return () => {};
  }
  return posthog.onFeatureFlags(() => cb());
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

export interface AIFixSubmittedProps {
  category: string;
  prompt_length: number;
  workflow_id: string | null;
  regeneration_number: number;
}

export function trackAIFixSubmitted(props: AIFixSubmittedProps) {
  capture('ai_fix_submitted', { ...props });
}

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
