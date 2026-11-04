import { afterEach, describe, expect, it, vi } from 'vitest';
import { isCadUploadEnabled, isWeightStlEnabled } from './feature-flags';

describe('CAD rollout allowlists', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses env allowlists for gated CAD feature access', () => {
    vi.stubEnv('VITE_WEIGHT_STL_ALLOWLIST_EMAILS', 'maker@example.com');
    vi.stubEnv('VITE_CAD_UPLOAD_ALLOWLIST_EMAILS', 'cad@example.com');

    expect(isWeightStlEnabled('maker@example.com')).toBe(true);
    expect(isCadUploadEnabled('cad@example.com')).toBe(true);
  });

  it('normalizes comma-separated env allowlists and user email casing', () => {
    vi.stubEnv(
      'VITE_CAD_UPLOAD_ALLOWLIST_EMAILS',
      ' first@example.com, SECOND@example.com , , third@example.com ',
    );

    expect(isCadUploadEnabled('second@example.com')).toBe(true);
    expect(isCadUploadEnabled(' THIRD@example.com ')).toBe(true);
    expect(isCadUploadEnabled('missing@example.com')).toBe(false);
  });

  it('disables allowlisted gates when env values or emails are missing', () => {
    expect(isWeightStlEnabled('maker@example.com')).toBe(false);
    expect(isCadUploadEnabled(null)).toBe(false);
  });
});

describe('Ruby call (Done For You) rollout', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('"*" opens Ruby to every signed-in user, and keeps the card configured for visitors', async () => {
    vi.stubEnv('VITE_RUBY_CALL_ALLOWLIST_EMAILS', '*');
    const { isRubyCallEnabled, isRubyCallConfigured } = await import('./feature-flags');
    expect(isRubyCallEnabled('anyone@brand.com')).toBe(true);
    expect(isRubyCallEnabled('Never.Paid@Shop.co')).toBe(true);
    expect(isRubyCallEnabled(null)).toBe(false);
    expect(isRubyCallConfigured()).toBe(true);
  });

  it('without "*" only listed emails get Ruby, and "*" never leaks into other gates', async () => {
    vi.stubEnv('VITE_RUBY_CALL_ALLOWLIST_EMAILS', 'uswa@raresense.so');
    vi.stubEnv('VITE_CAD_UPLOAD_ALLOWLIST_EMAILS', '*');
    const { isRubyCallEnabled, isCadUploadEnabled } = await import('./feature-flags');
    expect(isRubyCallEnabled('uswa@raresense.so')).toBe(true);
    expect(isRubyCallEnabled('other@brand.com')).toBe(false);
    expect(isCadUploadEnabled('other@brand.com')).toBe(false);
  });
});
