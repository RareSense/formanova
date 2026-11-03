import { describe, it, expect, vi, beforeEach } from 'vitest';

const authFetch = vi.hoisted(() => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/authenticated-fetch', () => authFetch);

import {
  CALL_AUDIO_URL,
  NEGOTIATE_WORKFLOW,
  QUOTE_WORKFLOW,
  POST_CALL_WORKFLOW,
  buildPostCallPayload,
  callAudioUploader,
  runNegotiate,
  runQuote,
  VOICE_SESSION_WORKFLOW,
  endCall,
  getLanguages,
  parseVoiceSessionResult,
  startVoiceSession,
} from './sales-call-api';

const json = (body: unknown, ok = true, status = 200) =>
  Promise.resolve({ ok, status, json: async () => body } as Response);

describe('sales-call-api (GraphFlow workflows)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_RUBY_DEV_URL', '');
    authFetch.authenticatedFetch.mockReset();
  });

  it('serves the bundled language list without a request', async () => {
    const list = await getLanguages();
    expect(list[0]).toEqual({ code: 'en', name: 'English' });
    expect(list.length).toBeGreaterThan(10);
    expect(authFetch.authenticatedFetch).not.toHaveBeenCalled();
  });

  it('starts ruby_voice_session with the offer and returns the answer from the run result', async () => {
    authFetch.authenticatedFetch.mockImplementation((url: string) => {
      if (url === `/api/run/state/${VOICE_SESSION_WORKFLOW}`) return json({ workflow_id: 'wf-1' });
      if (url === '/api/status/wf-1') return json({ runtime: { state: 'completed' } });
      if (url === '/api/result/wf-1') return json({ results: { session: [{ sdp: 'v=0 answer', greeting: 'Hi', language: 'en' }] } });
      return json({}, false, 404);
    });

    const session = await startVoiceSession({ language: 'en', sdp: 'v=0 offer', clientName: 'Uswa' });

    expect(session.sdp).toBe('v=0 answer');
    expect(session.greeting).toBe('Hi');
    expect(session.callSessionId).toMatch(/[0-9a-f-]{36}/);
    expect(session.workflowId).toBe('wf-1');
    const [, init] = authFetch.authenticatedFetch.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.return_nodes).toEqual(['session']);
    expect(body.payload).toMatchObject({ language: 'en', sdp: 'v=0 offer', client: { name: 'Uswa' } });
    expect(body.payload.call_session_id).toBe(session.callSessionId);
  });

  it('throws when the run cannot start', async () => {
    authFetch.authenticatedFetch.mockImplementation(() => json({}, false, 500));
    await expect(startVoiceSession({ language: 'en', sdp: 'x' })).rejects.toThrow();
  });

  it('rejects a result without an answer', () => {
    expect(() => parseVoiceSessionResult({ results: { session: [{ greeting: 'Hi' }] } })).toThrow('voice_session_failed');
  });

  it('saves the call by starting ruby_post_call with the turns', async () => {
    authFetch.authenticatedFetch.mockImplementation(() => json({ workflow_id: 'wf-2' }));
    await endCall({
      callSessionId: 'cs-1',
      reason: 'user',
      turns: [{ role: 'client', text: ' hello ', start_ms: 0, end_ms: 900 }],
    });
    const [url, init] = authFetch.authenticatedFetch.mock.calls[0];
    expect(url).toBe(`/api/run/state/${POST_CALL_WORKFLOW}`);
    const body = JSON.parse(init.body);
    expect(body.payload.turns).toEqual([{ role: 'client', text: 'hello', start_ms: 0, end_ms: 900 }]);
    expect(body.payload.call_session_id).toBe('cs-1');
  });

  it('sends client email, caller context and past calls with the session', async () => {
    authFetch.authenticatedFetch.mockImplementation((url: string) => {
      if (url.startsWith('/api/run/state/')) return json({ workflow_id: 'wf-1' });
      if (url === '/api/status/wf-1') return json({ state: 'completed' });
      return json({ results: { session: [{ sdp: 'x' }] } });
    });
    const caller = { timezone: 'Asia/Karachi', local_time: 'Tue 3 Nov, 15:40', browser_language: 'en-US' };
    const pastCalls = [{ date: '2026-11-03T10:39Z', lead: { brand: 'B' }, transcript: 'Ruby: hi', uploads: 1, links: 0 }];
    await startVoiceSession({ language: 'en', sdp: 'o', clientName: 'U', clientEmail: 'u@x.y', caller, pastCalls });
    const payload = JSON.parse(authFetch.authenticatedFetch.mock.calls[0][1].body).payload;
    expect(payload.client).toEqual({ name: 'U', email: 'u@x.y' });
    expect(payload.caller).toEqual(caller);
    expect(payload.past_calls).toEqual(pastCalls);
  });

  it('builds the full post-call record (contract section 4)', () => {
    const recording = { mime: 'audio/webm', final_sha256: null, parts: [], duration_ms: 5, audio_seen: true, failed_parts: 0 };
    const payload = buildPostCallPayload({
      callSessionId: 'cs',
      reason: 'error',
      turns: [],
      sessionWorkflowId: 'wf-1',
      lead: { brand: 'B' },
      uploads: [{ name: 'a.jpg', uri: 'azure://x', purpose: 'jewelry_photos' }],
      links: [{ url: 'https://x.y', at: 't' }],
      recording,
      payment: { url: 'u', total: '$1', simulated: true, email: 'e' },
    });
    expect(payload).toEqual({
      turns: [],
      call_session_id: 'cs',
      reason: 'error',
      session_workflow_id: 'wf-1',
      lead: { brand: 'B' },
      uploads: [{ name: 'a.jpg', uri: 'azure://x', purpose: 'jewelry_photos' }],
      links: [{ url: 'https://x.y', at: 't' }],
      recording,
      payment: { url: 'u', total: '$1', simulated: true, email: 'e' },
    });
  });

  it('runs ruby_quote with lines, turnaround and negotiation and returns the quote result', async () => {
    authFetch.authenticatedFetch.mockImplementation((url: string) => {
      if (url === `/api/run/state/${QUOTE_WORKFLOW}`) return json({ workflow_id: 'wq' });
      if (url === '/api/status/wq') return json({ runtime: { state: 'completed' } });
      return json({ results: { quote: [{ approved: true, client: { totalCents: 100 } }] } });
    });
    const out = await runQuote({ lines: [{ productId: 'p', quantity: 2 }], turnaround: 'rush', negotiation: { n: 1 } });
    expect(out).toEqual({ approved: true, client: { totalCents: 100 } });
    const body = JSON.parse(authFetch.authenticatedFetch.mock.calls[0][1].body);
    expect(body).toEqual({
      payload: { lines: [{ productId: 'p', quantity: 2 }], turnaround: 'rush', negotiation: { n: 1 } },
      return_nodes: ['quote'],
    });
  });

  it('runs ruby_negotiate with the tool args', async () => {
    authFetch.authenticatedFetch.mockImplementation((url: string) => {
      if (url === `/api/run/state/${NEGOTIATE_WORKFLOW}`) return json({ workflow_id: 'wn' });
      if (url === '/api/status/wn') return json({ runtime: { state: 'completed' } });
      return json({ results: { concession: [{ allowed: false, reason_for_ruby: 'no' }] } });
    });
    const out = await runNegotiate({ negotiation: {}, event: 'price_objection' });
    expect(out).toMatchObject({ allowed: false });
    const body = JSON.parse(authFetch.authenticatedFetch.mock.calls[0][1].body);
    expect(body.return_nodes).toEqual(['concession']);
    expect(body.payload).toEqual({ negotiation: {}, event: 'price_objection' });
  });

  it('uploads call audio as multipart with the session run id and call id', async () => {
    authFetch.authenticatedFetch.mockImplementation(() => json({ sha256: 'abc', bytes: 3 }));
    const upload = callAudioUploader('wf-1', 'cs-1');
    const res = await upload!(new Blob(['abc']), 'part-0000.webm', { keepalive: true });
    expect(res).toEqual({ sha256: 'abc', bytes: 3 });
    const [url, init] = authFetch.authenticatedFetch.mock.calls[0];
    expect(url).toBe(CALL_AUDIO_URL);
    expect(init.keepalive).toBe(true);
    const form = init.body as FormData;
    expect(form.get('workflow_id')).toBe('wf-1');
    expect(form.get('call_id')).toBe('cs-1');
    expect((form.get('file') as File).name).toBe('part-0000.webm');
  });

  it('marks 4xx audio uploads as not worth retrying and 5xx as retriable', async () => {
    const upload = callAudioUploader('wf-1', 'cs-1')!;
    authFetch.authenticatedFetch.mockImplementation(() => json({}, false, 413));
    await expect(upload(new Blob(['a']), 'f')).rejects.toMatchObject({ retriable: false });
    authFetch.authenticatedFetch.mockImplementation(() => json({}, false, 502));
    await expect(upload(new Blob(['a']), 'f')).rejects.toMatchObject({ retriable: true });
    expect(callAudioUploader(null, 'cs')).toBeNull();
  });
});
