import { describe, it, expect, beforeEach } from 'vitest'

import { consumeFirstGeneration } from './posthog-events'
import {
  resolveCadSource,
  resolveRestoreEntry,
  consumeFirstCadGeneration,
  buildCadGenerationProps,
  cadSourceFromSourceType,
  cadRouteFromSource,
  CAD_RESTORE_SRC_PARAM,
} from './cad-analytics'

beforeEach(() => {
  localStorage.clear()
})

// -- resolveCadSource -------------------------------------------------------

describe('resolveCadSource', () => {
  it('maps the text-to-cad route', () => {
    expect(resolveCadSource('/text-to-cad')).toBe('text-to-cad')
  })

  it('maps the image-to-cad route', () => {
    expect(resolveCadSource('/image-to-cad')).toBe('image-to-cad')
  })
})

// -- resolveRestoreEntry ----------------------------------------------------

describe('resolveRestoreEntry', () => {
  const withSrc = (value: string) => new URLSearchParams({ [CAD_RESTORE_SRC_PARAM]: value })

  it('reads each marker we write ourselves', () => {
    expect(resolveRestoreEntry(withSrc('history'))).toBe('history')
    expect(resolveRestoreEntry(withSrc('toast'))).toBe('toast')
    expect(resolveRestoreEntry(withSrc('header'))).toBe('header')
  })

  it('treats a missing marker as external, which is how email arrivals are counted', () => {
    expect(resolveRestoreEntry(new URLSearchParams())).toBe('external')
    expect(resolveRestoreEntry(new URLSearchParams({ workflow_id: 'abc' }))).toBe('external')
  })

  it('falls back to external for an empty or unrecognised marker', () => {
    // A malformed marker must never read as internal: silently bucketing it as
    // history would hide a real external arrival, which is the number this
    // event exists to measure.
    expect(resolveRestoreEntry(withSrc(''))).toBe('external')
    expect(resolveRestoreEntry(withSrc('   '))).toBe('external')
    expect(resolveRestoreEntry(withSrc('nonsense'))).toBe('external')
    expect(resolveRestoreEntry(withSrc('HISTORY'))).toBe('external')
  })

  it('accepts a raw query string as well as URLSearchParams', () => {
    expect(resolveRestoreEntry('?workflow_id=abc&src=history')).toBe('history')
    expect(resolveRestoreEntry('?workflow_id=abc')).toBe('external')
  })
})

// -- consumeFirstCadGeneration ----------------------------------------------

describe('consumeFirstCadGeneration', () => {
  it('returns true once then false forever', () => {
    expect(consumeFirstCadGeneration()).toBe(true)
    expect(consumeFirstCadGeneration()).toBe(false)
    expect(consumeFirstCadGeneration()).toBe(false)
  })

  it('does not consume the photoshoot first-generation flag', () => {
    // The regression this separate key exists to prevent: sharing one key means
    // a user whose first ever generation is CAD would make their first
    // photoshoot report is_first_ever: false.
    expect(consumeFirstCadGeneration()).toBe(true)
    expect(consumeFirstGeneration()).toBe(true)
  })

  it('is not consumed by the photoshoot first-generation flag', () => {
    expect(consumeFirstGeneration()).toBe(true)
    expect(consumeFirstCadGeneration()).toBe(true)
  })
})

// -- buildCadGenerationProps ------------------------------------------------

describe('buildCadGenerationProps', () => {
  it('reports zero reference images for text-to-cad', () => {
    const props = buildCadGenerationProps({
      cadRoute: '/text-to-cad',
      prompt: 'a solitaire ring',
      referenceImageCount: 0,
      tier: 'claude_opus_5_openrouter',
    })

    expect(props).toEqual({
      source: 'text-to-cad',
      category: 'ring',
      prompt_length: 16,
      reference_image_count: 0,
      llm_tier: 'claude_opus_5_openrouter',
    })
  })

  it('reports the real reference count for image-to-cad', () => {
    const props = buildCadGenerationProps({
      cadRoute: '/image-to-cad',
      prompt: '',
      referenceImageCount: 3,
      tier: 'gpt_5_6_luna_openrouter',
    })

    expect(props.source).toBe('image-to-cad')
    expect(props.reference_image_count).toBe(3)
    expect(props.prompt_length).toBe(0)
  })

  it('measures the trimmed prompt so whitespace does not inflate the length', () => {
    const props = buildCadGenerationProps({
      cadRoute: '/text-to-cad',
      prompt: '   ring   ',
      referenceImageCount: 0,
      tier: 'claude_opus_5_openrouter',
    })

    expect(props.prompt_length).toBe(4)
  })

  it('always reports the ring category, which is all CAD produces today', () => {
    expect(
      buildCadGenerationProps({
        cadRoute: '/image-to-cad',
        prompt: 'x',
        referenceImageCount: 1,
        tier: 'claude_opus_5_openrouter',
      }).category,
    ).toBe('ring')
  })
})

// -- source_type bridging ---------------------------------------------------

describe('cadSourceFromSourceType', () => {
  it('maps the history source_type values', () => {
    expect(cadSourceFromSourceType('image_to_cad')).toBe('image-to-cad')
    expect(cadSourceFromSourceType('text_to_cad')).toBe('text-to-cad')
  })

  it('falls back to text-to-cad for anything else', () => {
    // The history API can still emit 'unknown' for older rows. Text-to-CAD is
    // the safer default: it is the original tool, so a misfiled legacy row is
    // far more likely to be one of those than an image run.
    expect(cadSourceFromSourceType('unknown')).toBe('text-to-cad')
    expect(cadSourceFromSourceType('')).toBe('text-to-cad')
  })
})

describe('cadRouteFromSource', () => {
  it('round-trips with resolveCadSource', () => {
    expect(resolveCadSource(cadRouteFromSource('image-to-cad'))).toBe('image-to-cad')
    expect(resolveCadSource(cadRouteFromSource('text-to-cad'))).toBe('text-to-cad')
  })

  it('produces the real route paths', () => {
    expect(cadRouteFromSource('image-to-cad')).toBe('/image-to-cad')
    expect(cadRouteFromSource('text-to-cad')).toBe('/text-to-cad')
  })
})
