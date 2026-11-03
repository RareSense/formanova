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
import type { CallEndReason, CallTurn, SessionAnswer } from './webrtc-call';

export const VOICE_SESSION_WORKFLOW = 'ruby_voice_session';
export const POST_CALL_WORKFLOW = 'ruby_post_call';
const SESSION_POLL_INTERVAL_MS = 700;
const SESSION_POLL_TIMEOUT_MS = 60_000;

export interface CallLanguage {
  code: string;
  name: string;
}

export interface VoiceSession extends SessionAnswer {
  callSessionId: string | null;
}

export interface EndCallArgs {
  callSessionId: string | null;
  turns: CallTurn[];
  reason: CallEndReason;
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

async function startRun(workflow: string, payload: Record<string, unknown>, returnNodes: string[]): Promise<string> {
  const res = await authenticatedFetch(`/api/run/state/${workflow}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ payload, return_nodes: returnNodes }),
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
}): Promise<VoiceSession> {
  if (!isRubyDevMode()) {
    const callSessionId = crypto.randomUUID();
    const workflowId = await startRun(
      VOICE_SESSION_WORKFLOW,
      { language: args.language, sdp: args.sdp, call_session_id: callSessionId, client: { name: args.clientName || null } },
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
    return { ...polled.result, callSessionId };
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
  };
}

export async function endCall(args: EndCallArgs): Promise<void> {
  const turns = args.turns.map((t) => ({
    role: t.role,
    text: t.text.trim(),
    start_ms: t.start_ms,
    end_ms: t.end_ms,
  }));
  if (!isRubyDevMode()) {
    // The run is the saved record of the call (GraphFlow keeps its input and result).
    await startRun(POST_CALL_WORKFLOW, { turns, call_session_id: args.callSessionId, reason: args.reason }, ['clean']);
    return;
  }
  const res = await devRequest('callEnded', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ turns }),
  });
  if (!res.ok) throw new Error('call_end_failed');
}
