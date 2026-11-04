/**
 * Admin view of Ruby calls, built on what GraphFlow already stores: every saved call is a ruby_post_call
 * run whose input is the call record, and whose clean step adds the lead read from the transcript after
 * the call. Read with the admin's own token; nothing here writes anything.
 */
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { getAdminGenerationDetail, listAdminGenerations, type AdminGenerationDetail } from '@/lib/admin-generations-api';
import { POST_CALL_WORKFLOW } from './sales-call-api';

export type CallOutcome = 'Paid' | 'Deal' | 'Quoted' | 'No deal';

export interface AdminCallTurn {
  role: 'ruby' | 'client';
  text: string;
  start_ms?: number;
}

export interface AdminUpload {
  name: string;
  purpose: string;
  /** The stored file's sha256, to fetch it with the admin's token; null when unknown. */
  sha: string | null;
}

export interface RecordingRef {
  finalSha: string | null;
  parts: { seq: number; sha256: string }[];
  mime: string;
}

export interface RubyCallRow {
  workflowId: string;
  callSessionId: string | null;
  /** When the call started (the record's started_at, else when it was saved). */
  startedAt: string;
  savedAt: string;
  accountEmail: string;
  name: string;
  email: string;
  contact: string;
  durationSeconds: number | null;
  outcome: CallOutcome;
  recordingSha: string | null;
  recording: RecordingRef | null;
  uploads: number;
  uploadList: AdminUpload[];
  /** Web links only (http or https); anything else is dropped. */
  links: string[];
  lead: Record<string, string>;
  quote: Record<string, unknown> | null;
  payment: Record<string, unknown> | null;
  turns: AdminCallTurn[];
}

const LIST_LIMIT = 50;
const DETAIL_CONCURRENCY = 6;
const SHA256 = /^[a-f0-9]{64}$/;
const SHA_IN_ADDRESS = /(?:artifacts|hashed)\/([a-f0-9]{64})(?:[/?#]|$)/;

const webLink = (v: string): boolean => {
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

/** Only plain text values: the page shows them as text, never as HTML. */
function textFields(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj(v))) {
    const t = typeof value === 'boolean' ? (value ? 'yes' : 'no') : text(value);
    if (t) out[key] = t;
  }
  return out;
}

function extractedLead(detail: AdminGenerationDetail): Record<string, string> {
  for (const step of detail.steps) {
    const out = obj(step.output);
    const lead = obj(obj(out.result).lead ?? out.lead);
    if (Object.keys(lead).length) return textFields(lead);
  }
  return {};
}

function recordingOf(raw: unknown): RecordingRef | null {
  const rec = obj(raw);
  if (!Object.keys(rec).length) return null;
  const finalSha = typeof rec.final_sha256 === 'string' && SHA256.test(rec.final_sha256) ? rec.final_sha256 : null;
  const parts = (Array.isArray(rec.parts) ? rec.parts : [])
    .map((p) => obj(p))
    .filter((p) => typeof p.sha256 === 'string' && SHA256.test(p.sha256) && typeof p.seq === 'number')
    .map((p) => ({ seq: p.seq as number, sha256: p.sha256 as string }));
  if (!finalSha && !parts.length) return null;
  return { finalSha, parts, mime: text(rec.mime).split(';')[0] || 'audio/webm' };
}

function uploadOf(raw: unknown): AdminUpload {
  const u = obj(raw);
  const direct = typeof u.sha256 === 'string' && SHA256.test(u.sha256) ? u.sha256 : null;
  const fromAddress = text(u.uri).match(SHA_IN_ADDRESS)?.[1] ?? null;
  return { name: text(u.name) || 'file', purpose: text(u.purpose) || 'other', sha: direct ?? fromAddress };
}

export function callRowFromDetail(detail: AdminGenerationDetail): RubyCallRow {
  const input = obj(detail.input_payload);
  const lead = { ...extractedLead(detail), ...textFields(input.lead) };
  const turns = (Array.isArray(input.turns) ? input.turns : [])
    .map((t) => obj(t))
    .filter((t) => (t.role === 'ruby' || t.role === 'client') && text(t.text))
    .map((t) => ({ role: t.role as 'ruby' | 'client', text: text(t.text), ...(typeof t.start_ms === 'number' ? { start_ms: t.start_ms } : {}) }));
  const rec = obj(input.recording);
  const lastEnd = (Array.isArray(input.turns) ? input.turns : []).reduce((max: number, t) => Math.max(max, Number(obj(t).end_ms) || 0), 0);
  const ms = typeof rec.duration_ms === 'number' ? rec.duration_ms : lastEnd || null;
  const payment = Object.keys(obj(input.payment)).length ? obj(input.payment) : null;
  const quote = Object.keys(obj(input.quote)).length ? obj(input.quote) : null;
  const recording = recordingOf(input.recording);
  return {
    workflowId: detail.workflow_id,
    callSessionId: text(input.call_session_id) || null,
    startedAt: text(input.started_at) || detail.created_at,
    savedAt: detail.created_at,
    accountEmail: detail.user_email,
    name: lead.name ?? '',
    email: lead.email ?? detail.user_email ?? '',
    contact: lead.contact_preference ?? lead.phone ?? lead.instagram ?? '',
    durationSeconds: ms === null ? null : Math.round(ms / 1000),
    outcome: payment ? (payment.status === 'paid' ? 'Paid' : 'Deal') : quote ? 'Quoted' : 'No deal',
    recordingSha: recording?.finalSha ?? null,
    recording,
    uploads: Array.isArray(input.uploads) ? input.uploads.length : 0,
    uploadList: (Array.isArray(input.uploads) ? input.uploads : []).map(uploadOf),
    links: (Array.isArray(input.links) ? input.links : []).map((l) => text(obj(l).url)).filter(webLink),
    lead,
    quote,
    payment,
    turns,
  };
}

/** A call can be saved twice (a quick save when the tab closes, then the final one): keep the newest. */
export function latestPerCall(rows: RubyCallRow[]): RubyCallRow[] {
  const newest = new Map<string, RubyCallRow>();
  const out: RubyCallRow[] = [];
  for (const row of rows) {
    if (!row.callSessionId) {
      out.push(row);
      continue;
    }
    const seen = newest.get(row.callSessionId);
    if (!seen || row.savedAt > seen.savedAt) newest.set(row.callSessionId, row);
  }
  return [...out, ...newest.values()];
}

export function matchesSearch(row: RubyCallRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [row.name, row.email, row.accountEmail, row.contact, row.lead.brand, row.lead.phone, row.lead.instagram]
    .filter(Boolean)
    .some((v) => (v as string).toLowerCase().includes(q));
}

async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

/** The newest calls, newest first. A call whose details fail to load is skipped, never breaking the list. */
export async function listRubyCalls(): Promise<RubyCallRow[]> {
  const list = await listAdminGenerations({ workflow_name: POST_CALL_WORKFLOW, limit: LIST_LIMIT, supervised: false });
  const rows = await inBatches(list.items, DETAIL_CONCURRENCY, async (item) => {
    try {
      return callRowFromDetail(await getAdminGenerationDetail(item.workflow_id));
    } catch {
      return null;
    }
  });
  return latestPerCall(rows.filter((r): r is RubyCallRow => !!r)).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/** A stored file (an upload) as a blob, fetched with the admin's token. */
export async function fileBlob(sha: string, type = ''): Promise<Blob> {
  return new Blob([await artifact(sha)], type ? { type } : {});
}

async function artifact(sha: string): Promise<ArrayBuffer> {
  if (!SHA256.test(sha)) throw new Error('Not a recording reference');
  const res = await authenticatedFetch(`/api/artifacts/${sha}`);
  if (!res.ok) throw new Error(`Recording could not be loaded (${res.status})`);
  return res.arrayBuffer();
}

/** The whole recording, fetched with the admin's token (a plain audio src cannot send it). */
export async function recordingBlob(ref: RecordingRef): Promise<Blob> {
  if (ref.finalSha) return new Blob([await artifact(ref.finalSha)], { type: ref.mime });
  if (!ref.parts.length) throw new Error('This call has no recording');
  // Only the first part has the audio header: in seq order the parts make the same playable file.
  const ordered = [...ref.parts].sort((a, b) => a.seq - b.seq);
  const chunks: ArrayBuffer[] = [];
  for (const part of ordered) chunks.push(await artifact(part.sha256));
  return new Blob(chunks, { type: ref.mime });
}
