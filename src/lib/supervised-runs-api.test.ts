import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/authenticated-fetch', () => ({ authenticatedFetch: mockFetch }));
const blob = vi.hoisted(() => ({ url: '', uploadData: vi.fn() }));
vi.mock('@azure/storage-blob', () => ({
  BlockBlobClient: class {
    constructor(url: string) { blob.url = url; }
    uploadData = blob.uploadData;
  },
}));

import {
  PHASE_ACTIONS, SupervisedRunsApiError, addSupervisedRunNote, failSupervisedRun, getSupervisedRun,
  listSupervisedRuns, rejectSupervisedRun, removeSupervisedUpload, sameNames, sendSupervisedReplacement,
  sendSupervisedRun, startSupervisedRuns, uploadReplacementFile, isUncertainCheckFailure, userNoteLength, USER_NOTE_MAX_CHARS,
  UPLOAD_ROLES,
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

  it('sends only the tiers given when starting', async () => {
    mockFetch.mockResolvedValue(ok({ results: [] }));
    await startSupervisedRuns(['a']);
    expect(JSON.parse(call(0).init.body)).toEqual({ workflow_ids: ['a'] });
    await startSupervisedRuns(['a'], { llm_tier: 'x_tier' });
    expect(JSON.parse(call(1).init.body)).toEqual({ workflow_ids: ['a'], llm_tier: 'x_tier' });
    await startSupervisedRuns(['a'], { analysis_tier: 'y_tier' });
    expect(JSON.parse(call(2).init.body)).toEqual({ workflow_ids: ['a'], analysis_tier: 'y_tier' });
    await startSupervisedRuns(['a'], { llm_tier: 'x_tier', analysis_tier: 'y_tier' });
    expect(JSON.parse(call(3).init.body)).toEqual({ workflow_ids: ['a'], llm_tier: 'x_tier', analysis_tier: 'y_tier' });
    await startSupervisedRuns(['a'], {});
    expect(JSON.parse(call(4).init.body)).toEqual({ workflow_ids: ['a'] });
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

  it('adds the note to the user, trimmed, to send, fail and send-replacement', async () => {
    mockFetch.mockResolvedValue(ok({ accepted: true, phase: 'awaiting_review' }, 202));
    await sendSupervisedRun('a', [], '  Send three sharp photos.\nIn daylight.  ');
    await failSupervisedRun('a', 'Too dark to read.');
    await sendSupervisedReplacement('a', [], 'ring', 'A note 💎');
    expect(JSON.parse(call(0).init.body)).toEqual({ acknowledge_missing: [], user_note: 'Send three sharp photos.\nIn daylight.' });
    expect(JSON.parse(call(1).init.body)).toEqual({ user_note: 'Too dark to read.' });
    expect(JSON.parse(call(2).init.body)).toEqual({ acknowledge_missing: [], jewelry_type: 'ring', user_note: 'A note 💎' });
  });

  it('leaves user_note out for a blank or missing note', async () => {
    mockFetch.mockResolvedValue(ok({ accepted: true, phase: 'awaiting_review' }, 202));
    await sendSupervisedRun('a', [], '   ');
    await failSupervisedRun('a', '');
    await sendSupervisedReplacement('a', [], undefined, '\n ');
    expect(JSON.parse(call(0).init.body)).toEqual({ acknowledge_missing: [] });
    expect(JSON.parse(call(1).init.body)).toEqual({});
    expect(JSON.parse(call(2).init.body)).toEqual({ acknowledge_missing: [] });
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
  it('uses the backend size limit for every upload role (src/supervision/delivery.py)', () => {
    const MiB = 1024 * 1024;
    const GiB = 1024 * MiB;
    expect(Object.fromEntries(UPLOAD_ROLES.map((spec) => [spec.role, spec.maxBytes]))).toEqual({
      glb: GiB, threedm: GiB, viewer_threedm: GiB, stl: GiB, step: GiB, casting_stl: GiB,
      code: 50 * MiB, loop_state: 50 * MiB, thumbnail: 50 * MiB, design_contract: 50 * MiB, reference_manifest: 50 * MiB,
      stones: 10 * MiB,
    });
  });

  it('compares names as sets of the same size', () => {
    expect(sameNames([], [])).toBe(true);
    expect(sameNames(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameNames(['a'], ['a', 'b'])).toBe(false);
    expect(sameNames(['a', 'a'], ['a', 'b'])).toBe(false);
  });

  it('counts a note the way the backend does: characters after trimming, an emoji as one', () => {
    expect(USER_NOTE_MAX_CHARS).toBe(2000);
    expect(userNoteLength('  hello  ')).toBe(5);
    expect(userNoteLength('💎💎')).toBe(2);
    expect('💎💎'.length).toBe(4);
    expect(userNoteLength('a\nb')).toBe(3);
    expect(userNoteLength('   ')).toBe(0);
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

  it('asks for a link, uploads once, then completes', async () => {
    mockFetch
      .mockResolvedValueOnce(ok({ upload_id: 'u1', upload_url: 'https://blob/x?sig', expires_at: '', headers: { 'x-ms-blob-type': 'BlockBlob' } }))
      .mockResolvedValueOnce(ok({ upload_id: 'u1', role: 'glb', ref: { uri: 'azure://x' } }));
    const put = vi.fn(async () => {});
    const done = await uploadReplacementFile('a', 'glb', file, { put });
    expect(call(0).url).toBe('/api/admin/supervised-runs/a/uploads');
    expect(JSON.parse(call(0).init.body)).toEqual({ role: 'glb', filename: 'ring.glb', bytes: 10 });
    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith('https://blob/x?sig', file, undefined);
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

  it('uploads with the Azure SDK by default and reports progress as a fraction', async () => {
    blob.uploadData.mockReset().mockImplementation(async (_data: Blob, opts: { onProgress: (p: { loadedBytes: number }) => void }) => {
      opts.onProgress({ loadedBytes: 5 });
      opts.onProgress({ loadedBytes: 10 });
    });
    mockFetch
      .mockResolvedValueOnce(ok({ upload_id: 'u1', upload_url: 'https://blob/x?sig', expires_at: '', headers: {} }))
      .mockResolvedValueOnce(ok({ upload_id: 'u1', role: 'glb', ref: {} }));
    const onProgress = vi.fn();
    await uploadReplacementFile('a', 'glb', file, { onProgress });
    expect(blob.url).toBe('https://blob/x?sig');
    expect(blob.uploadData).toHaveBeenCalledTimes(1);
    expect(blob.uploadData.mock.calls[0][0]).toBe(file);
    expect(onProgress.mock.calls).toEqual([[0.5], [1]]);
    expect(call(1).url).toBe('/api/admin/supervised-runs/a/uploads/u1/complete');
  });

  it('sends a file over 256 MB to the same upload path', async () => {
    blob.uploadData.mockReset().mockResolvedValue({});
    const big = new File(['x'], 'big.3dm');
    Object.defineProperty(big, 'size', { value: 900_000_000 });
    mockFetch
      .mockResolvedValueOnce(ok({ upload_id: 'u1', upload_url: 'https://blob/x', expires_at: '', headers: {} }))
      .mockResolvedValueOnce(ok({ upload_id: 'u1', role: 'threedm', ref: {} }));
    await uploadReplacementFile('a', 'threedm', big);
    expect(JSON.parse(call(0).init.body)).toEqual({ role: 'threedm', filename: 'big.3dm', bytes: 900_000_000 });
    expect(blob.uploadData).toHaveBeenCalledTimes(1);
  });

  it('turns an SDK failure into upload_put_failed and never completes', async () => {
    blob.uploadData.mockReset().mockRejectedValue(Object.assign(new Error('AuthenticationFailed'), { statusCode: 403 }));
    mockFetch.mockResolvedValueOnce(ok({ upload_id: 'u1', upload_url: 'https://blob/x', expires_at: '', headers: {} }));
    const err = await uploadReplacementFile('a', 'glb', file).catch((e) => e);
    expect(err).toBeInstanceOf(SupervisedRunsApiError);
    expect(err).toMatchObject({ status: 403, code: 'upload_put_failed' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('reports a failed check with its reason', async () => {
    mockFetch
      .mockResolvedValueOnce(ok({ upload_id: 'u1', upload_url: 'https://blob/x', expires_at: '', headers: {} }))
      .mockResolvedValueOnce(fail(422, { code: 'upload_invalid', reason: 'bad_content' }));
    const err = await uploadReplacementFile('a', 'glb', file, { put: vi.fn(async () => {}) }).catch((e) => e);
    expect(err.code).toBe('upload_invalid');
    expect(err.detail.reason).toBe('bad_content');
    expect(isUncertainCheckFailure(err)).toBe(false);
  });

  it('marks a proxy timeout on complete with its upload id, after one PUT and one complete', async () => {
    mockFetch
      .mockResolvedValueOnce(ok({ upload_id: 'u7', upload_url: 'https://blob/x', expires_at: '', headers: {} }))
      .mockResolvedValueOnce({ ok: false, status: 524, json: async () => { throw new Error('html'); } });
    const put = vi.fn(async () => {});
    const err = await uploadReplacementFile('a', 'glb', file, { put }).catch((e) => e);
    expect(err).toBeInstanceOf(SupervisedRunsApiError);
    expect(err.status).toBe(524);
    expect(err.detail.upload_id).toBe('u7');
    expect(isUncertainCheckFailure(err)).toBe(true);
    expect(put).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('turns a network failure on complete into status 0 with the upload id', async () => {
    mockFetch
      .mockResolvedValueOnce(ok({ upload_id: 'u8', upload_url: 'https://blob/x', expires_at: '', headers: {} }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const err = await uploadReplacementFile('a', 'glb', file, { put: vi.fn(async () => {}) }).catch((e) => e);
    expect(err).toBeInstanceOf(SupervisedRunsApiError);
    expect(err.status).toBe(0);
    expect(err.detail.upload_id).toBe('u8');
    expect(isUncertainCheckFailure(err)).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does not treat a coded signal_failed, a failed PUT or a failed link as an uncertain check', async () => {
    mockFetch
      .mockResolvedValueOnce(ok({ upload_id: 'u9', upload_url: 'https://blob/x', expires_at: '', headers: {} }))
      .mockResolvedValueOnce(fail(502, { code: 'signal_failed' }));
    const signal = await uploadReplacementFile('a', 'glb', file, { put: vi.fn(async () => {}) }).catch((e) => e);
    expect(signal.code).toBe('signal_failed');
    expect(isUncertainCheckFailure(signal)).toBe(false);

    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(ok({ upload_id: 'u9', upload_url: 'https://blob/x', expires_at: '', headers: {} }));
    const putErr = await uploadReplacementFile('a', 'glb', file, {
      put: vi.fn(async () => { throw new SupervisedRunsApiError(0, 'upload_put_failed', {}); }),
    }).catch((e) => e);
    expect(isUncertainCheckFailure(putErr)).toBe(false);

    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(fail(503, {}));
    const linkErr = await uploadReplacementFile('a', 'glb', file, { put: vi.fn() }).catch((e) => e);
    expect(isUncertainCheckFailure(linkErr)).toBe(false);
  });
});
