import { describe, it, expect, vi, beforeEach } from 'vitest';

const authFetch = vi.hoisted(() => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/authenticated-fetch', () => authFetch);

import {
  POST_CALL_WORKFLOW,
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
});
