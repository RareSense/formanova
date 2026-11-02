/**
 * Ruby sales-call API. All route names and payload shapes live here.
 * Dev mode (VITE_RUBY_DEV_URL set): local Ruby dev routes, plain fetch.
 * Otherwise: gateway routes via authenticatedFetch (built by the backend later).
 */
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import type { CallEndReason, CallTurn, SessionAnswer } from './webrtc-call';

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

const ROUTES = {
  dev: {
    languages: '/dev/languages',
    voiceSession: '/dev/voice-session',
    callEnded: '/dev/clean-transcript',
  },
  gateway: {
    languages: '/api/sales/languages',
    voiceSession: '/api/sales/voice-session',
    callEnded: '/api/sales/call-ended',
  },
} as const;

function request(path: keyof typeof ROUTES.dev, init?: RequestInit): Promise<Response> {
  const base = devBase();
  if (base) return fetch(`${base}${ROUTES.dev[path]}`, init);
  return authenticatedFetch(ROUTES.gateway[path], init);
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function getLanguages(): Promise<CallLanguage[]> {
  const res = await request('languages');
  if (!res.ok) throw new Error('languages_failed');
  const data = await res.json();
  const list = Array.isArray(data) ? data : data?.languages;
  if (!Array.isArray(list)) throw new Error('languages_failed');
  return list.map((l: CallLanguage) => ({ code: String(l.code), name: String(l.name) }));
}

export async function startVoiceSession(args: {
  language: string;
  sdp: string;
  clientName?: string | null;
}): Promise<VoiceSession> {
  const body: Record<string, unknown> = { language: args.language, sdp: args.sdp };
  // Only the local dev route takes the name from the browser; the gateway knows the user.
  if (isRubyDevMode()) body.client = { name: args.clientName || null };
  const res = await request('voiceSession', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
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
  const body = isRubyDevMode()
    ? { turns }
    : { call_session_id: args.callSessionId, turns, reason: args.reason };
  const res = await request('callEnded', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('call_end_failed');
}
