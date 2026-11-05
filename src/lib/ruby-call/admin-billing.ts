/**
 * Admin view of Ruby's orders and call records, read from the billing service (`/billing/admin/...`,
 * spec 2026-11-03 sections 7.6-7.11) with the admin's own token. The only write is "Generate link N".
 * package and record come from a call: the page shows them as text, never as HTML.
 */
import { authenticatedFetch } from '@/lib/authenticated-fetch';

export interface BillingClient {
  user_id: string;
  email: string | null;
  name: string | null;
  account_email?: string | null;
}

export type PaymentStatus = 'paid_in_full' | 'part_paid' | 'unpaid';
export type LinkStatus = 'open' | 'paid' | 'refunded' | 'expired' | 'cancelled';
export type InstallmentState = LinkStatus | 'no_link';

export interface SalesDealRow {
  deal_id: string;
  client: BillingClient;
  project_name: string;
  total_cents: number;
  paid_cents: number;
  installments_paid: number;
  installments_total: number;
  payment_status: PaymentStatus;
  has_refunds: boolean;
  needs_review: boolean;
  has_open_dispute?: boolean;
  created_at: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface LinkDispute {
  id: string;
  status: string;
  reason: string | null;
  amount_cents: number | null;
  evidence_due_by: string | null;
  disputed_at: string | null;
}

export interface SalesLink {
  link_id: string;
  status: LinkStatus;
  url: string;
  paid_at: string | null;
  payer_email: string | null;
  amount_paid_cents: number | null;
  amount_refunded_cents: number | null;
  needs_review: boolean;
  review_reason: string | null;
  created_at: string;
  dispute: LinkDispute | null;
}

export interface Installment {
  n: number;
  label: string;
  amount_cents: number;
  state: InstallmentState;
  current_link: SalesLink | null;
  links: SalesLink[];
}

export interface DealCall {
  call_session_id: string;
  started_at: string;
  duration_seconds: number | null;
  client_name: string | null;
  made_this_deal: boolean;
}

export interface SalesDeal {
  deal_id: string;
  client: BillingClient;
  project_name: string;
  currency: string;
  total_cents: number;
  paid_cents: number;
  payment_status: PaymentStatus;
  customer_email: string | null;
  package: unknown;
  created_at: string;
  installments: Installment[];
  calls: DealCall[];
}

export interface SalesCallRow {
  call_session_id: string;
  started_at: string;
  duration_seconds: number | null;
  client: BillingClient;
  made_deal: boolean;
  deal_ids: string[];
}

export type RecordingStatus = 'final' | 'joined' | 'too_large' | 'unavailable' | 'none';

export interface SalesCall {
  call_session_id: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number | null;
  client: BillingClient;
  deal_ids: string[];
  recording_url: string | null;
  recording_status: RecordingStatus;
  recording_mime: string | null;
  record: unknown;
}

/** An answer from billing that is not 2xx; `code` is detail.code when billing sent one. */
export class BillingError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
    readonly linkId: string | null = null,
  ) {
    super(message);
    this.name = 'BillingError';
  }
}

const PAGE_SIZE = 50;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authenticatedFetch(path, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body && typeof body === 'object' ? (body as { detail?: unknown }).detail : null;
    const d = detail && typeof detail === 'object' && !Array.isArray(detail) ? (detail as Record<string, unknown>) : {};
    const code = typeof d.code === 'string' ? d.code : null;
    const message = typeof d.message === 'string' ? d.message : typeof detail === 'string' ? detail : `Billing answered ${res.status}`;
    throw new BillingError(res.status, code, message, typeof d.link_id === 'string' ? d.link_id : null);
  }
  return body as T;
}

const enc = encodeURIComponent;

export const listSalesDeals = (offset = 0) =>
  call<Page<SalesDealRow>>(`/billing/admin/sales-deals?limit=${PAGE_SIZE}&offset=${offset}`);

export const getSalesDeal = (dealId: string) => call<SalesDeal>(`/billing/admin/sales-deals/${enc(dealId)}`);

/** "Generate link N". A second click gets the same open link back (200), never a second one. */
export const generateLink = (dealId: string, n: number) =>
  call<{ link_id: string; url: string; status: LinkStatus }>(`/billing/admin/sales-deals/${enc(dealId)}/payment-links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ installment_n: n }),
  });

export const listSalesCalls = (offset = 0) =>
  call<Page<SalesCallRow>>(`/billing/admin/sales-calls?limit=${PAGE_SIZE}&offset=${offset}`);

export const getSalesCall = (id: string) => call<SalesCall>(`/billing/admin/sales-calls/${enc(id)}`);

export const PAGE = PAGE_SIZE;

/** The states where an admin may make a (new) link for an installment (spec 7.8). */
export const canGenerate = (state: InstallmentState) => state === 'no_link' || state === 'expired' || state === 'cancelled';

export function money(cents: number | null | undefined, currency = 'usd'): string {
  if (typeof cents !== 'number') return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
}

/**
 * The recording as a blob. A bare <audio src> cannot send the admin's token, so it is fetched first.
 * The token only ever goes to this site: a recording_url on another host is refused.
 */
export async function salesRecordingBlob(recordingUrl: string, mime: string | null): Promise<Blob> {
  let url: URL;
  try {
    url = new URL(recordingUrl, window.location.origin);
  } catch {
    throw new Error('Not a recording address');
  }
  const sha = url.pathname.match(/\/artifacts\/([a-f0-9]{64})$/)?.[1];
  const path = url.origin === window.location.origin ? url.pathname + url.search : sha ? `/api/artifacts/${sha}` : null;
  if (!path) throw new Error('Recording is on another site');
  const res = await authenticatedFetch(path);
  if (!res.ok) throw new Error(`Recording could not be loaded (${res.status})`);
  const type = (mime ?? '').split(';')[0] || res.headers.get('Content-Type') || 'audio/webm';
  return new Blob([await res.arrayBuffer()], { type });
}

/** The transcript inside a stored call record ({turns: [{role, text, start_ms}]}), text only. */
export function recordTurns(record: unknown): { role: 'ruby' | 'client'; text: string; start_ms?: number }[] {
  const r = record && typeof record === 'object' && !Array.isArray(record) ? (record as Record<string, unknown>) : {};
  const turns = Array.isArray(r.turns) ? r.turns : Array.isArray(r.transcript) ? r.transcript : [];
  return turns
    .map((t) => (t && typeof t === 'object' ? (t as Record<string, unknown>) : {}))
    .filter((t) => (t.role === 'ruby' || t.role === 'client') && typeof t.text === 'string' && t.text.trim())
    .map((t) => ({
      role: t.role as 'ruby' | 'client',
      text: (t.text as string).trim(),
      ...(typeof t.start_ms === 'number' ? { start_ms: t.start_ms } : {}),
    }));
}

/** Any stored JSON (package, record) as indented text, for a <pre>. */
export const asText = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
};
