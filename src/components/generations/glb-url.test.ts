import { describe, expect, it } from 'vitest';
import { glbUrlNeedsAuth, resolveGlbUrl } from './ScissorGLBGrid';

const SHA = 'b'.repeat(64);

describe('resolveGlbUrl', () => {
  it('maps a content-addressed azure uri onto the same-origin artifact proxy', () => {
    // This is the regression: callers pass the raw artifact.uri, and fetching
    // an azure:// scheme fails every time, so the preview never loaded.
    expect(resolveGlbUrl(`azure://agentic-artifacts/hashed/${SHA}.glb`)).toBe(`/api/artifacts/${SHA}`);
  });

  it('never returns an azure:// url', () => {
    for (const uri of [
      `azure://agentic-artifacts/hashed/${SHA}.glb`,
      'azure://container/runs/1/model.glb',
    ]) {
      expect(resolveGlbUrl(uri).startsWith('azure://')).toBe(false);
    }
  });

  it('returns empty for an unresolvable reference so the caller shows the error state', () => {
    // No sha segment and no VITE_AZURE_BLOB_BASE_URL configured in tests.
    expect(resolveGlbUrl('azure://container/runs/1/model.glb')).toBe('');
    expect(resolveGlbUrl('')).toBe('');
  });

  it('passes ordinary http(s) urls through untouched', () => {
    expect(resolveGlbUrl('https://signed.example/ring.glb')).toBe('https://signed.example/ring.glb');
  });

  it('leaves an already-proxied path alone', () => {
    expect(resolveGlbUrl(`/api/artifacts/${SHA}`)).toBe(`/api/artifacts/${SHA}`);
  });
});

describe('glbUrlNeedsAuth', () => {
  it('authenticates same-origin proxy paths', () => {
    expect(glbUrlNeedsAuth(`/api/artifacts/${SHA}`)).toBe(true);
  });

  it('does not authenticate external signed urls', () => {
    expect(glbUrlNeedsAuth('https://signed.example/ring.glb')).toBe(false);
  });
});
