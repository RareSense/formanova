import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/authenticated-fetch', () => ({ authenticatedFetch: mockFetch }));

import {
  PHASE_ACTIONS, SupervisedRunsApiError, addSupervisedRunNote, failSupervisedRun, getSupervisedRun,
  listSupervisedRuns, rejectSupervisedRun, removeSupervisedUpload, sameNames, sendSupervisedReplacement,
  sendSupervisedRun, startSupervisedRuns, uploadReplacementFile,
} from './supervised-runs-api';

const ok = (body: unknown, status = 200) => ({ ok: true, status, json: async () => body });
const fail = (status: number, detail: unknown) => ({ ok: false, status, json: async () => ({ detail }) });
const call = (i = 0) => ({ url: mockFetch.mock.calls[i][0], init: mockFetch.mock.calls[i][1] ?? {} });

beforeEach(() => mockFetch.mockReset());

describe('supervised runs client', () => {
  it('lists with repeated phase params', async () => {
    mockFetch.mockResolvedValue(ok({ items: [], total: 0, limit: 20, offset: 0 }));
    await listSupervisedRuns({ phases: ['queued', 'errored'], userEmail: 'a@b.c', limit: 20, offset: 40 });
    expect(call().url).toBe('/api/admin/supervised-runs?phase=queued&phase=errored&user_email=a%40b.c&limit=20&offset=40');
  });

  it('reads one run', async () => {
    mockFetch.mockResolvedValue(ok({ run: {}, supervision: { phase: 'queued' }, uploads: [], notes: [], download_urls: {} }));
    const d = await getSupervisedRun('wf 1');
    expect(call().url).toBe('/api/admin/supervised-runs/wf%201');
    expect(d.supervision.phase).toBe('queued');
  });

  it('starts many and returns each result', async () => {
    mockFetch.mockResolvedValue(ok({ results: [{ workflow_id: 'a', accepted: true }, { workflow_id: 'b', accepted: false, code: 'invalid_phase' }] }));
    const r = await startSupervisedRuns(['a', 'b']);
    expect(call().init.method).toBe('POST');
    expect(call().url).toBe('/api/admin/supervised-runs/start');
    expect(JSON.parse(call().init.body)).toEqual({ workflow_ids: ['a', 'b'] });
    expect(r[1]).toEqual({ workflow_id: 'b', accepted: false, code: 'invalid_phase' });
  });

  it('returns no start results for a null body', async () => {
    mockFetch.mockResolvedValue(ok(null));
    await expect(startSupervisedRuns(['a'])).resolves.toEqual([]);
  });

  it('sends with the acknowledged names', async () => {
    mockFetch.mockResolvedValue(ok({ accepted: true, phase: 'awaiting_review' }, 202));
    await sendSupervisedRun('a', ['code_artifact']);
    expect(call().url).toBe('/api/admin/supervised-runs/a/send');
    expect(JSON.parse(call().init.body)).toEqual({ acknowledge_missing: ['code_artifact'] });
  });

  it('rejects, fails and adds notes on the right routes', async () => {
    mockFetch.mockResolvedValue(ok({ accepted: true, phase: 'queued' }, 202));
    await rejectSupervisedRun('a');
    await failSupervisedRun('a');
    mockFetch.mockResolvedValue(ok({ id: 'n1', author_email: 'x', body: 'hi', created_at: '' }));
    await addSupervisedRunNote('a', 'hi');
    expect([call(0).url, call(1).url, call(2).url]).toEqual([
      '/api/admin/supervised-runs/a/reject', '/api/admin/supervised-runs/a/fail', '/api/admin/supervised-runs/a/notes',
    ]);
    expect(JSON.parse(call(2).init.body)).toEqual({ body: 'hi' });
  });

  it('sends a replacement with an optional jewelry type', async () => {
    mockFetch.mockResolvedValue(ok({ accepted: true, phase: 'rejected' }, 202));
    await sendSupervisedReplacement('a', [], 'ring');
    await sendSupervisedReplacement('a', ['loop_state_artifact']);
    expect(JSON.parse(call(0).init.body)).toEqual({ acknowledge_missing: [], jewelry_type: 'ring' });
    expect(JSON.parse(call(1).init.body)).toEqual({ acknowledge_missing: ['loop_state_artifact'] });
  });

  it('removes an upload by role', async () => {
    mockFetch.mockResolvedValue(ok({ removed: true }));
    await removeSupervisedUpload('a', 'glb');
    expect(call().init.method).toBe('DELETE');
    expect(call().url).toBe('/api/admin/supervised-runs/a/uploads/glb');
  });

  it('turns a coded error into SupervisedRunsApiError', async () => {
    mockFetch.mockResolvedValue(fail(409, { code: 'invalid_phase', phase: 'running', allowed: [] }));
    const err = await sendSupervisedRun('a', []).catch((e) => e);
    expect(err).toBeInstanceOf(SupervisedRunsApiError);
    expect(err.status).toBe(409);
    expect(err.code).toBe('invalid_phase');
    expect(err.detail.phase).toBe('running');
  });

  it('keeps a plain string detail as the code', async () => {
    mockFetch.mockResolvedValue(fail(403, 'not an admin'));
    const err = await getSupervisedRun('a').catch((e) => e);
    expect(err.code).toBe('not an admin');
  });
});

describe('helpers', () => {
  it('compares names as sets of the same size', () => {
    expect(sameNames([], [])).toBe(true);
    expect(sameNames(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameNames(['a'], ['a', 'b'])).toBe(false);
    expect(sameNames(['a', 'a'], ['a', 'b'])).toBe(false);
  });

  it('allows only the handoff actions per phase', () => {
    expect(PHASE_ACTIONS.queued).toEqual(['start', 'reject', 'fail']);
    expect(PHASE_ACTIONS.errored).toEqual(['start', 'reject', 'fail']);
    expect(PHASE_ACTIONS.awaiting_review).toEqual(['send', 'reject', 'fail']);
    expect(PHASE_ACTIONS.rejected).toEqual(['upload', 'send_replacement', 'fail']);
    for (const p of ['running', 'finalizing', 'delivered', 'failed'] as const) expect(PHASE_ACTIONS[p]).toEqual([]);
  });
});

describe('uploadReplacementFile', () => {
  const file = new File(['x'.repeat(10)], 'ring.glb');

  it('asks for a link, PUTs once with the returned headers, then completes', async () => {
    mockFetch
      .mockResolvedValueOnce(ok({ upload_id: 'u1', upload_url: 'https://blob/x?sig', expires_at: '', headers: { 'x-ms-blob-type': 'BlockBlob' } }))
      .mockResolvedValueOnce(ok({ upload_id: 'u1', role: 'glb', ref: { uri: 'azure://x' } }));
    const put = vi.fn(async () => {});
    const done = await uploadReplacementFile('a', 'glb', file, { put });
    expect(call(0).url).toBe('/api/admin/supervised-runs/a/uploads');
    expect(JSON.parse(call(0).init.body)).toEqual({ role: 'glb', filename: 'ring.glb', bytes: 10 });
    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith('https://blob/x?sig', file, { 'x-ms-blob-type': 'BlockBlob' }, undefined);
    expect(call(1).url).toBe('/api/admin/supervised-runs/a/uploads/u1/complete');
    expect(done.upload_id).toBe('u1');
  });

  it('never retries the PUT and never completes after a failed PUT', async () => {
    mockFetch.mockResolvedValueOnce(ok({ upload_id: 'u1', upload_url: 'https://blob/x', expires_at: '', headers: {} }));
    const put = vi.fn(async () => { throw new SupervisedRunsApiError(0, 'upload_put_failed', {}); });
    await expect(uploadReplacementFile('a', 'glb', file, { put })).rejects.toMatchObject({ code: 'upload_put_failed' });
    expect(put).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('always sends the BlockBlob header even if the backend omits it', async () => {
    mockFetch
      .mockResolvedValueOnce(ok({ upload_id: 'u1', upload_url: 'https://blob/x', expires_at: '' }))
      .mockResolvedValueOnce(ok({ upload_id: 'u1', role: 'glb', ref: {} }));
    const put = vi.fn(async () => {});
    await uploadReplacementFile('a', 'glb', file, { put });
    expect((put.mock.calls[0] as unknown[])[2]).toEqual({ 'x-ms-blob-type': 'BlockBlob' });
  });

  it('refuses a file over the single-PUT limit before any request', async () => {
    const big = new File(['x'], 'big.stl');
    Object.defineProperty(big, 'size', { value: 256_000_001 });
    await expect(uploadReplacementFile('a', 'stl', big, { put: vi.fn() })).rejects.toMatchObject({ code: 'too_large_for_browser' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('reports a failed check with its reason', async () => {
    mockFetch
      .mockResolvedValueOnce(ok({ upload_id: 'u1', upload_url: 'https://blob/x', expires_at: '', headers: {} }))
      .mockResolvedValueOnce(fail(422, { code: 'upload_invalid', reason: 'bad_content' }));
    const err = await uploadReplacementFile('a', 'glb', file, { put: vi.fn(async () => {}) }).catch((e) => e);
    expect(err.code).toBe('upload_invalid');
    expect(err.detail.reason).toBe('bad_content');
  });
});
