import { describe, it, expect, vi, afterEach } from 'vitest';
import { createPaymentLink } from './payment-link';

describe('createPaymentLink (simulated until the backend Stripe endpoint exists)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('returns a test link for the call after a short delay, marked simulated', async () => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_PUBLIC_SITE_URL', 'https://formanova.ai');
    let done = false;
    const p = createPaymentLink({ callSessionId: 'cs-1', email: 'a@b.c', quote: {} }).then((r) => {
      done = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(await p).toEqual({ url: 'https://formanova.ai/pay/test/cs-1', simulated: true });
  });
});
