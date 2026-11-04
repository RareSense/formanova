/**
 * Ruby sales-call API. All route names and payload shapes live here.
 * Dev mode (VITE_RUBY_DEV_URL set): local Ruby dev routes, plain fetch.
 * Otherwise: GraphFlow workflows via authenticatedFetch —
 *   ruby_voice_session  (sales_voice_session: SDP offer -> answer) and
 *   ruby_post_call      (sales_clean_transcript: the run keeps the transcript).
 */
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { pollWorkflow } from '@/lib/poll-workflow';
import bundledLanguages from './languages.json';
import { AudioUploadError, type AudioUploader, type RecordingSummary } from './call-recorder';
import type { CallEndReason, CallTurn, SessionAnswer } from './webrtc-call';

export const VOICE_SESSION_WORKFLOW = 'ruby_voice_session';
export const POST_CALL_WORKFLOW = 'ruby_post_call';
export const QUOTE_WORKFLOW = 'ruby_quote';
export const NEGOTIATE_WORKFLOW = 'ruby_negotiate';
export const CALL_AUDIO_URL = '/api/brand/calls/audio';
const TOOL_POLL_TIMEOUT_MS = 30_000;
const SESSION_POLL_INTERVAL_MS = 700;
const SESSION_POLL_TIMEOUT_MS = 60_000;

export interface CallLanguage {
  code: string;
  name: string;
}

export interface VoiceSession extends SessionAnswer {
  callSessionId: string | null;
  /** The ruby_voice_session run id (null in dev mode). */
  workflowId: string | null;
}

export interface CallerContext {
  timezone: string | null;
  local_time: string;
  browser_language: string | null;
}

export interface PastCall {
  date: string;
  lead: Record<string, unknown>;
  transcript: string;
  uploads: number;
  links: number;
}

export interface CallUpload {
  name: string;
  uri: string;
  sha256?: string;
  purpose: string;
}

export interface CallLink {
  url: string;
  at: string;
}

export interface CallPayment {
  url: string;
  total: string | null;
  totalCents?: number | null;
  simulated: boolean;
  email: string;
  installments?: { n: number; label: string; amountCents: number; amount: string; due: string | null; url: string | null }[];
}

export interface EndCallArgs {
  callSessionId: string | null;
  turns: CallTurn[];
  reason: CallEndReason;
  sessionWorkflowId?: string | null;
  lead?: Record<string, unknown>;
  uploads?: CallUpload[];
  links?: CallLink[];
  recording?: RecordingSummary | null;
  payment?: CallPayment | null;
  /** The last quote priced in the call (fallback record of the deal). */
  quote?: Record<string, unknown> | null;
  /** ISO times; the backend sorts its admin lists by them and keeps the record with the later ended_at. */
  startedAt?: string | null;
  endedAt?: string | null;
}

const devBase = (): string => {
  const raw = import.meta.env.VITE_RUBY_DEV_URL;
  return typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : '';
};

export const isRubyDevMode = (): boolean => devBase() !== '';

const DEV_ROUTES = {
  languages: '/dev/languages',
  voiceSession: '/dev/voice-session',
  callEnded: '/dev/clean-transcript',
} as const;

function devRequest(path: keyof typeof DEV_ROUTES, init?: RequestInit): Promise<Response> {
  return fetch(`${devBase()}${DEV_ROUTES[path]}`, init);
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function getLanguages(): Promise<CallLanguage[]> {
  // Same list Ruby ships (app/sales/data/languages.json); no request needed.
  if (!isRubyDevMode()) return (bundledLanguages as CallLanguage[]).map((l) => ({ code: l.code, name: l.name }));
  const res = await devRequest('languages');
  if (!res.ok) throw new Error('languages_failed');
  const data = await res.json();
  const list = Array.isArray(data) ? data : data?.languages;
  if (!Array.isArray(list)) throw new Error('languages_failed');
  return list.map((l: CallLanguage) => ({ code: String(l.code), name: String(l.name) }));
}

async function startRun(
  workflow: string,
  payload: Record<string, unknown>,
  returnNodes: string[],
  keepalive = false,
): Promise<string> {
  const body = JSON.stringify({ payload, return_nodes: returnNodes });
  const res = await authenticatedFetch(`/api/run/state/${workflow}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body,
    // Browsers refuse keepalive bodies over 64 KB.
    ...(keepalive && body.length < 60_000 ? { keepalive: true } : {}),
  });
  if (!res.ok) throw new Error(`${workflow}_start_failed`);
  const data = await res.json();
  if (!data?.workflow_id) throw new Error(`${workflow}_start_failed`);
  return data.workflow_id as string;
}

/** Finds the first object carrying `key` anywhere in a run result. */
function findWithKey(data: unknown, key: string, depth = 0): Record<string, unknown> | null {
  if (!data || typeof data !== 'object' || depth > 6) return null;
  const node = data as Record<string, unknown>;
  if (key in node) return node;
  for (const value of Object.values(node)) {
    const found = findWithKey(Array.isArray(value) ? value[0] : value, key, depth + 1);
    if (found) return found;
  }
  return null;
}

export function parseVoiceSessionResult(data: unknown): SessionAnswer {
  const node = findWithKey(data, 'sdp');
  if (!node || typeof node.sdp !== 'string') throw new Error('voice_session_failed');
  return { sdp: node.sdp, greeting: typeof node.greeting === 'string' ? node.greeting : null };
}

export async function startVoiceSession(args: {
  language: string;
  sdp: string;
  clientName?: string | null;
  clientEmail?: string | null;
  caller?: CallerContext | null;
  pastCalls?: PastCall[];
}): Promise<VoiceSession> {
  if (!isRubyDevMode()) {
    const callSessionId = crypto.randomUUID();
    const workflowId = await startRun(
      VOICE_SESSION_WORKFLOW,
      {
        language: args.language,
        sdp: args.sdp,
        call_session_id: callSessionId,
        client: { name: args.clientName || null, email: args.clientEmail || null },
        ...(args.caller ? { caller: args.caller } : {}),
        past_calls: args.pastCalls ?? [],
      },
      ['session'],
    );
    const polled = await pollWorkflow<SessionAnswer>({
      mode: 'status-then-result',
      fetchStatus: () => authenticatedFetch(`/api/status/${workflowId}`),
      fetchResult: () => authenticatedFetch(`/api/result/${workflowId}`),
      resolveState: (statusData) => {
        const st = statusData as { runtime?: { state?: string }; state?: string };
        return (st.runtime?.state || st.state || 'unknown').toLowerCase();
      },
      parseResult: parseVoiceSessionResult,
      intervalMs: SESSION_POLL_INTERVAL_MS,
      timeoutMs: SESSION_POLL_TIMEOUT_MS,
      max404s: 3,
      maxPollErrors: 5,
      maxResultRetries: 2,
    });
    if (polled.status !== 'completed') throw new Error('voice_session_failed');
    return { ...polled.result, callSessionId, workflowId };
  }
  const res = await devRequest('voiceSession', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ language: args.language, sdp: args.sdp, client: { name: args.clientName || null } }),
  });
  if (!res.ok) throw new Error('voice_session_failed');
  const data = await res.json();
  if (!data || typeof data.sdp !== 'string') throw new Error('voice_session_failed');
  return {
    sdp: data.sdp,
    greeting: data.greeting ?? null,
    callSessionId: data.call_session_id ?? null,
    workflowId: null,
  };
}

const cleanTurns = (turns: CallTurn[]) =>
  turns.map((t) => ({ role: t.role, text: t.text.trim(), start_ms: t.start_ms, end_ms: t.end_ms }));

/** The ruby_post_call payload (contract §4); the run's stored input is the saved record of the call. */
export function buildPostCallPayload(args: EndCallArgs): Record<string, unknown> {
  return {
    turns: cleanTurns(args.turns),
    call_session_id: args.callSessionId,
    reason: args.reason,
    session_workflow_id: args.sessionWorkflowId ?? null,
    lead: args.lead ?? {},
    uploads: args.uploads ?? [],
    links: args.links ?? [],
    recording: args.recording ?? null,
    ...(args.startedAt ? { started_at: args.startedAt } : {}),
    ...(args.endedAt ? { ended_at: args.endedAt } : {}),
    ...(args.payment ? { payment: args.payment } : {}),
    ...(args.quote ? { quote: args.quote } : {}),
  };
}

/** Saves the call by starting ruby_post_call with an already built payload. */
export async function savePostCall(payload: Record<string, unknown>, opts: { keepalive?: boolean } = {}): Promise<void> {
  if (isRubyDevMode()) {
    const res = await devRequest('callEnded', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ turns: payload.turns }),
    });
    if (!res.ok) throw new Error('call_end_failed');
    return;
  }
  // The run is the saved record of the call (GraphFlow keeps its input and result).
  await startRun(POST_CALL_WORKFLOW, payload, ['clean'], opts.keepalive);
}

export function endCall(args: EndCallArgs): Promise<void> {
  return savePostCall(buildPostCallPayload(args));
}

const statusState = (statusData: unknown) => {
  const st = statusData as { runtime?: { state?: string }; state?: string };
  return (st.runtime?.state || st.state || 'unknown').toLowerCase();
};

/** Starts a short sales workflow and returns the object carrying `key` from its result. */
async function runSalesWorkflow(
  workflow: string,
  payload: Record<string, unknown>,
  returnNode: string,
  key: string,
): Promise<Record<string, unknown>> {
  if (isRubyDevMode()) throw new Error('not_in_dev_mode');
  const workflowId = await startRun(workflow, payload, [returnNode]);
  const polled = await pollWorkflow<Record<string, unknown>>({
    mode: 'status-then-result',
    fetchStatus: () => authenticatedFetch(`/api/status/${workflowId}`),
    fetchResult: () => authenticatedFetch(`/api/result/${workflowId}`),
    resolveState: statusState,
    parseResult: (data) => {
      const node = findWithKey(data, key);
      if (!node) throw new Error(`${workflow}_bad_result`);
      return node;
    },
    intervalMs: SESSION_POLL_INTERVAL_MS,
    timeoutMs: TOOL_POLL_TIMEOUT_MS,
    max404s: 3,
    maxPollErrors: 5,
    maxResultRetries: 2,
  });
  if (polled.status !== 'completed') throw new Error(`${workflow}_failed`);
  return polled.result;
}

export interface QuoteRequest {
  lines: { productId: string; quantity: number }[];
  turnaround?: string;
  negotiation?: unknown;
  /** 1 to 4 payments. */
  installmentCount?: number;
}

/** ruby_quote (sales_price_quote): `{approved, needs_team_quote, client, internal}`. */
export function runQuote(req: QuoteRequest): Promise<Record<string, unknown>> {
  return runSalesWorkflow(
    QUOTE_WORKFLOW,
    {
      lines: req.lines,
      turnaround: req.turnaround || 'standard',
      ...(req.negotiation ? { negotiation: req.negotiation } : {}),
      ...(req.installmentCount ? { installmentCount: req.installmentCount } : {}),
    },
    'quote',
    'approved',
  );
}

/** ruby_negotiate (sales_check_concession): `{allowed, reason_for_ruby, negotiation}`. */
export function runNegotiate(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  return runSalesWorkflow(NEGOTIATE_WORKFLOW, args, 'concession', 'allowed');
}

/**
 * Uploader for call audio (contract §5): multipart `file`, `workflow_id`, `call_id`.
 * Null in dev mode or before the session exists, so recording stays local then.
 */
export function callAudioUploader(workflowId: string | null, callId: string | null): AudioUploader | null {
  if (isRubyDevMode() || !workflowId || !callId) return null;
  return async (file, filename, opts) => {
    const form = new FormData();
    form.append('file', file, filename);
    form.append('workflow_id', workflowId);
    form.append('call_id', callId);
    let res: Response;
    try {
      res = await authenticatedFetch(CALL_AUDIO_URL, {
        method: 'POST',
        body: form,
        ...(opts?.keepalive ? { keepalive: true } : {}),
      });
    } catch (e) {
      // A signed-out user cannot upload; a network error is worth another try.
      throw new AudioUploadError('upload_failed', (e as Error)?.name !== 'AuthExpiredError');
    }
    if (!res.ok) {
      const retriable = res.status >= 500 || res.status === 408 || res.status === 429;
      throw new AudioUploadError(`upload_${res.status}`, retriable);
    }
    const data = await res.json().catch(() => ({}));
    return {
      sha256: typeof data?.sha256 === 'string' ? data.sha256 : null,
      bytes: typeof data?.bytes === 'number' ? data.bytes : file.size,
    };
  };
}
