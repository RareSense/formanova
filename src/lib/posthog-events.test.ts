import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock posthog-js BEFORE importing posthog-events
vi.mock('posthog-js', () => ({
  default: { capture: vi.fn(), setPersonProperties: vi.fn(), reset: vi.fn(), identify: vi.fn(), onFeatureFlags: vi.fn(), getFeatureFlag: vi.fn(), __loaded: true },
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
  trackRegenerateClicked,
  trackPaymentSuccess,
  trackStarterPackPurchased,
  trackUploadGuideViewed,
  trackUploadGuideAcknowledged,
  trackUserTypeSelected,
  trackFeedbackModalOpened,
  trackFeedbackSubmitted,
  setUserProfession,
  trackButtonLabelExperimentExposure,
  getButtonLabelVariant,
  trackTooltipExperimentExposure,
  getTooltipExperimentVariant,
  trackTooltipShown,
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

describe('trackRegenerateClicked', () => {
  it('captures regenerate_clicked with enriched props', () => {
    trackRegenerateClicked({ context: 'unified-studio', category: 'ring', regeneration_number: 1 })
    expect(posthog.capture).toHaveBeenCalledWith('regenerate_clicked', {
      context: 'unified-studio',
      category: 'ring',
      regeneration_number: 1,
    })
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

describe('trackFeedbackModalOpened', () => {
  it('captures feedback_modal_opened with via_tooltip true', () => {
    trackFeedbackModalOpened({ category: 'ring', workflow_id: 'wf-123', via_tooltip: true })
    expect(posthog.capture).toHaveBeenCalledWith('feedback_modal_opened', {
      category: 'ring',
      workflow_id: 'wf-123',
      via_tooltip: true,
    })
  })

  it('captures feedback_modal_opened with via_tooltip false', () => {
    trackFeedbackModalOpened({ category: 'earring', workflow_id: null, via_tooltip: false })
    expect(posthog.capture).toHaveBeenCalledWith('feedback_modal_opened', {
      category: 'earring',
      workflow_id: null,
      via_tooltip: false,
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

  it('does nothing when posthog is not loaded', () => {
    ;(posthog as any).__loaded = false
    trackButtonLabelExperimentExposure()
    expect(posthog.onFeatureFlags).not.toHaveBeenCalled()
    ;(posthog as any).__loaded = true
  });
})

// ── trackTooltipExperimentExposure ─────────────────────────────────

describe('trackTooltipExperimentExposure', () => {
  it('calls onFeatureFlags and then getFeatureFlag with tooltip-first-gen-experiment', () => {
    let captured: (() => void) | undefined;
    (posthog.onFeatureFlags as any).mockImplementation((fn: () => void) => {
      captured = fn;
    });
    trackTooltipExperimentExposure();
    expect(posthog.onFeatureFlags).toHaveBeenCalled();
    captured!();
    expect(posthog.getFeatureFlag).toHaveBeenCalledWith('tooltip-first-gen-experiment');
  });

  it('does nothing when posthog is not loaded', () => {
    ;(posthog as any).__loaded = false
    trackTooltipExperimentExposure()
    expect(posthog.onFeatureFlags).not.toHaveBeenCalled()
    ;(posthog as any).__loaded = true
  });
})

// ── getTooltipExperimentVariant ────────────────────────────────────

describe('getTooltipExperimentVariant', () => {
  it('returns the flag value when treatment', () => {
    (posthog.getFeatureFlag as any).mockReturnValue('treatment');
    expect(getTooltipExperimentVariant()).toBe('treatment');
    expect(posthog.getFeatureFlag).toHaveBeenCalledWith('tooltip-first-gen-experiment');
  });

  it('returns undefined when flag is not yet loaded', () => {
    (posthog.getFeatureFlag as any).mockReturnValue(undefined);
    expect(getTooltipExperimentVariant()).toBeUndefined();
  });

  it('returns undefined when posthog is not loaded', () => {
    ;(posthog as any).__loaded = false
    expect(getTooltipExperimentVariant()).toBeUndefined()
    expect(posthog.getFeatureFlag).not.toHaveBeenCalled()
    ;(posthog as any).__loaded = true
  });
})

// ── trackTooltipShown ──────────────────────────────────────────────

describe('trackTooltipShown', () => {
  it('calls capture with correct event name and properties', () => {
    trackTooltipShown();
    expect(posthog.capture).toHaveBeenCalledWith('tooltip_shown', {
      experiment: 'tooltip-first-gen-experiment',
    });
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

  it('returns undefined when posthog is not loaded', () => {
    ;(posthog as any).__loaded = false
    expect(getButtonLabelVariant()).toBeUndefined()
    expect(posthog.getFeatureFlag).not.toHaveBeenCalled()
    ;(posthog as any).__loaded = true
  });
})
