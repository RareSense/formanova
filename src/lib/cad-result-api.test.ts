import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAuthenticatedFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/authenticated-fetch', () => ({
  authenticatedFetch: mockAuthenticatedFetch,
}));

import { fetchCadResult } from './cad-result-api';

function respondWith(body: unknown) {
  mockAuthenticatedFetch.mockResolvedValue({
    ok: true,
    json: async () => body,
  });
}

const artifact = (sha: string, type: string) => ({
  uri: `https://staging.formanova.ai/api/artifacts/${sha}`,
  url: `https://staging.formanova.ai/api/artifacts/${sha}`,
  type,
  bytes: 1024,
  sha256: sha,
});

/** The flat ring_cad_nurbs_v1 result shape, as the backend actually returns it. */
function nurbsResult(notAllSolid: boolean) {
  return {
    ok: true,
    status: 'completed',
    glb_artifact: artifact('a'.repeat(64), 'model/gltf-binary'),
    threedm_artifact: artifact('b'.repeat(64), 'model/vnd.rhino.3dm'),
    diagnostics: { success: true, not_all_solid: notAllSolid },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchCadResult solidity reporting', () => {
  // The whole point of carrying this field: an unsealed part cannot be cast or
  // printed. If the frontend drops the flag, the jeweler finds out at their
  // manufacturer instead of in the app.
  it('reports when parts are not closed solids', async () => {
    respondWith(nurbsResult(true));
    const result = await fetchCadResult('wf-1');
    expect(result.not_all_solid).toBe(true);
  });

  it('reports false when every part is a closed solid', async () => {
    respondWith(nurbsResult(false));
    const result = await fetchCadResult('wf-1');
    expect(result.not_all_solid).toBe(false);
  });

  it('still returns both artifact URLs alongside the flag', async () => {
    respondWith(nurbsResult(true));
    const result = await fetchCadResult('wf-1');
    expect(result.glb_url).toContain('a'.repeat(64));
    expect(result.threedm_url).toContain('b'.repeat(64));
  });

  it('reports false for legacy workflows, which carry no such diagnostic', async () => {
    // ring_generate_v1 and ring_edit_v1 never produced a .3dm and never
    // reported solidity. Absence must read as "nothing to warn about" rather
    // than as a warning, or every old run would show a scary banner.
    respondWith({
      success_final: [{ glb_artifact: { uri: 'azure://container/model.glb' } }],
    });
    const result = await fetchCadResult('wf-legacy');
    expect(result.not_all_solid).toBe(false);
    expect(result.azure_source).toBe('success_final');
  });

  it('reports false when the request fails', async () => {
    mockAuthenticatedFetch.mockResolvedValue({ ok: false, json: async () => ({}) });
    const result = await fetchCadResult('wf-1');
    expect(result.not_all_solid).toBe(false);
  });

  it('reports false when the fetch throws', async () => {
    mockAuthenticatedFetch.mockRejectedValue(new Error('offline'));
    const result = await fetchCadResult('wf-1');
    expect(result.not_all_solid).toBe(false);
  });
});

describe('fetchCadResult casting files', () => {
  it('returns the casting STL, stone list and status from the run result', async () => {
    respondWith({
      ...nurbsResult(false),
      casting_stl_artifact: artifact('c'.repeat(64), 'model/stl'),
      stones_artifact: artifact('d'.repeat(64), 'application/json'),
      derivatives: { casting_stl: { status: 'flagged', flags: ['thin_walls'] } },
    });
    const result = await fetchCadResult('wf-1');
    expect(result.casting?.castingStlUrl).toContain('c'.repeat(64));
    expect(result.casting?.stonesUrl).toContain('d'.repeat(64));
    expect(result.casting?.status).toBe('flagged');
    expect(result.casting?.flags).toEqual(['thin_walls']);
  });

  it('returns null casting for a run without them', async () => {
    respondWith(nurbsResult(false));
    expect((await fetchCadResult('wf-1')).casting).toBeNull();
  });
});
