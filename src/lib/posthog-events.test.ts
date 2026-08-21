import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock posthog-js BEFORE importing posthog-events
vi.mock('posthog-js', () => ({
  default: { capture: vi.fn(), setPersonProperties: vi.fn(), reset: vi.fn(), identify: vi.fn(), onFeatureFlags: vi.fn(), getFeatureFlag: vi.fn(), _isIdentified: vi.fn(), __loaded: true },
}))

import posthog from 'posthog-js'
import {
  consumeFirstGeneration,
  trackMyProductsCategoryFiltered,
  trackCategorySelected,
  trackJewelryUploaded,
  trackValidationFlagged,
  trackModelSelected,
  trackPaywallHit,
  trackCadGenerationCompleted,
  trackCadStudioOpen,
  trackCadReferenceUploaded,
  trackCadGenerationStarted,
  trackCadGenerationFailed,
  trackCadResultRestored,
  trackGenerationComplete,
  trackDownloadClicked,
  trackAIFixSubmitted,
  trackAIFixModalOpened,
  trackPaymentSuccess,
  trackStarterPackPurchased,
  trackUploadGuideViewed,
  trackUploadGuideAcknowledged,
  trackUserTypeSelected,
  trackFeedbackModalOpened,
  trackFeedbackSubmitted,
  trackBrandFormOpened,
  trackBrandFormSubmitted,
  trackBrandDetailsDeleted,
  setUserProfession,
  trackShopifyExported,
  trackUpscaleStarted,
  trackUpscaleCompleted,
  trackUpscalePaywallHit,
  getStarterPackPricingVariant,
  onPostHogFlagsLoaded,
} from './posthog-events'

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

// ── consumeFirstGeneration ──────────────────────────────────────────

describe('consumeFirstGeneration', () => {
  it('returns true on first call', () => {
    expect(consumeFirstGeneration()).toBe(true)
  })

  it('returns false on all subsequent calls', () => {
    consumeFirstGeneration()
    expect(consumeFirstGeneration()).toBe(false)
    expect(consumeFirstGeneration()).toBe(false)
  })

  it('persists across calls via localStorage', () => {
    consumeFirstGeneration()
    // Simulate a new module import by calling again — state is in localStorage
    expect(consumeFirstGeneration()).toBe(false)
  })
})

// ── __loaded guard ──────────────────────────────────────────────────

describe('__loaded guard', () => {
  it('does not capture when __loaded is false', () => {
    ;(posthog as any).__loaded = false
    trackJewelryUploaded({ category: 'ring', upload_type: 'mannequin', was_flagged: false })
    expect(posthog.capture).not.toHaveBeenCalled()
    ;(posthog as any).__loaded = true
  })
})


// ── Brand form funnel ───────────────────────────────────────────────

describe('trackBrandFormOpened', () => {
  it('captures brand_form_opened with the source', () => {
    trackBrandFormOpened({ source: 'onboarding' })
    expect(posthog.capture).toHaveBeenCalledWith('brand_form_opened', {
      source: 'onboarding',
    })
  })

  it('supports the studio prompt source', () => {
    trackBrandFormOpened({ source: 'studio_prompt' })
    expect(posthog.capture).toHaveBeenCalledWith('brand_form_opened', {
      source: 'studio_prompt',
    })
  })
})

describe('trackBrandFormSubmitted', () => {
  it('captures brand_form_submitted with field shape, never field values', () => {
    trackBrandFormSubmitted({
      source: 'studio_prompt',
      has_website: true,
      has_store: false,
      has_location: true,
      has_markets: true,
      social_count: 2,
      has_brand_book: false,
    })
    expect(posthog.capture).toHaveBeenCalledWith('brand_form_submitted', {
      source: 'studio_prompt',
      has_website: true,
      has_store: false,
      has_location: true,
      has_markets: true,
      social_count: 2,
      has_brand_book: false,
    })
  })
})

describe('trackBrandDetailsDeleted', () => {
  it('captures brand_details_deleted with no properties', () => {
    trackBrandDetailsDeleted()
    expect(posthog.capture).toHaveBeenCalledWith('brand_details_deleted', undefined)
  })
})

// ── New event functions ─────────────────────────────────────────────

describe('trackMyProductsCategoryFiltered', () => {
  it('captures my_products_category_filtered with category', () => {
    trackMyProductsCategoryFiltered({ category: 'ring' })
    expect(posthog.capture).toHaveBeenCalledWith('my_products_category_filtered', {
      category: 'ring',
    })
  })
})

describe('trackCategorySelected', () => {
  it('captures category_selected with correct shape', () => {
    trackCategorySelected({ category: 'ring', is_first_selection: true })
    expect(posthog.capture).toHaveBeenCalledWith('category_selected', {
      category: 'ring',
      is_first_selection: true,
    })
  })
})

describe('trackJewelryUploaded', () => {
  it('captures jewelry_uploaded — accepted path', () => {
    trackJewelryUploaded({ category: 'ring', upload_type: 'mannequin', was_flagged: false })
    expect(posthog.capture).toHaveBeenCalledWith('jewelry_uploaded', {
      category: 'ring',
      upload_type: 'mannequin',
      was_flagged: false,
    })
  })

  it('captures jewelry_uploaded — continue anyway path', () => {
    trackJewelryUploaded({ category: 'earring', upload_type: 'flatlay', was_flagged: true })
    expect(posthog.capture).toHaveBeenCalledWith('jewelry_uploaded', {
      category: 'earring',
      upload_type: 'flatlay',
      was_flagged: true,
    })
  })
})

describe('trackValidationFlagged', () => {
  it('captures validation_flagged with static validation_reason', () => {
    trackValidationFlagged({ category: 'ring', detected_label: 'flatlay' })
    expect(posthog.capture).toHaveBeenCalledWith('validation_flagged', {
      category: 'ring',
      detected_label: 'flatlay',
      validation_reason: 'wrong_shot_type',
    })
  })
})

describe('trackModelSelected', () => {
  it('captures model_selected for catalog model', () => {
    trackModelSelected({ category: 'ring', model_type: 'catalog' })
    expect(posthog.capture).toHaveBeenCalledWith('model_selected', {
      category: 'ring',
      model_type: 'catalog',
    })
  })

  it('captures model_selected for custom upload', () => {
    trackModelSelected({ category: 'necklace', model_type: 'custom_upload' })
    expect(posthog.capture).toHaveBeenCalledWith('model_selected', {
      category: 'necklace',
      model_type: 'custom_upload',
    })
  })
})

describe('trackPaywallHit', () => {
  it('captures paywall_hit for photo studio', () => {
    trackPaywallHit({ category: 'ring', steps_completed: 2 })
    expect(posthog.capture).toHaveBeenCalledWith('paywall_hit', {
      category: 'ring',
      steps_completed: 2,
    })
  })

  it('captures paywall_hit for CAD', () => {
    trackPaywallHit({ category: 'ring', steps_completed: 1 })
    expect(posthog.capture).toHaveBeenCalledWith('paywall_hit', {
      category: 'ring',
      steps_completed: 1,
    })
  })
})

describe('trackCadGenerationCompleted', () => {
  it('captures cad_generation_completed with correct shape', () => {
    trackCadGenerationCompleted({ category: 'ring', prompt_length: 42, duration_ms: 5000 })
    expect(posthog.capture).toHaveBeenCalledWith('cad_generation_completed', {
      category: 'ring',
      prompt_length: 42,
      duration_ms: 5000,
    })
  })
})

// ── CAD funnel events ────────────────────────────────

describe('trackCadStudioOpen', () => {
  it('captures cad_studio_open for text-to-cad', () => {
    trackCadStudioOpen({ source: 'text-to-cad' })
    expect(posthog.capture).toHaveBeenCalledWith('cad_studio_open', { source: 'text-to-cad' })
  })

  it('captures cad_studio_open for image-to-cad', () => {
    trackCadStudioOpen({ source: 'image-to-cad' })
    expect(posthog.capture).toHaveBeenCalledWith('cad_studio_open', { source: 'image-to-cad' })
  })
})

describe('trackCadReferenceUploaded', () => {
  it('captures cad_reference_uploaded with the added and running counts', () => {
    trackCadReferenceUploaded({ source: 'image-to-cad', image_count: 2, total_after_add: 3 })
    expect(posthog.capture).toHaveBeenCalledWith('cad_reference_uploaded', {
      source: 'image-to-cad',
      image_count: 2,
      total_after_add: 3,
    })
  })
})

describe('trackCadGenerationStarted', () => {
  it('captures cad_generation_started with the full shared property bundle', () => {
    trackCadGenerationStarted({
      source: 'image-to-cad',
      category: 'ring',
      prompt_length: 12,
      reference_image_count: 2,
      llm_tier: 'claude_opus_5_openrouter',
      is_first_ever: true,
    })
    expect(posthog.capture).toHaveBeenCalledWith('cad_generation_started', {
      source: 'image-to-cad',
      category: 'ring',
      prompt_length: 12,
      reference_image_count: 2,
      llm_tier: 'claude_opus_5_openrouter',
      is_first_ever: true,
    })
  })
})

describe('trackCadGenerationFailed', () => {
  it('captures a failure at start', () => {
    trackCadGenerationFailed({
      source: 'text-to-cad',
      failure_stage: 'start',
      duration_ms: 800,
      has_failure_message: true,
    })
    expect(posthog.capture).toHaveBeenCalledWith('cad_generation_failed', {
      source: 'text-to-cad',
      failure_stage: 'start',
      duration_ms: 800,
      has_failure_message: true,
    })
  })

  it('omits has_failure_message for a run failure, which this layer cannot see', () => {
    trackCadGenerationFailed({
      source: 'image-to-cad',
      failure_stage: 'run',
      duration_ms: 61000,
    })
    expect(posthog.capture).toHaveBeenCalledWith('cad_generation_failed', {
      source: 'image-to-cad',
      failure_stage: 'run',
      duration_ms: 61000,
    })
  })
})

describe('trackCadResultRestored', () => {
  it('captures an external restore, which is how email arrivals are counted', () => {
    trackCadResultRestored({ source: 'text-to-cad', entry: 'external', restore_ok: true })
    expect(posthog.capture).toHaveBeenCalledWith('cad_result_restored', {
      source: 'text-to-cad',
      entry: 'external',
      restore_ok: true,
    })
  })

  it('captures an internal restore from history', () => {
    trackCadResultRestored({ source: 'image-to-cad', entry: 'history', restore_ok: true })
    expect(posthog.capture).toHaveBeenCalledWith('cad_result_restored', {
      source: 'image-to-cad',
      entry: 'history',
      restore_ok: true,
    })
  })

  it('records a restore that failed to load', () => {
    trackCadResultRestored({ source: 'text-to-cad', entry: 'toast', restore_ok: false })
    expect(posthog.capture).toHaveBeenCalledWith('cad_result_restored', {
      source: 'text-to-cad',
      entry: 'toast',
      restore_ok: false,
    })
  })
})

describe('CAD amendments to existing events', () => {
  it('cad_generation_completed carries the new CAD properties', () => {
    trackCadGenerationCompleted({
      category: 'ring',
      prompt_length: 42,
      duration_ms: 5000,
      source: 'image-to-cad',
      reference_image_count: 1,
      llm_tier: 'claude_opus_5_openrouter',
      is_first_ever: false,
    })
    expect(posthog.capture).toHaveBeenCalledWith('cad_generation_completed', {
      category: 'ring',
      prompt_length: 42,
      duration_ms: 5000,
      source: 'image-to-cad',
      reference_image_count: 1,
      llm_tier: 'claude_opus_5_openrouter',
      is_first_ever: false,
    })
  })

  it('paywall_hit carries source for CAD', () => {
    trackPaywallHit({ category: 'ring', steps_completed: 1, source: 'text-to-cad' })
    expect(posthog.capture).toHaveBeenCalledWith('paywall_hit', {
      category: 'ring',
      steps_completed: 1,
      source: 'text-to-cad',
    })
  })

  it('paywall_hit from the photoshoot flow is unchanged and omits source', () => {
    // Guards the existing photoshoot dashboards: the amended signature must not
    // start emitting an extra key for callers that never pass one.
    trackPaywallHit({ category: 'ring', steps_completed: 3 })
    expect(posthog.capture).toHaveBeenCalledWith('paywall_hit', {
      category: 'ring',
      steps_completed: 3,
    })
  })

  it('download_clicked carries source for CAD downloads from history', () => {
    trackDownloadClicked({
      file_name: 'ring-abc.3dm',
      file_type: '3dm',
      context: 'generations',
      source: 'image-to-cad',
    })
    expect(posthog.capture).toHaveBeenCalledWith('download_clicked', {
      file_name: 'ring-abc.3dm',
      file_type: '3dm',
      context: 'generations',
      source: 'image-to-cad',
    })
  })
})

// ── Updated existing functions ──────────────────────────────────────

describe('trackGenerationComplete', () => {
  it('captures generation_completed with all new props', () => {
    trackGenerationComplete({
      source: 'unified-studio',
      category: 'ring',
      upload_type: 'mannequin',
      duration_ms: 3000,
      is_first_ever: true,
    })
    expect(posthog.capture).toHaveBeenCalledWith('generation_completed', {
      source: 'unified-studio',
      category: 'ring',
      upload_type: 'mannequin',
      duration_ms: 3000,
      is_first_ever: true,
    })
  })

  it('accepts null upload_type', () => {
    trackGenerationComplete({
      source: 'unified-studio',
      category: 'ring',
      upload_type: null,
      duration_ms: 3000,
      is_first_ever: false,
    })
    expect(posthog.capture).toHaveBeenCalledWith('generation_completed', expect.objectContaining({
      upload_type: null,
    }))
  })

  it('includes effort and jewelry_image_count when provided (high effort, 3 images)', () => {
    trackGenerationComplete({
      source: 'unified-studio',
      category: 'ring',
      upload_type: null,
      duration_ms: 3000,
      is_first_ever: false,
      effort: 'high',
      jewelry_image_count: 3,
    })
    expect(posthog.capture).toHaveBeenCalledWith('generation_completed', expect.objectContaining({
      effort: 'high',
      jewelry_image_count: 3,
    }))
  })

  it('omits effort and jewelry_image_count when not provided (e.g. upscale completion)', () => {
    trackGenerationComplete({
      source: 'unified-studio',
      category: 'ring',
      upload_type: null,
      duration_ms: 3000,
      is_first_ever: false,
    })
    const props = (posthog.capture as ReturnType<typeof vi.fn>).mock.calls.at(-1)![1]
    expect(props).not.toHaveProperty('effort')
    expect(props).not.toHaveProperty('jewelry_image_count')
  })

  it('includes aspect_ratio and resolution when provided', () => {
    trackGenerationComplete({
      source: 'unified-studio',
      category: 'ring',
      upload_type: null,
      duration_ms: 3000,
      is_first_ever: false,
      aspect_ratio: '3:4',
      resolution: '2K',
    })
    expect(posthog.capture).toHaveBeenCalledWith('generation_completed', expect.objectContaining({
      aspect_ratio: '3:4',
      resolution: '2K',
    }))
  })

  it('omits aspect_ratio and resolution when not provided', () => {
    trackGenerationComplete({
      source: 'unified-studio',
      category: 'ring',
      upload_type: null,
      duration_ms: 3000,
      is_first_ever: false,
    })
    const call = (posthog.capture as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1]
    expect(call.aspect_ratio).toBeUndefined()
    expect(call.resolution).toBeUndefined()
  })
})

describe('trackDownloadClicked', () => {
  it('captures download_clicked with no args', () => {
    trackDownloadClicked()
    expect(posthog.capture).toHaveBeenCalledWith('download_clicked', {})
  })

  it('captures download_clicked with category', () => {
    trackDownloadClicked({ category: 'ring', context: 'unified-studio' })
    expect(posthog.capture).toHaveBeenCalledWith('download_clicked', {
      category: 'ring',
      context: 'unified-studio',
    })
  })

  it('captures download_clicked without category (non-UnifiedStudio call site)', () => {
    trackDownloadClicked({ file_type: 'glb', context: 'text-to-cad' })
    expect(posthog.capture).toHaveBeenCalledWith('download_clicked', {
      file_type: 'glb',
      context: 'text-to-cad',
    })
  })
})

describe('trackAIFixSubmitted', () => {
  it('captures ai_fix_submitted with correct shape', () => {
    trackAIFixSubmitted({ category: 'ring', prompt_length: 42, workflow_id: 'wf-abc', regeneration_number: 2 })
    expect(posthog.capture).toHaveBeenCalledWith('ai_fix_submitted', {
      category: 'ring',
      prompt_length: 42,
      workflow_id: 'wf-abc',
      regeneration_number: 2,
    })
  })

  it('accepts null workflow_id', () => {
    trackAIFixSubmitted({ category: 'necklace', prompt_length: 10, workflow_id: null, regeneration_number: 1 })
    expect(posthog.capture).toHaveBeenCalledWith('ai_fix_submitted', expect.objectContaining({
      workflow_id: null,
    }))
  })
})

describe('trackPaymentSuccess', () => {
  it('captures payment_success with correct shape', () => {
    trackPaymentSuccess({ package: '$9', amount_usd: 9, currency_shown: 'USD' })
    expect(posthog.capture).toHaveBeenCalledWith('payment_success', {
      package: '$9',
      amount_usd: 9,
      currency_shown: 'USD',
    })
  })
})

describe('trackStarterPackPurchased', () => {
  it('captures starter_pack_purchased', () => {
    trackStarterPackPurchased()
    expect(posthog.capture).toHaveBeenCalledWith('starter_pack_purchased', undefined)
  })
})

// ── Onboarding / Upload Guide ──────────────────────────────────────

describe('trackUploadGuideViewed', () => {
  it('captures upload_guide_viewed', () => {
    trackUploadGuideViewed()
    expect(posthog.capture).toHaveBeenCalledWith('upload_guide_viewed', undefined)
  })
})

describe('trackUploadGuideAcknowledged', () => {
  it('captures upload_guide_acknowledged', () => {
    trackUploadGuideAcknowledged()
    expect(posthog.capture).toHaveBeenCalledWith('upload_guide_acknowledged', undefined)
  })
})

describe('trackAIFixModalOpened', () => {
  it('captures ai_fix_modal_opened with correct shape', () => {
    trackAIFixModalOpened({ category: 'ring', workflow_id: 'wf-123' })
    expect(posthog.capture).toHaveBeenCalledWith('ai_fix_modal_opened', {
      category: 'ring',
      workflow_id: 'wf-123',
    })
  })

  it('accepts null workflow_id', () => {
    trackAIFixModalOpened({ category: 'earring', workflow_id: null })
    expect(posthog.capture).toHaveBeenCalledWith('ai_fix_modal_opened', {
      category: 'earring',
      workflow_id: null,
    })
  })
})

describe('trackFeedbackModalOpened', () => {
  it('captures feedback_modal_opened with correct shape', () => {
    trackFeedbackModalOpened({ category: 'ring', workflow_id: 'wf-123' })
    expect(posthog.capture).toHaveBeenCalledWith('feedback_modal_opened', {
      category: 'ring',
      workflow_id: 'wf-123',
    })
  })

  it('accepts null workflow_id', () => {
    trackFeedbackModalOpened({ category: 'earring', workflow_id: null })
    expect(posthog.capture).toHaveBeenCalledWith('feedback_modal_opened', {
      category: 'earring',
      workflow_id: null,
    })
  })
})

describe('trackFeedbackSubmitted', () => {
  it('captures feedback_submitted with correct shape', () => {
    trackFeedbackSubmitted({
      category: 'ring',
      generation_type: 'photoshoot',
      complaint_length: 42,
      workflow_id: 'wf-123',
    })
    expect(posthog.capture).toHaveBeenCalledWith('feedback_submitted', {
      category: 'ring',
      generation_type: 'photoshoot',
      complaint_length: 42,
      workflow_id: 'wf-123',
    })
  })

  it('accepts null workflow_id', () => {
    trackFeedbackSubmitted({
      category: 'necklace',
      generation_type: 'photoshoot',
      complaint_length: 10,
      workflow_id: null,
    })
    expect(posthog.capture).toHaveBeenCalledWith('feedback_submitted', expect.objectContaining({
      workflow_id: null,
    }))
  })
})

describe('trackUserTypeSelected', () => {
  it('captures user_type_selected event', () => {
    trackUserTypeSelected({ user_type: 'jewelry_brand' })
    expect(posthog.capture).toHaveBeenCalledWith('user_type_selected', { user_type: 'jewelry_brand' })
  })

  it('persists user_type as a person property', () => {
    trackUserTypeSelected({ user_type: 'freelancer' })
    expect((posthog as any).setPersonProperties).toHaveBeenCalledWith({ user_type: 'freelancer' })
  })

  it('works for all user types', () => {
    const types = ['jewelry_brand', 'freelancer', 'researcher_student', 'content_creator'] as const
    types.forEach((user_type) => {
      trackUserTypeSelected({ user_type })
      expect(posthog.capture).toHaveBeenCalledWith('user_type_selected', { user_type })
    })
  })
})

// ── setUserProfession ──────────────────────────────────────────────

describe('setUserProfession', () => {
  it('calls setPersonProperties with profession', () => {
    setUserProfession('jewelry_brand')
    expect((posthog as any).setPersonProperties).toHaveBeenCalledWith({ profession: 'jewelry_brand' })
  })

  it('does not call setPersonProperties when __loaded is false', () => {
    ;(posthog as any).__loaded = false
    setUserProfession('freelancer')
    expect((posthog as any).setPersonProperties).not.toHaveBeenCalled()
    ;(posthog as any).__loaded = true
  })
})

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

// ── trackShopifyExported ────────────────────────────────────────────

describe('trackShopifyExported', () => {
  it('captures shopify_exported with no args (mirrors trackDownloadClicked)', () => {
    trackShopifyExported()
    expect(posthog.capture).toHaveBeenCalledWith('shopify_exported', {})
  })

  it('captures shopify_exported with context', () => {
    trackShopifyExported({ context: 'unified-studio' })
    expect(posthog.capture).toHaveBeenCalledWith('shopify_exported', {
      context: 'unified-studio',
    })
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

// ── getStarterPackPricingVariant (A/B experiment) ───────────────────

describe('getStarterPackPricingVariant', () => {
  it('returns the flag value (treatment) when loaded and identified', () => {
    ;(posthog as any).__loaded = true
    ;(posthog._isIdentified as any).mockReturnValue(true)
    ;(posthog.getFeatureFlag as any).mockReturnValue('treatment')
    expect(getStarterPackPricingVariant()).toBe('treatment')
    expect(posthog.getFeatureFlag).toHaveBeenCalledWith('starter-pack-pricing-experiment')
  })

  it('returns control when bucketed to control', () => {
    ;(posthog as any).__loaded = true
    ;(posthog._isIdentified as any).mockReturnValue(true)
    ;(posthog.getFeatureFlag as any).mockReturnValue('control')
    expect(getStarterPackPricingVariant()).toBe('control')
  })

  it('returns undefined and does not read the flag when not identified', () => {
    ;(posthog as any).__loaded = true
    ;(posthog._isIdentified as any).mockReturnValue(false)
    expect(getStarterPackPricingVariant()).toBeUndefined()
    expect(posthog.getFeatureFlag).not.toHaveBeenCalled()
  })

  it('returns undefined and does not read the flag when posthog is not loaded', () => {
    ;(posthog as any).__loaded = false
    ;(posthog._isIdentified as any).mockReturnValue(true)
    expect(getStarterPackPricingVariant()).toBeUndefined()
    expect(posthog.getFeatureFlag).not.toHaveBeenCalled()
    ;(posthog as any).__loaded = true
  })
})

// ── onPostHogFlagsLoaded ────────────────────────────────────────────

describe('onPostHogFlagsLoaded', () => {
  it('subscribes via posthog.onFeatureFlags when loaded and runs cb on flags', () => {
    ;(posthog as any).__loaded = true
    let captured: (() => void) | undefined
    ;(posthog.onFeatureFlags as any).mockImplementation((fn: () => void) => {
      captured = fn
      return () => {}
    })
    const cb = vi.fn()
    onPostHogFlagsLoaded(cb)
    expect(posthog.onFeatureFlags).toHaveBeenCalled()
    captured!()
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('runs cb immediately (fallback) when posthog is not loaded', () => {
    ;(posthog as any).__loaded = false
    const cb = vi.fn()
    const unsub = onPostHogFlagsLoaded(cb)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(posthog.onFeatureFlags).not.toHaveBeenCalled()
    expect(typeof unsub).toBe('function')
    ;(posthog as any).__loaded = true
  })
})


