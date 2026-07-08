import { afterEach, describe, expect, it, vi } from 'vitest';
import { azureUriToUrl } from './azure-utils';

describe('azureUriToUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns an empty string for missing input', () => {
    expect(azureUriToUrl(undefined)).toBe('');
    expect(azureUriToUrl(null)).toBe('');
    expect(azureUriToUrl('')).toBe('');
  });

  it('passes through non-azure URLs unchanged', () => {
    expect(azureUriToUrl('https://cdn.example.com/model.glb')).toBe(
      'https://cdn.example.com/model.glb',
    );
    expect(azureUriToUrl('/api/artifacts/example')).toBe('/api/artifacts/example');
  });

  it('converts azure URIs with the configured blob base URL', () => {
    vi.stubEnv('VITE_AZURE_BLOB_BASE_URL', 'https://snapwear.blob.core.windows.net');

    expect(azureUriToUrl('azure://container/path/file.png')).toBe(
      'https://snapwear.blob.core.windows.net/container/path/file.png',
    );
  });

  const SHA = '1dace00bfb3dc0a57dec25c5f9e3ab0ec7bf44e92b71d30a78856fa0b75e7b8c';

  it('collapses content-addressed blobs to the same-origin artifact proxy', () => {
    vi.stubEnv('VITE_AZURE_BLOB_BASE_URL', 'https://snapwear.blob.core.windows.net');

    // azure:// with a sha256 path segment -> proxy
    expect(azureUriToUrl(`azure://results/${SHA}`)).toBe(`/api/artifacts/${SHA}`);
    // raw cross-origin blob URL with a sha (+extension, +SAS query) -> proxy
    expect(azureUriToUrl(`https://snapwear.blob.core.windows.net/results/${SHA}.png?sv=2021&sig=abc`))
      .toBe(`/api/artifacts/${SHA}`);
    // already-proxy URL stays proxy (idempotent)
    expect(azureUriToUrl(`https://formanova.ai/api/artifacts/${SHA}`)).toBe(`/api/artifacts/${SHA}`);
  });

  it('never emits a raw blob host for a content-addressed image (regression guard)', () => {
    vi.stubEnv('VITE_AZURE_BLOB_BASE_URL', 'https://snapwear.blob.core.windows.net');
    const out = azureUriToUrl(`https://snapwear.blob.core.windows.net/results/${SHA}.jpg`);
    expect(out).not.toContain('blob.core.windows.net');
    expect(out.startsWith('/api/artifacts/')).toBe(true);
  });

  it('trims trailing slashes from the base URL and leading slashes from the azure path', () => {
    vi.stubEnv('VITE_AZURE_BLOB_BASE_URL', 'https://snapwear.blob.core.windows.net///');

    expect(azureUriToUrl('azure:///container/path/file.png')).toBe(
      'https://snapwear.blob.core.windows.net/container/path/file.png',
    );
  });

  it('returns an empty string for azure URIs when the configured base URL is missing or invalid', () => {
    vi.stubEnv('VITE_AZURE_BLOB_BASE_URL', '');
    expect(azureUriToUrl('azure://container/path/file.png')).toBe('');

    vi.stubEnv('VITE_AZURE_BLOB_BASE_URL', 'not-a-url');
    expect(azureUriToUrl('azure://container/path/file.png')).toBe('');
  });
});
