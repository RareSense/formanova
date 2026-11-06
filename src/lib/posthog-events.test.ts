import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock posthog-js BEFORE importing posthog-events
vi.mock('posthog-js', () => ({
  default: {
    capture: vi.fn(),
    // posthog-js 1.354.3: people has set and set_once only; there is no increment.
    people: { set: vi.fn(), set_once: vi.fn() },
    setPersonProperties: vi.fn(),
    reset: vi.fn(),
    identify: vi.fn(),
    __loaded: true,
  },
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
  trackCadImproveFinished,
  trackCadResultRestored,
  trackGenerationComplete,
  trackDownloadClicked,
  trackCatalogShootStarted,
  trackCatalogOpened,
  trackCatalogFileUploaded,
  trackCatalogModelLoaded,
  trackCatalogModelLoadFailed,
  trackCatalogShotCompleted,
  trackCatalogShotFailed,
  trackCatalogShootCompleted,
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
  trackRubyCtaClicked,
  trackRubyCallStarted,
  trackRubyCallConnected,
  trackRubyCallFailed,
  trackRubyQuoteShown,
  trackRubyPaymentLinkCreated,
  trackRubyPaymentReceived,
  trackRubyFilesUploaded,
  trackRubyTeamContactShown,
  trackRubyCallEnded,
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

describe('trackCadImproveFinished', () => {
  it('captures the event and updates the identified person once', () => {
    const props = {
      workflow_id: 'state-improve-1',
      source: 'image-to-cad' as const,
      from_version: 1,
      to_version: 2,
      new_version_created: true,
      outcome: 'improved' as const,
      changed: true,
      improved_issue_count: 1,
      new_issue_count: 0,
      open_issue_count: 0,
      duration_ms: 5000,
    }

    trackCadImproveFinished(props)

    expect(posthog.capture).toHaveBeenCalledWith('cad_improve_finished', props)
    expect(posthog.people.set).toHaveBeenCalledWith({
      last_improve_at: expect.any(String),
      last_improve_outcome: 'improved',
    })
    expect(posthog.identify).not.toHaveBeenCalled()
  })

  it('never throws into the app, even when the PostHog person API fails', () => {
    // A throw here once left a failed Improve stuck on "generating": the
    // failure handler emits this before it marks the run failed.
    vi.mocked(posthog.people.set).mockImplementationOnce(() => {
      throw new TypeError('people.set is not a function')
    })
    expect(() => trackCadImproveFinished({
      workflow_id: 'state-improve-2',
      source: 'text-to-cad',
      from_version: 2,
      new_version_created: false,
      outcome: 'no_safe_fix',
      changed: false,
      improved_issue_count: 0,
      new_issue_count: 0,
      open_issue_count: 1,
      duration_ms: 3000,
    })).not.toThrow()
    expect(posthog.capture).toHaveBeenCalledWith('cad_improve_finished', expect.objectContaining({ outcome: 'no_safe_fix' }))
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
      operation: 'generate',
      workflow_id: 'state-abc123',
    })
    expect(posthog.capture).toHaveBeenCalledWith('cad_generation_started', {
      source: 'image-to-cad',
      category: 'ring',
      prompt_length: 12,
      reference_image_count: 2,
      llm_tier: 'claude_opus_5_openrouter',
      is_first_ever: true,
      operation: 'generate',
      workflow_id: 'state-abc123',
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
      workflow_id: 'state-abc123',
    })
    expect(posthog.capture).toHaveBeenCalledWith('cad_generation_failed', {
      source: 'image-to-cad',
      failure_stage: 'run',
      duration_ms: 61000,
      workflow_id: 'state-abc123',
    })
  })

  it('carries no workflow_id for a start failure, because the run never got one', () => {
    // Not an oversight: a start-stage failure means the backend never returned
    // a workflow id, so there is nothing to join on. Sending a placeholder
    // would create a run that does not exist.
    trackCadGenerationFailed({
      source: 'text-to-cad',
      failure_stage: 'start',
      duration_ms: 400,
      has_failure_message: false,
    })
    expect(posthog.capture).toHaveBeenCalledWith(
      'cad_generation_failed',
      expect.not.objectContaining({ workflow_id: expect.anything() }),
    )
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

describe('trackCatalogShootStarted', () => {
  it('captures catalog_shoot_started with the size of the shoot', () => {
    trackCatalogShootStarted({ shoot_id: 's1', pieces: 3, pictures: 30, photo_backgrounds: 1, metals: 2 })
    expect(posthog.capture).toHaveBeenCalledWith('catalog_shoot_started', {
      shoot_id: 's1',
      pieces: 3,
      pictures: 30,
      photo_backgrounds: 1,
      metals: 2,
    })
  })
})

// ── Catalog from CAD funnel (mirrors the CAD funnel) ────────────────

describe('trackCatalogOpened', () => {
  it('captures catalog_opened with no properties, as the page has one tool', () => {
    trackCatalogOpened()
    expect(posthog.capture).toHaveBeenCalledWith('catalog_opened', undefined)
  })
})

describe('trackCatalogFileUploaded', () => {
  it('captures catalog_file_uploaded with the added and running piece counts', () => {
    trackCatalogFileUploaded({ piece_count: 2, total_after_add: 5 })
    expect(posthog.capture).toHaveBeenCalledWith('catalog_file_uploaded', {
      piece_count: 2,
      total_after_add: 5,
    })
  })
})

describe('trackCatalogModelLoaded', () => {
  it('captures catalog_model_loaded with duration and file size', () => {
    trackCatalogModelLoaded({ duration_ms: 4200, file_bytes: 52_000_000 })
    expect(posthog.capture).toHaveBeenCalledWith('catalog_model_loaded', {
      duration_ms: 4200,
      file_bytes: 52_000_000,
    })
  })
})

describe('trackCatalogModelLoadFailed', () => {
  it('captures catalog_model_load_failed with duration and file size, never the message', () => {
    trackCatalogModelLoadFailed({ duration_ms: 900, file_bytes: 52_000_000 })
    expect(posthog.capture).toHaveBeenCalledWith('catalog_model_load_failed', {
      duration_ms: 900,
      file_bytes: 52_000_000,
    })
  })
})

describe('trackCatalogShotCompleted', () => {
  it('captures catalog_shot_completed with kind, category, resolution and duration', () => {
    trackCatalogShotCompleted({ kind: 'photo', category: 'ring', resolution: '2K', duration_ms: 61000 })
    expect(posthog.capture).toHaveBeenCalledWith('catalog_shot_completed', {
      kind: 'photo',
      category: 'ring',
      resolution: '2K',
      duration_ms: 61000,
    })
  })
})

describe('trackCatalogShotFailed', () => {
  it('captures catalog_shot_failed with the failure stage and no error text', () => {
    trackCatalogShotFailed({ kind: 'white', category: 'pendant', resolution: '1K', failure_stage: 'run', duration_ms: 3000 })
    expect(posthog.capture).toHaveBeenCalledWith('catalog_shot_failed', {
      kind: 'white',
      category: 'pendant',
      resolution: '1K',
      failure_stage: 'run',
      duration_ms: 3000,
    })
  })

  it('supports the draw stage, where no paid run was sent', () => {
    trackCatalogShotFailed({ kind: 'photo', category: 'ring', resolution: '1K', failure_stage: 'draw', duration_ms: 12 })
    expect(posthog.capture).toHaveBeenCalledWith('catalog_shot_failed', expect.objectContaining({ failure_stage: 'draw' }))
  })
})

describe('trackCatalogShootCompleted', () => {
  it('captures catalog_shoot_completed with the settled counts', () => {
    trackCatalogShootCompleted({ shoot_id: 's1', succeeded: 7, failed: 1, stopped: false, abandoned: false, duration_ms: 120000 })
    expect(posthog.capture).toHaveBeenCalledWith('catalog_shoot_completed', {
      shoot_id: 's1',
      succeeded: 7,
      failed: 1,
      stopped: false,
      abandoned: false,
      duration_ms: 120000,
    })
  })

  it('reports a shoot cut off by leaving the page as abandoned', () => {
    trackCatalogShootCompleted({ shoot_id: 's2', succeeded: 1, failed: 0, stopped: false, abandoned: true, duration_ms: 5000 })
    expect(posthog.capture).toHaveBeenCalledWith('catalog_shoot_completed', expect.objectContaining({ shoot_id: 's2', abandoned: true }))
  })
})

// ── Ruby (Done For You) funnel ──────────────────────────────────────

describe('Ruby funnel events', () => {
  it('each captures its own event with exactly the props given', () => {
    trackRubyCtaClicked({ signed_in: false })
    trackRubyCallStarted({ language: 'en' })
    trackRubyCallConnected({ language: 'en', connect_ms: 1200 })
    trackRubyCallFailed({ error_code: 'mic_denied', stage: 'connecting' })
    trackRubyQuoteShown({ approved: true, total_cents: 3400, image_count: 5, sizes: '2k', turnaround: 'standard', installments: 1, last_offer: false, quote_number: 1 })
    trackRubyPaymentLinkCreated({ total_cents: 3400, first_payment_cents: 3400, installments: 1, simulated: false })
    trackRubyPaymentReceived({ amount_cents: 3400, seconds_into_call: 95 })
    trackRubyFilesUploaded({ purpose: 'jewelry_photos', uploaded: 3, failed: 1 })
    trackRubyTeamContactShown()
    trackRubyCallEnded({ duration_s: 140, reason: 'ruby_closed', quotes_shown: 2, link_created: true, paid: true, files_uploaded: 3, error_code: null })
    expect(vi.mocked(posthog.capture).mock.calls).toEqual([
      ['ruby_cta_clicked', { signed_in: false }],
      ['ruby_call_started', { language: 'en' }],
      ['ruby_call_connected', { language: 'en', connect_ms: 1200 }],
      ['ruby_call_failed', { error_code: 'mic_denied', stage: 'connecting' }],
      ['ruby_quote_shown', { approved: true, total_cents: 3400, image_count: 5, sizes: '2k', turnaround: 'standard', installments: 1, last_offer: false, quote_number: 1 }],
      ['ruby_payment_link_created', { total_cents: 3400, first_payment_cents: 3400, installments: 1, simulated: false }],
      ['ruby_payment_received', { amount_cents: 3400, seconds_into_call: 95 }],
      ['ruby_files_uploaded', { purpose: 'jewelry_photos', uploaded: 3, failed: 1 }],
      ['ruby_team_contact_shown', undefined],
      ['ruby_call_ended', { duration_s: 140, reason: 'ruby_closed', quotes_shown: 2, link_created: true, paid: true, files_uploaded: 3, error_code: null }],
    ])
  })
})
