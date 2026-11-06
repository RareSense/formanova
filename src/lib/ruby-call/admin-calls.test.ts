import { describe, it, expect, vi, beforeEach } from 'vitest';

const authFetch = vi.hoisted(() => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/authenticated-fetch', () => authFetch);
const admin = vi.hoisted(() => ({ listAdminGenerations: vi.fn(), getAdminGenerationDetail: vi.fn() }));
vi.mock('@/lib/admin-generations-api', () => admin);

import { callRowFromDetail, latestPerCall, listRubyCalls, matchesSearch, recordingBlob } from './admin-calls';
import type { AdminGenerationDetail } from '@/lib/admin-generations-api';

function detail(over: Partial<AdminGenerationDetail> & { input?: Record<string, unknown>; lead?: Record<string, unknown> } = {}): AdminGenerationDetail {
  const { input, lead, ...rest } = over;
  return {
    workflow_id: 'wf1',
    workflow_name: 'ruby_post_call',
    status: 'completed',
    user_email: 'owner@aura.com',
    user_type: null,
    is_paying: false,
    created_at: '2026-11-04T06:51:00Z',
    finished_at: '2026-11-04T06:51:05Z',
    actual_cost: null,
    total_provider_cost: null,
    input_payload: {
      call_session_id: 'cs1',
      started_at: '2026-11-04T06:50:00Z',
      ended_at: '2026-11-04T06:51:08Z',
      turns: [
        { role: 'ruby', text: 'Hi', start_ms: 0, end_ms: 1000 },
        { role: 'client', text: 'Usha here', start_ms: 2000, end_ms: 68000 },
      ],
      lead: { email: 'usha@aura.com' },
      recording: { final_sha256: 'f'.repeat(64), parts: [], duration_ms: 68096, mime: 'audio/webm;codecs=opus' },
      uploads: [{ name: 'ring.jpg', uri: 'azure://x', purpose: 'jewelry_photos' }],
      links: [],
      ...input,
    },
    steps: [{ tool_name: 'sales_clean_transcript', took_ms: 4000, at: null, input: {}, output: { result: { lead: { name: 'Usha', email: 'model@aura.com', ...lead } } } }],
    feedback: null,
    ...rest,
  };
}

beforeEach(() => vi.clearAllMocks());

const readText = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });

describe('admin Ruby calls', () => {
  it('turns a saved call into one plain row: what the call saved wins over the transcript read', () => {
    const row = callRowFromDetail(detail());
    expect(row).toMatchObject({
      workflowId: 'wf1',
      callSessionId: 'cs1',
      startedAt: '2026-11-04T06:50:00Z',
      name: 'Usha',
      email: 'usha@aura.com',
      durationSeconds: 68,
      outcome: 'No deal',
      recordingSha: 'f'.repeat(64),
      uploads: 1,
    });
    expect(row.lead).toEqual({ name: 'Usha', email: 'usha@aura.com' });
    expect(row.turns).toHaveLength(2);
  });

  it('keeps each upload with its purpose and the file hash to show it, from the hash or the proxied address', () => {
    const row = callRowFromDetail(detail({ input: { uploads: [
      { name: 'ring.jpg', sha256: 'a'.repeat(64), uri: 'azure://x', purpose: 'jewelry_photos' },
      { name: 'mood.png', uri: `https://api.formanova.ai/artifacts/${'b'.repeat(64)}`, purpose: 'references' },
      { name: 'odd.jpg', uri: 'not-an-address', purpose: 'other' },
    ] } }));
    expect(row.uploadList).toEqual([
      { name: 'ring.jpg', purpose: 'jewelry_photos', sha: 'a'.repeat(64) },
      { name: 'mood.png', purpose: 'references', sha: 'b'.repeat(64) },
      { name: 'odd.jpg', purpose: 'other', sha: null },
    ]);
    expect(row.uploads).toBe(3);
  });

  it('keeps only web links as links', () => {
    const row = callRowFromDetail(detail({ input: { links: [{ url: 'https://drive.google.com/x' }, { url: 'javascript:alert(1)' }, { url: 'http://shop.com' }] } }));
    expect(row.links).toEqual(['https://drive.google.com/x', 'http://shop.com']);
  });

  it('calls it a deal when a payment link was made, paid once the client paid, quoted when only a quote exists', () => {
    expect(callRowFromDetail(detail({ input: { payment: { total: '$260' } } })).outcome).toBe('Deal');
    expect(callRowFromDetail(detail({ input: { payment: { total: '$260', status: 'paid', paidAt: 't' } } })).outcome).toBe('Paid');
    expect(callRowFromDetail(detail({ input: { quote: { approved: true, total: '$260' } } })).outcome).toBe('Quoted');
  });

  it('falls back to the account email and the last turn when the call saved less', () => {
    const row = callRowFromDetail(detail({ input: { lead: {}, recording: null, started_at: undefined }, lead: { email: undefined } }));
    expect(row.email).toBe('owner@aura.com');
    expect(row.durationSeconds).toBe(68);
    expect(row.recordingSha).toBeNull();
    expect(row.startedAt).toBe('2026-11-04T06:51:00Z');
  });

  it('keeps one row per call: the newest save of a call saved twice', () => {
    const early = { ...callRowFromDetail(detail()), workflowId: 'early', savedAt: '2026-11-04T06:51:00Z' };
    const final = { ...callRowFromDetail(detail()), workflowId: 'final', savedAt: '2026-11-04T06:52:00Z' };
    const other = { ...callRowFromDetail(detail({ input: { call_session_id: 'cs2' } })), workflowId: 'other' };
    expect(latestPerCall([early, final, other]).map((r) => r.workflowId)).toEqual(['final', 'other']);
  });

  it('searches name, email, brand and phone, ignoring case', () => {
    const row = callRowFromDetail(detail({ lead: { brand: 'Aura Jewels', phone: '+447700900123' } }));
    for (const q of ['usha', 'AURA', '7700', '']) expect(matchesSearch(row, q)).toBe(true);
    expect(matchesSearch(row, 'nobody')).toBe(false);
  });

  it('lists ruby_post_call runs with their details, newest first', async () => {
    admin.listAdminGenerations.mockResolvedValue({ items: [{ workflow_id: 'a' }, { workflow_id: 'b' }], total: 2, limit: 50, offset: 0 });
    admin.getAdminGenerationDetail.mockImplementation(async (id: string) =>
      detail({ workflow_id: id, input: { call_session_id: id, started_at: id === 'a' ? '2026-11-03T10:00:00Z' : '2026-11-04T10:00:00Z' } }),
    );
    const rows = await listRubyCalls();
    expect(admin.listAdminGenerations).toHaveBeenCalledWith(expect.objectContaining({ workflow_name: 'ruby_post_call' }));
    expect(rows.map((r) => r.workflowId)).toEqual(['b', 'a']);
  });

  it('a call whose details fail to load is skipped, never breaking the list', async () => {
    admin.listAdminGenerations.mockResolvedValue({ items: [{ workflow_id: 'ok' }, { workflow_id: 'bad' }], total: 2, limit: 50, offset: 0 });
    admin.getAdminGenerationDetail.mockImplementation(async (id: string) => {
      if (id === 'bad') throw new Error('500');
      return detail({ workflow_id: id });
    });
    expect((await listRubyCalls()).map((r) => r.workflowId)).toEqual(['ok']);
  });

  it('fetches the full recording with the login token', async () => {
    authFetch.authenticatedFetch.mockResolvedValue(new Response('audio', { status: 200 }));
    const blob = await recordingBlob({ finalSha: 'a'.repeat(64), parts: [], mime: 'audio/webm' });
    expect(authFetch.authenticatedFetch).toHaveBeenCalledWith(`/api/artifacts/${'a'.repeat(64)}`);
    expect(blob.type).toBe('audio/webm');
  });

  it('joins the 5-second parts in order when the full file was never saved', async () => {
    authFetch.authenticatedFetch.mockImplementation(async (url: string) => new Response(url.endsWith('1'.repeat(64)) ? 'B' : 'A'));
    const blob = await recordingBlob({
      finalSha: null,
      parts: [{ seq: 1, sha256: '1'.repeat(64) }, { seq: 0, sha256: '0'.repeat(64) }],
      mime: 'audio/webm',
    });
    expect(await readText(blob)).toBe('AB');
  });

  it('refuses a recording reference that is not a sha256', async () => {
    await expect(recordingBlob({ finalSha: '../../etc', parts: [], mime: 'audio/webm' })).rejects.toThrow();
    expect(authFetch.authenticatedFetch).not.toHaveBeenCalled();
  });
});
