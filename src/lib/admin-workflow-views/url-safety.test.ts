import { afterEach, describe, expect, it, vi } from 'vitest';

import { classifyUrl, isTrustedImageSrc } from './url-safety';

const SHA = 'a'.repeat(64);

describe('classifyUrl: what a string that looks like a link may become', () => {
  it('refuses script schemes, protocol-relative hosts and unknown schemes', () => {
    for (const bad of ['javascript:alert(1)', ' JavaScript:alert(1)', 'vbscript:msgbox(1)', '//evil.com/x.png', 'file:///etc/passwd', 'jav&#x09;ascript:alert(1)']) {
      expect(classifyUrl(bad)?.kind, bad).toBe('refused');
    }
  });

  it('refuses data: urls that are not raster images, including SVG', () => {
    expect(classifyUrl('data:text/html,<script>alert(1)</script>')?.kind).toBe('refused');
    expect(classifyUrl('data:image/svg+xml;base64,PHN2Zz4=')?.kind).toBe('refused');
    expect(classifyUrl('data:application/octet-stream;base64,AA')?.kind).toBe('refused');
    expect(classifyUrl('data:image/png;base64,AAA')).toEqual({ kind: 'image', url: 'data:image/png;base64,AAA' });
  });

  it('collapses content-addressed refs to the same-origin proxy and types them', () => {
    expect(classifyUrl(`https://api.formanova.ai/api/artifacts/${SHA}`, 'output_url')).toEqual({ kind: 'image', url: `/api/artifacts/${SHA}` });
    expect(classifyUrl(`azure://c/hashed/${SHA}`, 'glb_path')).toEqual({ kind: 'file', url: `/api/artifacts/${SHA}`, ext: null });
    expect(classifyUrl('https://cdn.example.com/a/ring.glb')).toEqual({ kind: 'model3d', url: 'https://cdn.example.com/a/ring.glb' });
    expect(classifyUrl('https://cdn.example.com/a/ring.3dm?sig=1')).toEqual({ kind: 'file', url: 'https://cdn.example.com/a/ring.3dm?sig=1', ext: '3dm' });
    expect(classifyUrl('https://example.com/docs')).toEqual({ kind: 'link', url: 'https://example.com/docs' });
  });

  it('keeps plain words as text', () => {
    expect(classifyUrl('soft morning light')).toBeNull();
    expect(classifyUrl('ratio 4:5')).toBeNull();
  });
});

describe('isTrustedImageSrc: only the artifact proxy and known storage hosts auto-load', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('loads same-origin, blob: and raster data: images', () => {
    expect(isTrustedImageSrc(`/api/artifacts/${SHA}`)).toBe(true);
    expect(isTrustedImageSrc('blob:http://localhost/1')).toBe(true);
    expect(isTrustedImageSrc('data:image/webp;base64,AA')).toBe(true);
  });

  it('loads the configured storage hosts only', () => {
    vi.stubEnv('VITE_AZURE_BLOB_BASE_URL', 'https://store.blob.core.windows.net');
    vi.stubEnv('VITE_MODEL_ASSET_BASE_URL', 'https://models.example.net/Models');
    expect(isTrustedImageSrc('https://store.blob.core.windows.net/c/x.png')).toBe(true);
    expect(isTrustedImageSrc('https://models.example.net/Models/m.jpg')).toBe(true);
    expect(isTrustedImageSrc('https://tracker.example.com/pixel.gif')).toBe(false);
    expect(isTrustedImageSrc('https://store.blob.core.windows.net.evil.com/x.png')).toBe(false);
  });

  it('never loads svg data or script urls', () => {
    expect(isTrustedImageSrc('data:image/svg+xml,<svg onload=alert(1)>')).toBe(false);
    expect(isTrustedImageSrc('javascript:alert(1)')).toBe(false);
    expect(isTrustedImageSrc('//evil.com/x.png')).toBe(false);
    expect(isTrustedImageSrc(null)).toBe(false);
  });
});
