/**
 * The one place a Ruby call creates a payment link for an agreed deal.
 * The real Stripe endpoint comes from the backend later; until then the link is
 * simulated so the whole flow (panel, Pay now, saved with the call) can be tried.
 */
import { getPublicSiteUrl } from '@/lib/public-url';

export interface PaymentLinkRequest {
  callSessionId: string | null;
  email: string;
  /** The client view of the re-priced quote (ruby_quote). */
  quote: Record<string, unknown>;
}

export interface PaymentLink {
  url: string;
  simulated: boolean;
}

const SIMULATED_DELAY_MS = 600;

export async function createPaymentLink(req: PaymentLinkRequest): Promise<PaymentLink> {
  // SIMULATED — swap for the backend Stripe endpoint (via authenticatedFetch) once it exists.
  await new Promise((r) => setTimeout(r, SIMULATED_DELAY_MS));
  const id = encodeURIComponent(req.callSessionId || 'call');
  return { url: `${getPublicSiteUrl()}/pay/test/${id}`, simulated: true };
}
