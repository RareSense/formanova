/**
 * The one place a Ruby call creates a payment link for an agreed deal.
 * With VITE_RUBY_SERVER_PAYMENT_LINKS=true the link is made on the server (ruby_payment_link: the server re-prices
 * the agreed deal and calls the billing endpoint; the browser never sets an amount). Until that is switched on, or
 * while the server has no billing endpoint configured, the link is simulated so the flow can still be tried.
 */
import { getPublicSiteUrl } from '@/lib/public-url';
import { runPaymentLink, runPaymentStatus, type QuoteRequest } from './sales-call-api';

export interface PaymentLinkRequest {
  callSessionId: string | null;
  email: string;
  /** The client view of the re-priced quote (ruby_quote). */
  quote: Record<string, unknown>;
  /** Which payment of the plan (1 = deposit or the full payment). */
  installment: number;
  amountCents: number;
  /** The agreed deal; the server prices the link from this. */
  deal?: QuoteRequest;
  /** The open link this one replaces on the same call (the order changed); billing cancels it first. */
  replacesLinkId?: string | null;
}

export interface PaymentLink {
  url: string;
  simulated: boolean;
  /** The billing link id, to check for the payment; null when simulated. */
  linkId: string | null;
  /** The replaced link was already paid, so no new link was made. */
  alreadyPaid?: boolean;
  /** Ruby's sample rules refused it: the sample pack (5 for $30) is once per account. */
  samplesRefused?: { left: number };
}

const SIMULATED_DELAY_MS = 600;

export const serverPaymentLinksEnabled = (): boolean => import.meta.env.VITE_RUBY_SERVER_PAYMENT_LINKS === 'true';

function simulatedLink(req: PaymentLinkRequest): PaymentLink {
  const id = encodeURIComponent(`${req.callSessionId || 'call'}-${req.installment}`);
  return { url: `${getPublicSiteUrl()}/pay/test/${id}`, simulated: true, linkId: null };
}

export async function createPaymentLink(req: PaymentLinkRequest): Promise<PaymentLink> {
  if (serverPaymentLinksEnabled() && req.deal) {
    const result = await runPaymentLink({
      ...req.deal,
      customer_email: req.email,
      call_session_id: req.callSessionId,
      installment: req.installment,
      ...(req.replacesLinkId ? { replaces_link_id: req.replacesLinkId } : {}),
    });
    if (result.already_paid === true) {
      return { url: '', simulated: false, linkId: typeof result.link_id === 'string' ? result.link_id : null, alreadyPaid: true };
    }
    if (result.samples_used === true) {
      const left = typeof result.samples_left === 'number' ? result.samples_left : 0;
      return { url: '', simulated: false, linkId: null, samplesRefused: { left } };
    }
    if (result.simulated === false && typeof result.url === 'string' && result.url.startsWith('https://')) {
      return { url: result.url, simulated: false, linkId: typeof result.link_id === 'string' ? result.link_id : null };
    }
    return simulatedLink(req); // the server has no billing endpoint yet
  }
  await new Promise((r) => setTimeout(r, SIMULATED_DELAY_MS));
  return simulatedLink(req);
}

export interface LinkStatus {
  status: string;
  paidAt: string | null;
}

export async function paymentLinkStatus(linkId: string): Promise<LinkStatus> {
  const r = await runPaymentStatus(linkId);
  return { status: typeof r.status === 'string' ? r.status : 'open', paidAt: typeof r.paid_at === 'string' ? r.paid_at : null };
}

const DEAD = new Set(['expired', 'cancelled', 'refunded', 'simulated']);

/**
 * Checks for the payment every few seconds while the call is live, so Ruby can say "payment received".
 * A failed check is just skipped; it stops on payment, a dead link, the end of the call or the time limit.
 * Returns a stop function.
 */
export function watchPayment(
  check: () => Promise<LinkStatus>,
  opts: { intervalMs?: number; maxMs?: number; isLive: () => boolean; onPaid: (paidAt: string | null) => void },
): () => void {
  const interval = opts.intervalMs ?? 5000;
  const deadline = Date.now() + (opts.maxMs ?? 30 * 60_000);
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
  const tick = async () => {
    if (stopped || !opts.isLive() || Date.now() > deadline) return stop();
    try {
      const { status, paidAt } = await check();
      if (stopped) return;
      if (status === 'paid') {
        stop();
        opts.onPaid(paidAt);
        return;
      }
      if (DEAD.has(status)) return stop();
    } catch {
      /* a missed check; try again next time */
    }
    if (!stopped) timer = setTimeout(() => void tick(), interval);
  };
  timer = setTimeout(() => void tick(), interval);
  return stop;
}
