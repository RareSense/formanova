import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAuthenticatedFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/authenticated-fetch', () => ({
  authenticatedFetch: mockAuthenticatedFetch,
}));

const mockFetchCadRings = vi.hoisted(() => vi.fn());
vi.mock('@/lib/cad-versions-api', () => ({ fetchCadRings: mockFetchCadRings }));

import { fetchCadResult, resolveCadModel } from './cad-result-api';

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

// One model with an older version made by another run and the delivered one.
// The delivered version's asset_id is what /result's output_asset_id names.
const vault = (workflowId: string) => [{
  set_id: 'set-1',
  versions: [
    { asset_id: 'v0', position: 0, source_workflow_id: 'other', glb_url: '/old.glb', threedm_url: '/old.3dm' },
    { asset_id: 'v1', position: 1, source_workflow_id: workflowId, glb_url: '/rep.glb', threedm_url: '/rep.3dm' },
  ],
}];

describe('supervised runs', () => {
  it('reads a 409 as still in progress and does not look anywhere else', async () => {
    mockAuthenticatedFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ detail: { message: 'workflow is waiting for human input', pending_human_tasks: [] } }),
    });
    const result = await fetchCadResult('wf-q');
    expect(result.pending).toBe(true);
    expect(result.glb_url).toBeNull();
    expect(mockFetchCadRings).not.toHaveBeenCalled();
  });

  it('is not pending for an ordinary result', async () => {
    respondWith(nurbsResult(false));
    expect((await fetchCadResult('wf-1')).pending).toBe(false);
  });

  it('finds a hand-made replacement in the CAD vault by output_asset_id', async () => {
    respondWith({ supervised_delivery: [{ note: 'replacement' }], output_asset_id: 'v1' });
    mockFetchCadRings.mockResolvedValue(vault('some-other-run'));
    const result = await fetchCadResult('wf-r');
    expect(result.glb_url).toBe('/rep.glb');
    expect(result.threedm_url).toBe('/rep.3dm');
  });

  it('never asks the vault about a run that says it failed', async () => {
    respondWith({ ok: false, status: 'failed', phase: 'cad_export' });
    const result = await fetchCadResult('wf-f');
    expect(result.glb_url).toBeNull();
    expect(mockFetchCadRings).not.toHaveBeenCalled();
  });
});

describe('resolveCadModel', () => {
  it('reads every file from a normal /result body without touching the vault', async () => {
    const model = await resolveCadModel('wf-1', nurbsResult(true));
    expect(model?.glbUrl).toContain('a'.repeat(64));
    expect(model?.threedmUrl).toContain('b'.repeat(64));
    expect(model?.notAllSolid).toBe(true);
    expect(mockFetchCadRings).not.toHaveBeenCalled();
  });

  it('falls back to the vault version named by output_asset_id', async () => {
    mockFetchCadRings.mockResolvedValue(vault('some-other-run'));
    const model = await resolveCadModel('wf-r', { supervised_delivery: [], output_asset_id: 'v1' });
    expect(model).toEqual({
      glbUrl: '/rep.glb', threedmUrl: '/rep.3dm', stlUrls: [], stepUrls: [],
      estimatedMetalMassG: null, notAllSolid: false,
    });
  });

  it('without output_asset_id, falls back to the version this run produced', async () => {
    mockFetchCadRings.mockResolvedValue(vault('wf-r'));
    const model = await resolveCadModel('wf-r', null);
    expect(model?.glbUrl).toBe('/rep.glb');
  });

  it('is null when neither /result nor the vault has a model', async () => {
    mockFetchCadRings.mockResolvedValue([]);
    expect(await resolveCadModel('wf-x', { supervised_delivery: [] })).toBeNull();
  });

  it('is null when the vault cannot be read', async () => {
    mockFetchCadRings.mockRejectedValue(new Error('Could not load your rings (500)'));
    expect(await resolveCadModel('wf-x', { supervised_delivery: [], output_asset_id: 'v1' })).toBeNull();
  });

  it('is null for an explicit failure, without a vault lookup', async () => {
    expect(await resolveCadModel('wf-f', { ok: false, status: 'failed' })).toBeNull();
    expect(mockFetchCadRings).not.toHaveBeenCalled();
  });
});

describe('hand-made replacements', () => {
  // The backend nests the replacement's files inside supervised_delivery. The
  // whole-body search must not pick those: the delivered version is the one
  // output_asset_id names in the CAD vault.
  const nested = (outputAssetId: string | null) => ({
    supervised_delivery: [{ glb_artifact: artifact('c'.repeat(64), 'model/gltf-binary') }],
    output_asset_id: outputAssetId,
  });

  it('reads the vault version output_asset_id names, not the nested files', async () => {
    mockFetchCadRings.mockResolvedValue(vault('some-other-run'));
    const model = await resolveCadModel('wf-r', nested('v1'));
    expect(model?.glbUrl).toBe('/rep.glb');
    expect(model?.threedmUrl).toBe('/rep.3dm');
  });

  it('cannot load a replacement whose output_asset_id is null, and never guesses another version', async () => {
    mockFetchCadRings.mockResolvedValue(vault('wf-r'));
    expect(await resolveCadModel('wf-r', nested(null))).toBeNull();
    expect(mockFetchCadRings).not.toHaveBeenCalled();
  });

  it('does not fall back to the run id when output_asset_id names no vault version', async () => {
    mockFetchCadRings.mockResolvedValue(vault('wf-r'));
    expect(await resolveCadModel('wf-r', nested('missing'))).toBeNull();
  });

  it('fetchCadResult shows the same vault version for a replacement', async () => {
    respondWith(nested('v1'));
    mockFetchCadRings.mockResolvedValue(vault('some-other-run'));
    const result = await fetchCadResult('wf-r');
    expect(result.glb_url).toBe('/rep.glb');
    expect(result.threedm_url).toBe('/rep.3dm');
    expect(result.pending).toBe(false);
  });

  it('fetchCadResult reports no model for a replacement with nothing saved', async () => {
    respondWith(nested(null));
    const result = await fetchCadResult('wf-r');
    expect(result.glb_url).toBeNull();
    expect(result.threedm_url).toBeNull();
  });
});
