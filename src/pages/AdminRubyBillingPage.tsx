import { CallAudio } from '@/components/sales/CallAudio';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useIsFetching, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Copy, Download, Loader2, Mail, Play, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  BillingError,
  PAGE,
  asText,
  canGenerate,
  generateLink,
  getSalesCall,
  getSalesDeal,
  listSalesCalls,
  listSalesDeals,
  money,
  recordTurns,
  salesRecordingBlob,
  type Installment,
  type InstallmentState,
  type PaymentStatus,
  type SalesCall,
  type SalesDeal,
  type SalesDealRow,
} from '@/lib/ruby-call/admin-billing';
import { parseServerTime } from '@/lib/server-time';

/**
 * Ruby's orders and call records as billing holds them (separate from "Ruby Calls", which reads
 * GraphFlow runs). Orders: what was agreed, what is paid, and "Create payment N link" + "Email client" for an unpaid
 * installment. Calls: the stored record with transcript and recording. Views live in the address
 * (?view=calls, ?deal=<id>, ?call=<id>) so Back works and a page can be linked.
 * Everything that came from a call is rendered as text, never as HTML.
 */
const WRAP = 'mx-auto max-w-5xl space-y-4 px-4 py-6 md:px-8'; // same width and gutters as the Admin header and tabs
const WIDE = 'hidden md:table-cell';
const CARD = 'border border-border bg-card';

const asDate = (iso: string) => (/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? new Date(iso) : parseServerTime(iso));
const when = (iso: string | null | undefined) => {
  if (!iso) return '-';
  const d = asDate(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};
const clock = (s: number | null | undefined) => (typeof s === 'number' ? `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}` : '-');

const PAY_LABEL: Record<PaymentStatus, string> = { paid_in_full: 'Paid in full', part_paid: 'Part paid', unpaid: 'Unpaid' };
const PAY_STYLE: Record<PaymentStatus, string> = {
  paid_in_full: 'bg-[hsl(var(--formanova-hero-accent)/0.3)] font-semibold text-foreground',
  part_paid: 'bg-[hsl(var(--formanova-hero-accent)/0.15)] text-foreground',
  unpaid: 'bg-muted text-muted-foreground',
};
const STATE_LABEL: Record<InstallmentState, string> = {
  paid: 'Paid',
  refunded: 'Refunded',
  open: 'Link open',
  expired: 'Expired',
  cancelled: 'Cancelled',
  no_link: 'No link yet',
};

const errorText = (e: unknown) => (e instanceof BillingError ? e.message : 'Billing could not be reached. Try Refresh.');

function Flags({ review, dispute, refunds }: { review?: boolean; dispute?: boolean; refunds?: boolean }) {
  if (!review && !dispute && !refunds) return null;
  return (
    <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
      {dispute && <span className="bg-destructive px-1.5 py-0.5 text-[11px] font-semibold text-destructive-foreground">Dispute</span>}
      {review && (
        <span className="inline-flex items-center gap-1 border border-destructive px-1.5 py-0.5 text-[11px] font-semibold text-destructive">
          <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Needs review
        </span>
      )}
      {refunds && <span className="bg-muted px-1.5 py-0.5 text-[11px]">Refund</span>}
    </span>
  );
}

export default function AdminRubyBillingPage() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'calls' ? 'calls' : 'orders';
  const go = (next: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    setParams(p);
  };

  const dealId = params.get('deal');
  const callId = params.get('call');
  const listKey = view === 'orders' ? 'admin-sales-deals' : 'admin-sales-calls';
  if (dealId) return <DealView dealId={dealId} onBack={() => go({})} onCall={(id) => go({ view: 'calls', call: id })} />;
  if (callId) return <CallView callId={callId} onBack={() => go({ view: 'calls' })} onDeal={(id) => go({ deal: id })} />;

  return (
    <div className={WRAP}>
      <div>
        <h2 className="text-lg font-semibold">Ruby orders</h2>
        <p className="text-sm text-muted-foreground">What clients agreed on calls with Ruby, and what they paid. Newest first.</p>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div role="tablist" className="flex gap-1">
          {(['orders', 'calls'] as const).map((v) => (
            <Button key={v} role="tab" aria-selected={view === v} size="sm" variant={view === v ? 'default' : 'outline'} onClick={() => go({ view: v === 'calls' ? 'calls' : null })}>
              {v === 'orders' ? 'Orders' : 'Calls (with recordings)'}
            </Button>
          ))}
        </div>
        <RefreshButton queryKey={listKey} />
      </div>
      {view === 'orders' && <p className="text-sm text-muted-foreground">Calls without an order are under Calls (with recordings).</p>}
      {view === 'orders' ? <OrdersList onOpen={(id) => go({ deal: id })} /> : <CallsList onOpen={(id) => go({ view: 'calls', call: id })} />}
    </div>
  );
}

function RefreshButton({ queryKey }: { queryKey: string }) {
  const qc = useQueryClient();
  const busy = useIsFetching({ queryKey: [queryKey] }) > 0;
  return (
    <Button variant="outline" size="sm" onClick={() => void qc.refetchQueries({ queryKey: [queryKey] })} disabled={busy}>
      <RefreshCw className={`mr-2 h-4 w-4 ${busy ? 'animate-spin' : ''}`} /> Refresh
    </Button>
  );
}

function BackBar({ label, onBack, queryKey }: { label: string; onBack(): void; queryKey: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
        <ArrowLeft className="mr-2 h-4 w-4" /> {label}
      </Button>
      <RefreshButton queryKey={queryKey} />
    </div>
  );
}

function Pager({ offset, total, onPage }: { offset: number; total: number; onPage(o: number): void }) {
  if (total <= PAGE) return null;
  return (
    <div className="flex items-center justify-end gap-2 text-sm">
      <span className="text-muted-foreground">
        {offset + 1}-{Math.min(offset + PAGE, total)} of {total}
      </span>
      <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => onPage(Math.max(0, offset - PAGE))}>
        Newer
      </Button>
      <Button size="sm" variant="outline" disabled={offset + PAGE >= total} onClick={() => onPage(offset + PAGE)}>
        Older
      </Button>
    </div>
  );
}

function Status({ loading, error }: { loading: boolean; error: unknown }) {
  return (
    <>
      {loading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      )}
      {!!error && (
        <p role="alert" className="border border-border bg-muted px-3 py-2 text-sm">
          {errorText(error)}
        </p>
      )}
    </>
  );
}

function OrdersList({ onOpen }: { onOpen(id: string): void }) {
  const [offset, setOffset] = useState(0);
  const q = useQuery({ queryKey: ['admin-sales-deals', offset], queryFn: () => listSalesDeals(offset) });
  return (
    <div className="space-y-3">
      <Status loading={q.isLoading} error={q.error} />
      {q.data && (
        <div className={CARD}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={WIDE}>Date</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className={WIDE}>Project</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-muted-foreground">
                    No orders yet.
                  </TableCell>
                </TableRow>
              )}
              {q.data.items.map((d: SalesDealRow) => (
                <TableRow
                  key={d.deal_id}
                  data-flagged={d.needs_review || d.has_open_dispute ? 'true' : undefined}
                  className={`cursor-pointer ${d.needs_review || d.has_open_dispute ? 'bg-destructive/5' : ''}`}
                  onClick={() => onOpen(d.deal_id)}
                >
                  <TableCell className={`${WIDE} whitespace-nowrap text-sm`}>{when(d.created_at)}</TableCell>
                  <TableCell className="min-w-0">
                    <div className="font-medium">{d.client.name || 'Unknown'}</div>
                    <div className="text-xs text-muted-foreground [overflow-wrap:anywhere] md:whitespace-nowrap">{d.client.email}</div>
                    <div className="text-xs text-muted-foreground md:hidden">{when(d.created_at)}</div>
                  </TableCell>
                  <TableCell className={`${WIDE} break-words text-sm`}>{d.project_name}</TableCell>
                  <TableCell className="text-sm tabular-nums">
                    <div className="whitespace-nowrap">{money(d.paid_cents)}</div>
                    <div className="text-xs text-muted-foreground md:whitespace-nowrap">
                      of {money(d.total_cents)} · {d.installments_paid}/{d.installments_total} paid
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`whitespace-nowrap px-2 py-0.5 text-xs ${PAY_STYLE[d.payment_status]}`}>{PAY_LABEL[d.payment_status]}</span>
                    <Flags review={d.needs_review} dispute={d.has_open_dispute} refunds={d.has_refunds} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {q.data && <Pager offset={offset} total={q.data.total} onPage={setOffset} />}
    </div>
  );
}

function CallsList({ onOpen }: { onOpen(id: string): void }) {
  const [offset, setOffset] = useState(0);
  const q = useQuery({ queryKey: ['admin-sales-calls', offset], queryFn: () => listSalesCalls(offset) });
  return (
    <div className="space-y-3">
      <Status loading={q.isLoading} error={q.error} />
      {q.data && (
        <div className={CARD}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={WIDE}>Date</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Length</TableHead>
                <TableHead>Deal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground">
                    No call records yet.
                  </TableCell>
                </TableRow>
              )}
              {q.data.items.map((c) => (
                <TableRow key={c.call_session_id} className="cursor-pointer" onClick={() => onOpen(c.call_session_id)}>
                  <TableCell className={`${WIDE} whitespace-nowrap text-sm`}>{when(c.started_at)}</TableCell>
                  <TableCell className="min-w-0">
                    <div className="font-medium">{c.client.name || 'Unknown'}</div>
                    <div className="text-xs text-muted-foreground [overflow-wrap:anywhere] md:whitespace-nowrap">{c.client.email || c.client.account_email}</div>
                    <div className="text-xs text-muted-foreground md:hidden">{when(c.started_at)}</div>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">{clock(c.duration_seconds)}</TableCell>
                  <TableCell className="text-sm">{c.made_deal ? 'Yes' : 'No'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {q.data && <Pager offset={offset} total={q.data.total} onPage={setOffset} />}
    </div>
  );
}

function DealView({ dealId, onBack, onCall }: { dealId: string; onBack(): void; onCall(id: string): void }) {
  const q = useQuery({ queryKey: ['admin-sales-deal', dealId], queryFn: () => getSalesDeal(dealId) });
  const deal = q.data;
  return (
    <div className={WRAP}>
      <BackBar label="All orders" onBack={onBack} queryKey="admin-sales-deal" />
      <Status loading={q.isLoading} error={q.error} />
      {deal && (
        <>
          <section className={`${CARD} space-y-2 p-4 sm:p-5`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="break-words text-xl font-semibold">{deal.project_name}</h2>
                <p className="break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
                  {[deal.client.name, deal.client.email].filter(Boolean).join(' · ')}
                  {deal.customer_email && deal.customer_email !== deal.client.email ? ` · pays as ${deal.customer_email}` : ''}
                </p>
              </div>
              <div className="text-sm sm:text-right">
                <span className={`px-2 py-0.5 text-xs ${PAY_STYLE[deal.payment_status]}`}>{PAY_LABEL[deal.payment_status]}</span>
                <p className="mt-1 tabular-nums">
                  {money(deal.paid_cents, deal.currency)} of {money(deal.total_cents, deal.currency)}
                </p>
                <p className="text-xs text-muted-foreground">{when(deal.created_at)}</p>
              </div>
            </div>
            <p className="break-all font-mono text-[11px] text-muted-foreground">{deal.deal_id}</p>
          </section>

          <section aria-label="Payments" className={`${CARD} p-4 sm:p-5`}>
            <h3 className="mb-3 text-sm font-semibold">Payments</h3>
            <ul className="space-y-3">
              {deal.installments.map((i) => (
                <InstallmentRow key={i.n} deal={deal} inst={i} />
              ))}
            </ul>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section aria-label="Package" className={`${CARD} min-w-0 p-4 sm:p-5`}>
              <h3 className="mb-2 text-sm font-semibold">Package</h3>
              <PackageView pkg={deal.package} currency={deal.currency} />
            </section>
            <section aria-label="Calls" className={`${CARD} min-w-0 p-4 sm:p-5`}>
              <h3 className="mb-2 text-sm font-semibold">Calls with this client</h3>
              {deal.calls.length === 0 && <p className="text-sm text-muted-foreground">No call records.</p>}
              <ul className="space-y-1.5 text-sm">
                {deal.calls.map((c) => (
                  <li key={c.call_session_id}>
                    <button type="button" className="text-left underline-offset-4 hover:underline" onClick={() => onCall(c.call_session_id)}>
                      {when(c.started_at)} · {clock(c.duration_seconds)}
                      {c.made_this_deal ? ' · made this order' : ''}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const plain = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : asText(v));
const human = (key: string) => key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** What was agreed, readable: one line per item, then the terms. Plain text only; unknown parts are shown as text. */
function PackageView({ pkg, currency }: { pkg: unknown; currency: string }) {
  if (pkg == null) return <p className="text-sm text-muted-foreground">Nothing stored.</p>;
  if (!isObj(pkg)) return <p className="whitespace-pre-wrap break-words text-sm">{plain(pkg)}</p>;
  const { lines, included, discount, ...rest } = pkg;
  const items = Array.isArray(lines) ? lines.filter(isObj) : [];
  const extras = Array.isArray(included) ? included : [];
  return (
    <div className="space-y-3 text-sm">
      {items.length > 0 && (
        <ul className="divide-y divide-border">
          {items.map((l, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="min-w-0 break-words">
                {typeof l.qty === 'number' ? `${l.qty} × ` : ''}
                {plain(l.item ?? '')}
                {typeof l.unit_cents === 'number' && <span className="ml-1.5 text-xs text-muted-foreground">at {money(l.unit_cents, currency)}</span>}
              </span>
              {typeof l.total_cents === 'number' && <span className="shrink-0 tabular-nums">{money(l.total_cents, currency)}</span>}
            </li>
          ))}
        </ul>
      )}
      {isObj(discount) && (
        <p className="break-words">
          Discount: {plain(discount.what ?? '')}
          {discount.for ? ` for ${plain(discount.for)}` : ''}
        </p>
      )}
      {extras.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground">Included free</p>
          <ul className="list-disc pl-5">
            {extras.map((x, i) => (
              <li key={i} className="break-words">
                {plain(x)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {Object.keys(rest).length > 0 && (
        <dl className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-x-3 gap-y-1">
          {Object.entries(rest).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="break-words text-muted-foreground">{human(k)}</dt>
              <dd className="min-w-0 whitespace-pre-wrap break-words">{plain(v)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** A ready email for one payment link: the admin's own mail app opens with it filled in (owner, 2026-11-06: keep
 *  delivery and the next payment simple). The last of several payments is the one due at delivery. */
export function paymentEmailHref(deal: SalesDeal, inst: Installment, url: string): string | null {
  const to = deal.customer_email || deal.client.email;
  if (!to) return null;
  const count = deal.installments.length;
  const first = (deal.client.name ?? '').trim().split(/\s+/)[0];
  const amount = money(inst.amount_cents, deal.currency);
  const atDelivery = count > 1 && inst.n === count;
  const lines = [
    first ? `Hi ${first},` : 'Hi,',
    '',
    atDelivery
      ? `Your images are ready. Please pay the remaining ${amount} here to get your final files:`
      : `Here is your payment link for ${amount} (${inst.label}):`,
    url,
    '',
    'Thank you,',
    'FormaNova Studio',
  ];
  const subject = count > 1 ? `Your FormaNova order: payment ${inst.n} of ${count}` : 'Your FormaNova order: payment';
  // mailto wants %20 for spaces, not URLSearchParams' "+".
  const query = new URLSearchParams({ subject, body: lines.join('\n') }).toString().replace(/\+/g, '%20');
  return `mailto:${encodeURIComponent(to)}?${query}`;
}

function InstallmentRow({ deal, inst }: { deal: SalesDeal; inst: Installment }) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const make = useMutation({
    mutationFn: () => generateLink(deal.deal_id, inst.n),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-sales-deal', deal.deal_id] });
      void qc.invalidateQueries({ queryKey: ['admin-sales-deals'] });
    },
    onError: (e) => {
      // Someone else already made or paid it: show what billing now holds.
      if (e instanceof BillingError && e.status === 409) void qc.invalidateQueries({ queryKey: ['admin-sales-deal', deal.deal_id] });
    },
  });
  const link = inst.current_link;
  const openUrl = inst.state === 'open' && link ? link.url : make.data?.url ?? null;
  const mailHref = openUrl ? paymentEmailHref(deal, inst, openUrl) : null;
  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* the link is still shown to copy by hand */
    }
  };
  return (
    <li className="border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-sm font-medium">{inst.label}</p>
          <p className="text-xs text-muted-foreground">
            {money(inst.amount_cents, deal.currency)} · {STATE_LABEL[inst.state]}
            {link?.paid_at ? ` ${when(link.paid_at)}` : ''}
            {link?.payer_email ? ` · by ${link.payer_email}` : ''}
            {link?.amount_refunded_cents ? ` · refunded ${money(link.amount_refunded_cents, deal.currency)}` : ''}
            <Flags review={link?.needs_review} dispute={!!link?.dispute} />
          </p>
          {link?.needs_review && link.review_reason && <p className="mt-1 break-words text-xs text-destructive">{link.review_reason}</p>}
          {link?.dispute && (
            <p className="mt-1 break-words text-xs text-destructive">
              Dispute {link.dispute.status}
              {link.dispute.reason ? ` (${link.dispute.reason})` : ''}
              {link.dispute.evidence_due_by ? ` · evidence due ${when(link.dispute.evidence_due_by)}` : ''}
            </p>
          )}
        </div>
        {canGenerate(inst.state) && !make.data && (
          <div className="flex flex-col items-end gap-1">
            <Button size="sm" disabled={make.isPending} onClick={() => make.mutate()}>
              {make.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create payment {inst.n} link
            </Button>
            {inst.n > 1 && <p className="text-xs text-muted-foreground">Create it once the work is delivered.</p>}
          </div>
        )}
      </div>
      {openUrl && (
        <div className="mt-2 flex min-w-0 items-center gap-2">
          <a href={openUrl} target="_blank" rel="noopener noreferrer" className="min-w-0 break-all text-xs underline-offset-4 hover:underline">
            {openUrl}
          </a>
          <Button size="sm" variant="outline" className="shrink-0" onClick={() => void copy(openUrl)}>
            <Copy className="mr-1.5 h-3.5 w-3.5" /> {copied ? 'Copied' : 'Copy'}
          </Button>
          {mailHref && (
            <Button asChild size="sm" className="shrink-0">
              <a href={mailHref}>
                <Mail className="mr-1.5 h-3.5 w-3.5" /> Email client
              </a>
            </Button>
          )}
        </div>
      )}
      {make.isError && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {errorText(make.error)}
        </p>
      )}
      {inst.links.length > 1 && (
        <details className="mt-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer">{inst.links.length} links for this payment</summary>
          <ul className="mt-1 space-y-0.5">
            {inst.links.map((l) => (
              <li key={l.link_id} className="break-all">
                {when(l.created_at)} · {STATE_LABEL[l.status]} · {l.link_id}
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

function CallView({ callId, onBack, onDeal }: { callId: string; onBack(): void; onDeal(id: string): void }) {
  const q = useQuery({ queryKey: ['admin-sales-call', callId], queryFn: () => getSalesCall(callId) });
  const call = q.data;
  const turns = call ? recordTurns(call.record) : [];
  return (
    <div className={WRAP}>
      <BackBar label="All calls" onBack={onBack} queryKey="admin-sales-call" />
      <Status loading={q.isLoading} error={q.error} />
      {call && (
        <>
          <section className={`${CARD} space-y-4 p-4 sm:p-5`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-xl font-semibold">{call.client.name || 'Unknown caller'}</h2>
                <p className="break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
                  {[call.client.email, call.client.account_email !== call.client.email ? call.client.account_email : null].filter(Boolean).join(' · ')}
                </p>
              </div>
              <p className="text-right text-sm text-muted-foreground">
                {when(call.started_at)} · {clock(call.duration_seconds)}
              </p>
            </div>
            <SalesRecording call={call} />
            {call.deal_ids.length > 0 && (
              <p className="text-sm">
                Orders:{' '}
                {call.deal_ids.map((id, i) => (
                  <span key={id}>
                    {i > 0 && ', '}
                    <button type="button" className="break-all font-mono text-xs underline-offset-4 hover:underline" onClick={() => onDeal(id)}>
                      {id}
                    </button>
                  </span>
                ))}
              </p>
            )}
          </section>
          <section className={`${CARD} min-w-0 p-4 sm:p-5`}>
            <h3 className="mb-3 text-sm font-semibold">Conversation · {turns.length} turns</h3>
            {turns.length === 0 ? (
              <p className="text-sm text-muted-foreground">No transcript.</p>
            ) : (
              <ul aria-label="Transcript" className="max-h-[70vh] space-y-2.5 overflow-y-auto pr-1">
                {turns.map((t, i) => (
                  <li key={i} className={`flex ${t.role === 'client' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] px-3 py-2 text-sm ${t.role === 'client' ? 'bg-[hsl(var(--formanova-hero-accent)/0.12)]' : 'bg-muted'}`}>
                      <p className="mb-0.5 text-[11px] font-medium text-muted-foreground">
                        {t.role === 'ruby' ? 'Ruby' : 'Client'}
                        {typeof t.start_ms === 'number' && <span className="ml-2 tabular-nums">{clock(Math.floor(t.start_ms / 1000))}</span>}
                      </p>
                      <p className="whitespace-pre-wrap break-words">{t.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <details className={`${CARD} p-4 text-sm sm:p-5`}>
            <summary className="cursor-pointer font-semibold">Full call record</summary>
            <pre className="mt-2 max-h-[60vh] overflow-auto whitespace-pre-wrap break-words text-xs">{asText(call.record)}</pre>
          </details>
        </>
      )}
    </div>
  );
}

const RECORDING_NOTE: Record<string, string> = {
  none: 'No recording for this call.',
  too_large: 'The recording is too large to join here.',
  unavailable: 'The recording could not be prepared. Try Refresh.',
};

/** Fetched only when asked, with the admin's token (a bare audio src cannot send it), then played from a blob. */
function SalesRecording({ call }: { call: SalesCall }) {
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  if (!call.recording_url) return <p className="text-sm text-muted-foreground">{RECORDING_NOTE[call.recording_status] ?? RECORDING_NOTE.none}</p>;
  const src = call.recording_url;
  if (url)
    return (
      <div className="flex flex-wrap items-center gap-3">
        <CallAudio autoPlay src={url} className="min-w-0 flex-1" />
        <a href={url} download={`ruby-call-${call.call_session_id}.webm`} className="inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline">
          <Download className="h-4 w-4" /> Download
        </a>
      </div>
    );
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        size="sm"
        disabled={state === 'loading'}
        onClick={async () => {
          setState('loading');
          try {
            setUrl(URL.createObjectURL(await salesRecordingBlob(src, call.recording_mime)));
            setState('idle');
          } catch {
            setState('error');
          }
        }}
      >
        {state === 'loading' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
        Play recording
      </Button>
      {state === 'loading' && <span className="text-xs text-muted-foreground">Downloading the whole call first…</span>}
      {state === 'error' && (
        <span role="alert" className="text-xs text-destructive">
          The recording could not be loaded. Try again.
        </span>
      )}
    </div>
  );
}
