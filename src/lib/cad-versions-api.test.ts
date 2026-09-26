import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/authenticated-fetch', () => ({ authenticatedFetch: vi.fn() }));

import { authenticatedFetch } from '@/lib/authenticated-fetch';
import {
  CadImproveError,
  canImproveVersion,
  fetchImproveOutcome,
  fetchCadRings,
  findRingForWorkflow,
  latestVersion,
  readImproveResultFailure,
  startImproveFromVersion,
  versionLabel,
} from './cad-versions-api';

const fetchMock = vi.mocked(authenticatedFetch);

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

// Shaped as GET /cad/rings really answers: source_workflow_id and position
// live on the VERSION, and `label` is the improve verdict, not "V2".
const RING = {
  set_id: 'set_1',
  versions: [
    { asset_id: 'a1', position: 0, source_workflow_id: 'wf_1', improvable: true },
    { asset_id: 'a2', position: 1, source_workflow_id: 'wf_2', improvable: true,
      label: { code: 'looks_better', text: 'Looks better' } },
  ],
};

beforeEach(() => {
  fetchMock.mockReset();
});

describe('latestVersion', () => {
  it('is the highest position, whatever order the list arrives in', () => {
    expect(latestVersion(RING)?.asset_id).toBe('a2');
    const reversed = { ...RING, versions: [...RING.versions].reverse() };
    expect(latestVersion(reversed)?.asset_id).toBe('a2');
  });

  it('is null for a ring with no versions, so no button is offered', () => {
    expect(latestVersion({ set_id: 's', versions: [] })).toBeNull();
  });
});

describe('versionLabel', () => {
  it('counts from one: position 0 is the ring the user first made', () => {
    expect(versionLabel({ asset_id: 'a1', position: 0 })).toBe('V1');
    expect(versionLabel({ asset_id: 'a2', position: 2 })).toBe('V3');
  });
});

describe('fetchCadRings', () => {
  it("rewrites the vault's auth-gated links to the app's own proxy", async () => {
    const sha = 'b'.repeat(64);
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {
      items: [{
        set_id: 's',
        versions: [{
          asset_id: 'a1', position: 0,
          thumbnail_url: `https://api.example.com/artifacts/${sha}`,
          glb_url: `https://api.example.com/artifacts/${sha}.glb`,
        }],
      }],
    }));
    const [ring] = await fetchCadRings();
    // An <img> cannot send the caller's token, so an absolute API link renders
    // as a broken image; the same-origin proxy is what the rest of the app uses.
    expect(ring.versions[0].thumbnail_url).toBe(`/api/artifacts/${sha}`);
    expect(ring.versions[0].glb_url).toBe(`/api/artifacts/${sha}`);
  });

  it('asks for page 0: paging starts there, so page 1 would skip the newest', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { items: [RING] }));
    await fetchCadRings();
    expect(String(fetchMock.mock.calls[0][0])).toContain('page=0');
  });
});

describe('findRingForWorkflow', () => {
  it('matches the run against the VERSION it produced, not the ring', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { items: [RING] }));
    expect((await findRingForWorkflow('wf_2', { attempts: 1 }))?.set_id).toBe('set_1');
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { items: [RING] }));
    expect((await findRingForWorkflow('wf_1', { attempts: 1 }))?.set_id).toBe('set_1');
  });

  it('does not claim a ring for an unrelated run', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { items: [RING] }));
    expect(await findRingForWorkflow('wf_other', { attempts: 1 })).toBeNull();
  });

  it('retries: the version row is written after /status turns terminal', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { items: [] }))
      .mockResolvedValueOnce(jsonResponse(200, { items: [RING] }));
    const ring = await findRingForWorkflow('wf_1', { attempts: 2, delayMs: 0 });
    expect(ring?.set_id).toBe('set_1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives up rather than reporting a ring that never arrived', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { items: [] }));
    expect(await findRingForWorkflow('wf_1', { attempts: 2, delayMs: 0 })).toBeNull();
  });
});

describe('startImproveFromVersion', () => {
  it('returns the started run', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(202, { workflow_id: 'wf_2' }));
    expect((await startImproveFromVersion('a2')).workflow_id).toBe('wf_2');
  });

  it('tells "already improving" apart from "cannot be improved"', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, { detail: { reason_code: 'improve_already_running' }, workflow_id: 'wf_9' }),
    );
    await expect(startImproveFromVersion('a2')).rejects.toMatchObject({
      failure: 'already_running',
      runningWorkflowId: 'wf_9',
    });

    fetchMock.mockResolvedValueOnce(jsonResponse(409, { detail: 'version_not_improvable' }));
    await expect(startImproveFromVersion('a2')).rejects.toMatchObject({ failure: 'not_improvable' });
  });

  it('reports too few credits as its own case', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(402, { detail: 'Not enough credits' }));
    await expect(startImproveFromVersion('a2')).rejects.toBeInstanceOf(CadImproveError);
  });
});

describe('fetchImproveOutcome', () => {
  it('reports the refunded press so the UI can say so plainly', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(404, { detail: { message: 'Nothing needed fixing.', reason_code: 'nothing_to_fix' } }),
    );
    expect((await fetchImproveOutcome('wf_2'))?.failure).toBe('no_new_version');
  });

  it('is null for a run that succeeded, and for an ordinary failure', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { glb_artifact: {} }));
    expect(await fetchImproveOutcome('wf_2')).toBeNull();

    fetchMock.mockResolvedValueOnce(jsonResponse(500, { detail: 'boom' }));
    expect(await fetchImproveOutcome('wf_2')).toBeNull();
  });

  it('is null when the call itself fails, so the generic message still shows', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await fetchImproveOutcome('wf_2')).toBeNull();
  });
});

describe('readImproveResultFailure', () => {
  it('reads the structured 404 as a refunded press, not an error', () => {
    const failure = readImproveResultFailure(404, {
      detail: { message: 'Nothing needed fixing.', reason_code: 'nothing_to_fix', reason: 'no findings' },
    });
    expect(failure?.failure).toBe('no_new_version');
    expect(failure?.message).toBe('Nothing needed fixing.');
  });

  it('leaves an ordinary 404 alone: its detail is a plain string', () => {
    expect(readImproveResultFailure(404, { detail: 'not found' })).toBeNull();
  });

  it('ignores every other status', () => {
    expect(readImproveResultFailure(500, { detail: { message: 'boom' } })).toBeNull();
  });
});

describe('jewelry families', () => {
  it('history reads GET /api/cad/models', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { items: [RING] }));
    await fetchCadRings();
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/cad/models?');
  });

  it('prices Improve under the workflow the server will actually run', async () => {
    const { improveWorkflowFor } = await import('./cad-versions-api');
    expect(improveWorkflowFor({ ...RING, family: 'jewelry', jewelry_type: 'necklace' })).toBe('jewelry_cad_improve');
    expect(improveWorkflowFor({ ...RING, family: 'ring', jewelry_type: null })).toBe('ring_cad_improve');
    // Old records without a family are ring output (GraphFlow's LEGACY_FAMILY).
    expect(improveWorkflowFor(RING)).toBe('ring_cad_improve');
    expect(improveWorkflowFor(null)).toBe('ring_cad_improve');
  });
});

describe('canImproveVersion', () => {
  it('allows Improve only when the backend says improvable is exactly true', () => {
    expect(canImproveVersion({ improvable: true })).toBe(true);
    expect(canImproveVersion({ improvable: false, improve_unavailable_reason: 'legacy_workflow_retired' })).toBe(false);
    // A missing flag is not permission: GraphFlow shows IMPROVE only on true.
    expect(canImproveVersion({})).toBe(false);
    expect(canImproveVersion(null)).toBe(false);
  });
});
