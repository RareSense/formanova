import posthog from 'posthog-js';
import type { UserType } from '@/lib/onboarding-api';
import type { CadSource, CadRestoreEntry } from '@/lib/cad-analytics';

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
  /** Set only by the CAD tools, so CAD paywall hits are separable from
   *  photoshoot ones. Photoshoot callers omit it and their payload is
   *  byte-identical to before. */
  source?: CadSource;
}

export interface CadGenerationCompletedProps {
  category: string;
  prompt_length: number;
  duration_ms: number;
  /** The Temporal workflow id this run was given at submission. Present on
   *  every generation event so a run's start, completion and failure can be
   *  joined exactly, rather than inferred from person identity and timing.
   *  Absent only on a `start` stage failure, where the run never got one. */
  workflow_id?: string;
  /** Which CAD tool produced this. Optional so the pre-existing payload shape
   *  stays valid; every live caller now passes it. */
  source?: CadSource;
  reference_image_count?: number;
  llm_tier?: string;
  is_first_ever?: boolean;
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

// ═══════ Brand form funnel ══════════════════════════════════════════

export interface BrandFormOpenedProps {
  /** Where the popup appeared: role picker vs the existing-user Studio prompt. */
  source: 'onboarding' | 'studio_prompt';
}

export function trackBrandFormOpened(props: BrandFormOpenedProps) {
  capture('brand_form_opened', { ...props });
}

/** Field SHAPE only — never the entered values, which are confidential. */
export interface BrandFormSubmittedProps {
  source: 'onboarding' | 'studio_prompt';
  has_website: boolean;
  has_store: boolean;
  has_location: boolean;
  has_markets: boolean;
  social_count: number;
  has_brand_book: boolean;
}

export function trackBrandFormSubmitted(props: BrandFormSubmittedProps) {
  capture('brand_form_submitted', { ...props });
}

/** The user cleared their entire brand profile from Brand Settings. */
export function trackBrandDetailsDeleted() {
  capture('brand_details_deleted');
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

// ═══════ CAD funnel ════════════════════════════════════════════
//
// Text-to-CAD and Image-to-CAD are one event set with a `source` property, not
// two parallel sets of event names. They share a single hook
// (useImageToCADWorkflow) and differ only by input, so they are the same user
// action along one dimension. The property assembly lives in
// `@/lib/cad-analytics`; this file only owns the names and payload shapes.

export interface CadStudioOpenProps {
  source: CadSource;
}

export interface CadReferenceUploadedProps {
  source: CadSource;
  /** How many images this one action added. */
  image_count: number;
  /** Running total afterwards, so drop-off can be read against set size. */
  total_after_add: number;
}

export interface CadGenerationStartedProps {
  source: CadSource;
  /** The Temporal workflow id this run was given at submission. Present on
   *  every generation event so a run's start, completion and failure can be
   *  joined exactly, rather than inferred from person identity and timing.
   *  Absent only on a `start` stage failure, where the run never got one. */
  workflow_id?: string;
  category: 'ring';
  prompt_length: number;
  reference_image_count: number;
  llm_tier: string;
  is_first_ever: boolean;
}

export interface CadGenerationFailedProps {
  source: CadSource;
  /** The Temporal workflow id this run was given at submission. Present on
   *  every generation event so a run's start, completion and failure can be
   *  joined exactly, rather than inferred from person identity and timing.
   *  Absent only on a `start` stage failure, where the run never got one. */
  workflow_id?: string;
  /** `start` means the run never got a workflow_id; `run` means the backend
   *  accepted it and then failed. They have completely different causes, so
   *  collapsing them would make the failure rate unactionable. */
  failure_stage: 'start' | 'run';
  duration_ms: number;
  /** Whether backend gave us copy to show. False means the user saw the
   *  generic message, which is a support burden worth counting.
   *
   *  Only ever set for `failure_stage: 'start'`. A run-stage failure is
   *  surfaced through GenerationsContext, whose TrackedGeneration carries no
   *  failure text, so there is nothing to report. Omitted rather than sent as
   *  a constant false, which would read as "backend never explains run
   *  failures" when the truth is that this layer cannot see it. */
  has_failure_message?: boolean;
}

export interface CadResultRestoredProps {
  source: CadSource;
  entry: CadRestoreEntry;
  restore_ok: boolean;
}

export function trackCadStudioOpen(props: CadStudioOpenProps) {
  capture('cad_studio_open', { ...props });
}

export function trackCadReferenceUploaded(props: CadReferenceUploadedProps) {
  capture('cad_reference_uploaded', { ...props });
}

export function trackCadGenerationStarted(props: CadGenerationStartedProps) {
  capture('cad_generation_started', { ...props });
}

export function trackCadGenerationFailed(props: CadGenerationFailedProps) {
  capture('cad_generation_failed', { ...props });
}

/** Fired when a finished run is reopened from a deep link. `entry` says where
 *  the link came from; see CAD_RESTORE_SRC_PARAM in cad-analytics for why
 *  `external` is the email proxy. */
export function trackCadResultRestored(props: CadResultRestoredProps) {
  capture('cad_result_restored', { ...props });
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
  /** Which CAD tool produced the downloaded model. The generations history
   *  serves both tools from one card, so without this every download made
   *  outside the studio pages is unattributable. */
  source?: CadSource;
}) {
  capture('download_clicked', props ?? {});
}

// Fired only on a confirmed successful export (draft product created in the
// user's store) — not on button click — so unique-user counts answer
// "how many people actually put an image into Shopify".
export function trackShopifyExported(props?: {
  context?: string;
}) {
  capture('shopify_exported', props ?? {});
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
