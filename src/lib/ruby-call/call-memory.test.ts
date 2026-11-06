import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const authFetch = vi.hoisted(() => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/authenticated-fetch', () => authFetch);
const history = vi.hoisted(() => ({ getWorkflowDetails: vi.fn() }));
vi.mock('@/lib/generation-history-api', () => history);

import { callerContext, fetchPastCalls, pastCallFromRecord, transcriptFromTurns } from './call-memory';

const json = (body: unknown, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 500, json: async () => body } as Response);

describe('call memory', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_RUBY_DEV_URL', '');
    authFetch.authenticatedFetch.mockReset();
    history.getWorkflowDetails.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('describes the caller: time zone, local time, browser language', () => {
    const c = callerContext(new Date(2026, 10, 3, 15, 40), 'en-US');
    expect(c.local_time).toBe('Tue 3 Nov, 15:40');
    expect(c.browser_language).toBe('en-US');
    expect(typeof c.timezone).toBe('string');
  });

  it('writes Ruby:/Client: lines and keeps the end of long transcripts', () => {
    expect(
      transcriptFromTurns([
        { role: 'ruby', text: ' Hi ' },
        { role: 'client', text: 'Hello' },
        { role: 'client', text: '  ' },
      ]),
    ).toBe('Ruby: Hi\nClient: Hello');
    const long = Array.from({ length: 200 }, (_, i) => ({ role: i % 2 ? 'client' : 'ruby', text: `line ${i} ${'x'.repeat(20)}` }));
    const t = transcriptFromTurns(long);
    expect(t.length).toBeLessThanOrEqual(2500);
    expect(t.endsWith(`line 199 ${'x'.repeat(20)}`)).toBe(true);
    expect(t.startsWith('Ruby: ') || t.startsWith('Client: ')).toBe(true);
  });

  it('builds a past call from a stored record', () => {
    expect(
      pastCallFromRecord('2026-11-03T10:39Z', {
        turns: [{ role: 'client', text: 'hi' }],
        lead: { brand: 'B' },
        uploads: [{}, {}],
        links: [{}],
      }),
    ).toEqual({ date: '2026-11-03T10:39Z', lead: { brand: 'B' }, transcript: 'Client: hi', uploads: 2, links: 1 });
    expect(pastCallFromRecord('d', { turns: [] })).toBeNull();
  });

  it('takes the newest three ruby_post_call runs, newest last, reading details when the list has no input', async () => {
    authFetch.authenticatedFetch.mockImplementation(() =>
      json({
        workflows: [
          { workflow_id: 'a', name: 'ruby_post_call', created_at: '2026-11-01', input: { turns: [{ role: 'ruby', text: 'A' }] } },
          { workflow_id: 'x', name: 'jewelry_photoshoots_generator', created_at: '2026-11-04' },
          { workflow_id: 'b', name: 'ruby_post_call', created_at: '2026-11-02', input: { turns: [{ role: 'ruby', text: 'B' }] } },
          { workflow_id: 'c', name: 'ruby_post_call', created_at: '2026-11-03' },
          { workflow_id: 'old', name: 'ruby_post_call', created_at: '2026-10-01', input: { turns: [{ role: 'ruby', text: 'old' }] } },
        ],
      }),
    );
    history.getWorkflowDetails.mockResolvedValue({ steps: [{ input: { turns: [{ role: 'client', text: 'C' }] } }] });
    const calls = await fetchPastCalls();
    expect(calls.map((c) => c.transcript)).toEqual(['Ruby: A', 'Ruby: B', 'Client: C']);
    expect(history.getWorkflowDetails).toHaveBeenCalledWith('c');
  });

  it('fills the lead with what the after-call step read from the transcript; what the call saved wins', async () => {
    authFetch.authenticatedFetch.mockImplementation(() =>
      json([
        { workflow_id: 'p1', name: 'ruby_post_call', created_at: '2026-11-04',
          input: { turns: [{ role: 'client', text: 'Usha here' }], lead: { email: 'page@aura.com' } } },
      ]),
    );
    history.getWorkflowDetails.mockResolvedValue({
      steps: [{ input: { turns: [] }, output: { result: { turns: [], lead: { name: 'Usha', email: 'model@aura.com' } } } }],
    });
    const [call] = await fetchPastCalls();
    expect(call.lead).toEqual({ name: 'Usha', email: 'page@aura.com' });
  });

  it('a slow details lookup never loses the call: it keeps what the call saved', async () => {
    vi.useFakeTimers();
    authFetch.authenticatedFetch.mockImplementation(() =>
      json([{ workflow_id: 'p1', name: 'ruby_post_call', created_at: '2026-11-04', input: { turns: [{ role: 'ruby', text: 'Hi' }], lead: { brand: 'Aura' } } }]),
    );
    history.getWorkflowDetails.mockImplementation(() => new Promise(() => {}));
    const p = fetchPastCalls(2500);
    await vi.advanceTimersByTimeAsync(1600);
    const calls = await p;
    expect(calls.map((c) => c.lead)).toEqual([{ brand: 'Aura' }]);
  });

  it('counts a call saved twice only once', async () => {
    authFetch.authenticatedFetch.mockImplementation(() =>
      json([
        { name: 'ruby_post_call', created_at: '2026-11-02', input: { call_session_id: 's1', turns: [{ role: 'ruby', text: 'final' }] } },
        { name: 'ruby_post_call', created_at: '2026-11-01', input: { call_session_id: 's1', turns: [{ role: 'ruby', text: 'early' }] } },
      ]),
    );
    expect((await fetchPastCalls()).map((c) => c.transcript)).toEqual(['Ruby: final']);
  });

  it('never blocks: failures and slow history give no past calls', async () => {
    authFetch.authenticatedFetch.mockRejectedValue(new Error('down'));
    expect(await fetchPastCalls()).toEqual([]);
    vi.useFakeTimers();
    authFetch.authenticatedFetch.mockImplementation(() => new Promise(() => {}));
    const p = fetchPastCalls(2500);
    await vi.advanceTimersByTimeAsync(2500);
    expect(await p).toEqual([]);
  });

  it('is a no-op in dev mode', async () => {
    vi.stubEnv('VITE_RUBY_DEV_URL', 'http://localhost:9000');
    expect(await fetchPastCalls()).toEqual([]);
    expect(authFetch.authenticatedFetch).not.toHaveBeenCalled();
  });
});
