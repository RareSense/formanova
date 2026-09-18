import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/authenticated-fetch', () => ({ authenticatedFetch: vi.fn() }));

import { authenticatedFetch } from '@/lib/authenticated-fetch';
import {
  CadImproveError,
  findRingForWorkflow,
  latestVersion,
  readImproveResultFailure,
  startImproveFromVersion,
} from './cad-versions-api';

const fetchMock = vi.mocked(authenticatedFetch);

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

const RING = {
  set_id: 'set_1',
  source_workflow_id: 'wf_1',
  versions: [
    { asset_id: 'a1', label: 'V1', improvable: true },
    { asset_id: 'a2', label: 'V2', improvable: true },
  ],
};

beforeEach(() => {
  fetchMock.mockReset();
});

describe('latestVersion', () => {
  it('is the last entry, which is what an Improve press starts from', () => {
    expect(latestVersion(RING)?.label).toBe('V2');
  });

  it('is null for a ring with no versions, so no button is offered', () => {
    expect(latestVersion({ set_id: 's', versions: [] })).toBeNull();
  });
});

describe('findRingForWorkflow', () => {
  it('matches on source_workflow_id', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { items: [RING] }));
    const ring = await findRingForWorkflow('wf_1', { attempts: 1 });
    expect(ring?.set_id).toBe('set_1');
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
