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
  setUserProfession,
  getCoachmarkVariant,
  getEligibleCoachmarkVariant,
  isCoachmarkEligible,
  markStarterPackForCoachmark,
  suppressCoachmark,
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

// ── getCoachmarkVariant (A/B experiment) ────────────────────────────

describe('getCoachmarkVariant', () => {
  it('returns the flag variant when loaded and identified', () => {
    ;(posthog as any).__loaded = true
    ;(posthog._isIdentified as any).mockReturnValue(true)
    ;(posthog.getFeatureFlag as any).mockReturnValue('treatment')
    expect(getCoachmarkVariant()).toBe('treatment')
    expect(posthog.getFeatureFlag).toHaveBeenCalledWith('coachmark-experiment')
  })

  it('passes through the control variant unchanged', () => {
    ;(posthog._isIdentified as any).mockReturnValue(true)
    ;(posthog.getFeatureFlag as any).mockReturnValue('control')
    expect(getCoachmarkVariant()).toBe('control')
  })

  it('returns undefined and never reads the flag when not identified', () => {
    ;(posthog._isIdentified as any).mockReturnValue(false)
    expect(getCoachmarkVariant()).toBeUndefined()
    expect(posthog.getFeatureFlag).not.toHaveBeenCalled()
  })

  it('returns undefined and never reads the flag when posthog is not loaded', () => {
    ;(posthog as any).__loaded = false
    ;(posthog._isIdentified as any).mockReturnValue(true)
    expect(getCoachmarkVariant()).toBeUndefined()
    expect(posthog.getFeatureFlag).not.toHaveBeenCalled()
    ;(posthog as any).__loaded = true
  })
})

// --- Coachmark eligibility (localStorage targeting) ---

describe('coachmark eligibility', () => {
  it('is not eligible by default (no starter pack purchased)', () => {
    expect(isCoachmarkEligible()).toBe(false)
  })

  it('becomes eligible after a starter pack purchase', () => {
    markStarterPackForCoachmark()
    expect(isCoachmarkEligible()).toBe(true)
  })

  it('is no longer eligible once suppressed, even with a starter pack', () => {
    markStarterPackForCoachmark()
    suppressCoachmark()
    expect(isCoachmarkEligible()).toBe(false)
  })
})

describe('getEligibleCoachmarkVariant', () => {
  it('returns undefined and never reads the flag when not eligible', () => {
    ;(posthog._isIdentified as any).mockReturnValue(true)
    ;(posthog.getFeatureFlag as any).mockReturnValue('treatment')
    expect(getEligibleCoachmarkVariant()).toBeUndefined()
    expect(posthog.getFeatureFlag).not.toHaveBeenCalled()
  })

  it('returns the variant for an eligible, identified user', () => {
    markStarterPackForCoachmark()
    ;(posthog._isIdentified as any).mockReturnValue(true)
    ;(posthog.getFeatureFlag as any).mockReturnValue('treatment')
    expect(getEligibleCoachmarkVariant()).toBe('treatment')
    expect(posthog.getFeatureFlag).toHaveBeenCalledWith('coachmark-experiment')
  })

  it('returns undefined and never reads the flag once the user is suppressed', () => {
    markStarterPackForCoachmark()
    suppressCoachmark()
    ;(posthog._isIdentified as any).mockReturnValue(true)
    ;(posthog.getFeatureFlag as any).mockReturnValue('treatment')
    expect(getEligibleCoachmarkVariant()).toBeUndefined()
    expect(posthog.getFeatureFlag).not.toHaveBeenCalled()
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


