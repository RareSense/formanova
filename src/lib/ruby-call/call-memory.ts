/**
 * What Ruby knows before she picks up (contract §1): the caller's time and language,
 * and the newest earlier calls, built from the user's ruby_post_call runs (their
 * stored input is the saved record of each call). Never blocks the call: anything
 * that fails or is slow just yields no past calls.
 */
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { getWorkflowDetails } from '@/lib/generation-history-api';
import { POST_CALL_WORKFLOW, isRubyDevMode, type CallerContext, type PastCall, type PastPayment } from './sales-call-api';

export const PAST_CALLS_MAX = 3;
export const PAST_TRANSCRIPT_MAX = 2500;
export const MEMORY_TIMEOUT_MS = 2500;
/** Ruby calls only (a quick save and the final one can both be listed), so a busy account never times out the memory. */
const HISTORY_SCAN = 10;

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

/** The real payment link a saved call made (none for a simulated link). */
function pastPayment(raw: unknown): PastPayment | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const p = raw as Record<string, unknown>;
  if (p.simulated || typeof p.linkId !== 'string' || !p.linkId) return undefined;
  return { link_id: p.linkId, status: p.status === 'paid' ? 'paid' : 'open', total: typeof p.total === 'string' ? p.total : null };
}

/** The newest past call's link when it is not paid yet: the page watches it during this call. */
export function openPastLink(calls: PastCall[]): string | null {
  const last = [...calls].reverse().find((c) => c.payment);
  return last?.payment && last.payment.status !== 'paid' ? last.payment.link_id : null;
}

export function pastCallFromRecord(
  date: string,
  input: Record<string, unknown> | null | undefined,
  /** What the after-call step read from the transcript; what the call itself saved wins. */
  extractedLead: Record<string, unknown> = {},
): PastCall | null {
  if (!input || typeof input !== 'object') return null;
  const transcript = transcriptFromTurns(input.turns);
  const saved = input.lead && typeof input.lead === 'object' ? (input.lead as Record<string, unknown>) : {};
  const lead = { ...extractedLead, ...saved };
  if (!transcript && !Object.keys(lead).length) return null;
  const payment = pastPayment(input.payment);
  return {
    date,
    lead,
    transcript,
    uploads: Array.isArray(input.uploads) ? input.uploads.length : 0,
    links: Array.isArray(input.links) ? input.links.length : 0,
    ...(payment ? { payment } : {}),
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

/** Each run's details get their own short limit, so one slow lookup never costs the whole memory. */
export const DETAIL_TIMEOUT_MS = 1500;

type Details = Awaited<ReturnType<typeof getWorkflowDetails>>;

function detailsWithin(id: string, ms: number): Promise<Details | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([getWorkflowDetails(id).catch(() => null), late]).finally(() => clearTimeout(timer));
}

/** The lead in the clean step's output (sales_clean_transcript), however the step wraps it. */
function leadFromSteps(details: Details | null): Record<string, unknown> {
  for (const step of details?.steps ?? []) {
    const out = step.output as Record<string, unknown> | undefined;
    const result = (out?.result ?? out) as Record<string, unknown> | undefined;
    const lead = result?.lead;
    if (lead && typeof lead === 'object' && !Array.isArray(lead)) return lead as Record<string, unknown>;
  }
  return {};
}

async function recordFor(run: RawRun): Promise<{ record: Record<string, unknown> | null; extracted: Record<string, unknown> }> {
  const listed = run.input && Array.isArray(run.input.turns) ? run.input : null;
  const id = run.workflow_id ?? run.id;
  if (!id) return { record: listed, extracted: {} };
  const details = await detailsWithin(id, DETAIL_TIMEOUT_MS);
  const withTurns = details?.steps.find((s) => s.input && Array.isArray((s.input as Record<string, unknown>).turns));
  return { record: listed ?? ((withTurns?.input as Record<string, unknown>) ?? null), extracted: leadFromSteps(details) };
}

async function loadPastCalls(): Promise<PastCall[]> {
  const res = await authenticatedFetch(`/history/workflows/me?workflow_name=${POST_CALL_WORKFLOW}&limit=${HISTORY_SCAN}&offset=0`);
  if (!res.ok) return [];
  const data = await res.json();
  const runs: RawRun[] = Array.isArray(data) ? data : (data?.workflows ?? []);
  const date = (r: RawRun) => r.created_at ?? r.started_at ?? '';
  // A call can be saved twice (keepalive on tab close, then the retry on the next visit).
  const seen = new Set<string>();
  const newest = runs
    .filter((r) => r?.name === POST_CALL_WORKFLOW)
    .sort((a, b) => date(b).localeCompare(date(a)))
    .filter((r) => {
      const id = r.input?.call_session_id;
      if (typeof id !== 'string' || !id) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, PAST_CALLS_MAX);
  const calls = await Promise.all(
    newest.map(async (r) => {
      const { record, extracted } = await recordFor(r);
      return pastCallFromRecord(date(r), record, extracted);
    }),
  );
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
