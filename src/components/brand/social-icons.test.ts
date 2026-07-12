import { describe, it, expect } from 'vitest';
import { extractHandle, handleToUrl, PRESET_SOCIAL_PLATFORMS } from '@/components/brand/social-icons';

describe('extractHandle', () => {
  it('returns a bare handle unchanged', () => {
    expect(extractHandle('icecartel', 'instagram.com')).toBe('icecartel');
  });

  it('strips @, protocol, www, host, and trailing slashes', () => {
    expect(extractHandle('@icecartel', 'instagram.com')).toBe('icecartel');
    expect(extractHandle('https://www.instagram.com/icecartel/', 'instagram.com')).toBe('icecartel');
    expect(extractHandle('instagram.com/icecartel', 'instagram.com')).toBe('icecartel');
  });

  it('handles the tiktok @-path form', () => {
    expect(extractHandle('https://tiktok.com/@icecartel', 'tiktok.com')).toBe('icecartel');
  });
});

describe('handleToUrl', () => {
  const instagram = PRESET_SOCIAL_PLATFORMS.find((p) => p.key === 'instagram')!;
  const tiktok = PRESET_SOCIAL_PLATFORMS.find((p) => p.key === 'tiktok')!;

  it('builds a full profile URL from a bare handle', () => {
    expect(handleToUrl('icecartel', instagram.urlPrefix)).toBe('https://instagram.com/icecartel');
    expect(handleToUrl('icecartel', tiktok.urlPrefix)).toBe('https://tiktok.com/@icecartel');
  });

  it('does not double-prefix when a full URL or @handle is pasted', () => {
    expect(handleToUrl('https://instagram.com/icecartel', instagram.urlPrefix)).toBe('https://instagram.com/icecartel');
    expect(handleToUrl('@icecartel', tiktok.urlPrefix)).toBe('https://tiktok.com/@icecartel');
  });

  it('returns empty string for an empty handle', () => {
    expect(handleToUrl('', instagram.urlPrefix)).toBe('');
    expect(handleToUrl('  ', instagram.urlPrefix)).toBe('');
  });
});
