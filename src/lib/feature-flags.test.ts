import { afterEach, describe, expect, it, vi } from 'vitest';
import { isCadToCatalogEnabled, isCadUploadEnabled, isWeightStlEnabled } from './feature-flags';

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

describe('Catalog from CAD allowlist', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('opens Catalog from CAD only to allowlisted emails', () => {
    vi.stubEnv('VITE_CAD_TO_CATALOG_ALLOWLIST_EMAILS', 'shoot@example.com, Other@Example.com');
    expect(isCadToCatalogEnabled('shoot@example.com')).toBe(true);
    expect(isCadToCatalogEnabled('OTHER@example.com')).toBe(true);
    expect(isCadToCatalogEnabled('nobody@example.com')).toBe(false);
    expect(isCadToCatalogEnabled(null)).toBe(false);
  });

  it('opens it to everyone with "*" (staging), and to nobody when unset (production default)', () => {
    vi.stubEnv('VITE_CAD_TO_CATALOG_ALLOWLIST_EMAILS', ' * ');
    expect(isCadToCatalogEnabled('anyone@example.com')).toBe(true);
    vi.stubEnv('VITE_CAD_TO_CATALOG_ALLOWLIST_EMAILS', '');
    expect(isCadToCatalogEnabled('anyone@example.com')).toBe(false);
  });
});
