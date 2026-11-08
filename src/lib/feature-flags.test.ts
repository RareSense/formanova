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

describe('allowlist gates', () => {
  afterEach(() => vi.unstubAllEnvs());

  // Owner, 2026-11-08: Done For You and Ruby have no allowlist; "*" means nothing to the gates that remain.
  it('"*" never opens a gate', async () => {
    vi.stubEnv('VITE_CAD_UPLOAD_ALLOWLIST_EMAILS', '*');
    const flags = await import('./feature-flags');
    expect(flags.isCadUploadEnabled('other@brand.com')).toBe(false);
    expect('isRubyCallEnabled' in flags).toBe(false);
  });
});

describe('CAD agent allowlist', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('opens only for listed emails, case-insensitive', async () => {
    vi.stubEnv('VITE_CAD_AGENT_ALLOWLIST_EMAILS', 'owner@example.com');
    const { isCadAgentEnabled } = await import('./feature-flags');
    expect(isCadAgentEnabled(' OWNER@example.com ')).toBe(true);
    expect(isCadAgentEnabled('other@example.com')).toBe(false);
    expect(isCadAgentEnabled(null)).toBe(false);
  });

  it('is closed when the variable is unset', async () => {
    const { isCadAgentEnabled } = await import('./feature-flags');
    expect(isCadAgentEnabled('owner@example.com')).toBe(false);
  });
});
