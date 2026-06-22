import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { saveUpscaleIntent, loadUpscaleIntent, clearUpscaleIntent } from './upscale-intent';

const baseIntent = {
  imageUri: 'https://blob.example/result.png?sas=1',
  resolution: '2K' as const,
  factor: 4,
  isProductShot: false,
  jewelryType: 'ring',
};

beforeEach(() => {
  sessionStorage.clear();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('upscale-intent persistence', () => {
  it('round-trips a saved intent (survives the pricing -> checkout -> return path)', () => {
    saveUpscaleIntent(baseIntent);
    const loaded = loadUpscaleIntent();
    expect(loaded).toMatchObject(baseIntent);
    expect(typeof loaded?.savedAt).toBe('number');
  });

  it('returns null when nothing is stored', () => {
    expect(loadUpscaleIntent()).toBeNull();
  });

  it('clearUpscaleIntent removes the stored intent', () => {
    saveUpscaleIntent(baseIntent);
    clearUpscaleIntent();
    expect(loadUpscaleIntent()).toBeNull();
  });

  it('expires and self-clears an intent older than the TTL', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    saveUpscaleIntent(baseIntent);

    // Advance just past the 1 hour TTL.
    vi.setSystemTime(new Date('2026-01-01T01:00:01Z'));
    expect(loadUpscaleIntent()).toBeNull();
    // The expired entry is removed, not just hidden.
    expect(sessionStorage.getItem('formanova_pending_upscale_v1')).toBeNull();
  });

  it('keeps an intent that is still within the TTL', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    saveUpscaleIntent(baseIntent);
    vi.setSystemTime(new Date('2026-01-01T00:59:00Z'));
    expect(loadUpscaleIntent()?.factor).toBe(4);
  });

  it('returns null and self-clears on malformed JSON', () => {
    sessionStorage.setItem('formanova_pending_upscale_v1', '{not valid json');
    expect(loadUpscaleIntent()).toBeNull();
  });

  it('rejects a payload missing required fields', () => {
    sessionStorage.setItem(
      'formanova_pending_upscale_v1',
      JSON.stringify({ imageUri: 'x', savedAt: Date.now() }), // no factor
    );
    expect(loadUpscaleIntent()).toBeNull();
    expect(sessionStorage.getItem('formanova_pending_upscale_v1')).toBeNull();
  });
});
