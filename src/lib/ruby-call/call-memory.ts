/**
 * What Ruby knows before she picks up (contract §1): the caller's time and language,
 * and the newest earlier calls, built from the user's ruby_post_call runs (their
 * stored input is the saved record of each call). Never blocks the call: anything
 * that fails or is slow just yields no past calls.
 */
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { getWorkflowDetails } from '@/lib/generation-history-api';
import { POST_CALL_WORKFLOW, isRubyDevMode, type CallerContext, type PastCall } from './sales-call-api';

export const PAST_CALLS_MAX = 3;
export const PAST_TRANSCRIPT_MAX = 2500;
export const MEMORY_TIMEOUT_MS = 2500;
const HISTORY_SCAN = 100;

export function callerContext(now = new Date(), language?: string): CallerContext {
  let timezone: string | null = null;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    /* unknown */
  }
  let localTime: string;
  try {
    const part = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', o).format(now);
    localTime = `${part({ weekday: 'short' })} ${part({ day: 'numeric' })} ${part({ month: 'short' })}, ${part({
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })}`;
  } catch {
    localTime = now.toISOString();
  }
  const browserLanguage = language ?? (typeof navigator !== 'undefined' ? navigator.language : null);
  return { timezone, local_time: localTime, browser_language: browserLanguage || null };
}

interface StoredTurn {
  role?: string;
  text?: string;
}

/** "Ruby: ..." / "Client: ..." lines, at most 2,500 characters, keeping the end. */
export function transcriptFromTurns(turns: unknown, max = PAST_TRANSCRIPT_MAX): string {
  if (!Array.isArray(turns)) return '';
  const text = (turns as StoredTurn[])
    .filter((t) => t && typeof t.text === 'string' && t.text.trim())
    .map((t) => `${t.role === 'ruby' ? 'Ruby' : 'Client'}: ${(t.text as string).trim()}`)
    .join('\n');
  if (text.length <= max) return text;
  const tail = text.slice(text.length - max);
  // Start on a whole line when there is one.
  const nl = tail.indexOf('\n');
  return nl > 0 && nl < 200 ? tail.slice(nl + 1) : tail;
}

export function pastCallFromRecord(date: string, input: Record<string, unknown> | null | undefined): PastCall | null {
  if (!input || typeof input !== 'object') return null;
  const transcript = transcriptFromTurns(input.turns);
  const lead = input.lead && typeof input.lead === 'object' ? (input.lead as Record<string, unknown>) : {};
  if (!transcript && !Object.keys(lead).length) return null;
  return {
    date,
    lead,
    transcript,
    uploads: Array.isArray(input.uploads) ? input.uploads.length : 0,
    links: Array.isArray(input.links) ? input.links.length : 0,
  };
}

interface RawRun {
  workflow_id?: string;
  id?: string;
  name?: string;
  created_at?: string;
  started_at?: string;
  input?: Record<string, unknown>;
}

async function recordFor(run: RawRun): Promise<Record<string, unknown> | null> {
  if (run.input && Array.isArray(run.input.turns)) return run.input;
  const id = run.workflow_id ?? run.id;
  if (!id) return null;
  try {
    const detail = await getWorkflowDetails(id);
    const withTurns = detail.steps.find((s) => s.input && Array.isArray((s.input as Record<string, unknown>).turns));
    return (withTurns?.input as Record<string, unknown>) ?? null;
  } catch {
    return null;
  }
}

async function loadPastCalls(): Promise<PastCall[]> {
  const res = await authenticatedFetch(`/history/workflows/me?limit=${HISTORY_SCAN}&offset=0`);
  if (!res.ok) return [];
  const data = await res.json();
  const runs: RawRun[] = Array.isArray(data) ? data : (data?.workflows ?? []);
  const date = (r: RawRun) => r.created_at ?? r.started_at ?? '';
  const newest = runs
    .filter((r) => r?.name === POST_CALL_WORKFLOW)
    .sort((a, b) => date(b).localeCompare(date(a)))
    .slice(0, PAST_CALLS_MAX);
  const calls = await Promise.all(newest.map(async (r) => pastCallFromRecord(date(r), await recordFor(r))));
  // Newest last.
  return calls.filter((c): c is PastCall => !!c).reverse();
}

/** The user's newest earlier calls (newest last); [] on any failure or after the timeout. */
export async function fetchPastCalls(timeoutMs = MEMORY_TIMEOUT_MS): Promise<PastCall[]> {
  if (isRubyDevMode()) return [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<PastCall[]>((resolve) => {
    timer = setTimeout(() => resolve([]), timeoutMs);
  });
  try {
    return await Promise.race([loadPastCalls().catch(() => []), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
