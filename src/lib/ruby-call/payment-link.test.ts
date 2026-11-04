import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

const api = vi.hoisted(() => ({ runPaymentLink: vi.fn(), runPaymentStatus: vi.fn() }));
vi.mock('./sales-call-api', async (orig) => ({ ...(await orig<object>()), ...api }));

import { createPaymentLink, paymentLinkStatus, watchPayment } from './payment-link';

const DEAL = { lines: [{ productId: 'ecommerce-1k', quantity: 50 }], turnaround: 'standard', installmentCount: 2 };
const REQ = { callSessionId: 'cs-1', email: 'a@b.co', quote: {}, installment: 1, amountCents: 17500, deal: DEAL };

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('createPaymentLink', () => {
  it('without the server switch: a simulated test link for the call, after a short delay', async () => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_PUBLIC_SITE_URL', 'https://formanova.ai');
    let done = false;
    const p = createPaymentLink({ callSessionId: 'cs-1', email: 'a@b.c', quote: {}, installment: 2, amountCents: 500 }).then((r) => {
      done = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(await p).toEqual({ url: 'https://formanova.ai/pay/test/cs-1-2', simulated: true, linkId: null });
    expect(api.runPaymentLink).not.toHaveBeenCalled();
  });

  it('with the server switch: the server makes the link from the agreed deal, never from an amount', async () => {
    vi.stubEnv('VITE_RUBY_SERVER_PAYMENT_LINKS', 'true');
    api.runPaymentLink.mockResolvedValue({ simulated: false, url: 'https://buy.stripe.com/x?prefilled_email=a%40b.co', link_id: 'plink_1', deal_id: 'ruby-1' });
    expect(await createPaymentLink(REQ)).toEqual({ url: 'https://buy.stripe.com/x?prefilled_email=a%40b.co', simulated: false, linkId: 'plink_1' });
    expect(api.runPaymentLink).toHaveBeenCalledWith({ ...DEAL, customer_email: 'a@b.co', call_session_id: 'cs-1', installment: 1 });
  });

  it('while the server is not configured yet it answers simulated, and the page keeps its test link', async () => {
    vi.stubEnv('VITE_RUBY_SERVER_PAYMENT_LINKS', 'true');
    vi.stubEnv('VITE_PUBLIC_SITE_URL', 'https://formanova.ai');
    api.runPaymentLink.mockResolvedValue({ simulated: true, url: null, deal_id: 'ruby-1' });
    expect(await createPaymentLink(REQ)).toEqual({ url: 'https://formanova.ai/pay/test/cs-1-1', simulated: true, linkId: null });
  });

  it('a server refusal is an error, so Ruby says the team will email the link', async () => {
    vi.stubEnv('VITE_RUBY_SERVER_PAYMENT_LINKS', 'true');
    api.runPaymentLink.mockRejectedValue(new Error('ruby_payment_link_failed'));
    await expect(createPaymentLink(REQ)).rejects.toThrow();
  });
});

describe('payment status and watching for the payment', () => {
  it('reads paid, open and the rest from the server', async () => {
    api.runPaymentStatus.mockResolvedValue({ status: 'paid', paid_at: '2026-11-04T10:00:00Z' });
    expect(await paymentLinkStatus('plink_1')).toEqual({ status: 'paid', paidAt: '2026-11-04T10:00:00Z' });
  });

  it('checks every few seconds and calls back once when it is paid, then stops', async () => {
    vi.useFakeTimers();
    const check = vi.fn()
      .mockResolvedValueOnce({ status: 'open', paidAt: null })
      .mockRejectedValueOnce(new Error('blip'))
      .mockResolvedValue({ status: 'paid', paidAt: 't' });
    const onPaid = vi.fn();
    watchPayment(check, { intervalMs: 5000, maxMs: 60_000, isLive: () => true, onPaid });
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(onPaid).not.toHaveBeenCalled(); // an error is just a missed check
    await vi.advanceTimersByTimeAsync(5000);
    expect(onPaid).toHaveBeenCalledWith('t');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(check).toHaveBeenCalledTimes(3);
  });

  it('stops when the call ends, when the link is dead, or after the time limit', async () => {
    vi.useFakeTimers();
    let live = true;
    const check = vi.fn().mockResolvedValue({ status: 'open', paidAt: null });
    watchPayment(check, { intervalMs: 5000, maxMs: 60_000, isLive: () => live, onPaid: vi.fn() });
    await vi.advanceTimersByTimeAsync(5000);
    live = false;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(check).toHaveBeenCalledTimes(1);

    const expired = vi.fn().mockResolvedValue({ status: 'expired', paidAt: null });
    watchPayment(expired, { intervalMs: 5000, maxMs: 60_000, isLive: () => true, onPaid: vi.fn() });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(expired).toHaveBeenCalledTimes(1);

    const forever = vi.fn().mockResolvedValue({ status: 'open', paidAt: null });
    const stop = watchPayment(forever, { intervalMs: 5000, maxMs: 12_000, isLive: () => true, onPaid: vi.fn() });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(forever).toHaveBeenCalledTimes(2);
    stop();
  });
});
