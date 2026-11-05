import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/authenticated-fetch', () => ({ authenticatedFetch: fetchMock }));

import { BillingError, canGenerate, generateLink, getSalesDeal, listSalesDeals, money, recordTurns, salesRecordingBlob } from './admin-billing';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => fetchMock.mockReset());

describe('admin billing api', () => {
  it('reads the orders list from /billing/admin, never /api/billing', async () => {
    fetchMock.mockResolvedValue(json(200, { items: [], total: 0, limit: 50, offset: 0 }));
    await listSalesDeals(50);
    expect(fetchMock).toHaveBeenCalledWith('/billing/admin/sales-deals?limit=50&offset=50', undefined);
  });

  it('escapes the deal id in the address', async () => {
    fetchMock.mockResolvedValue(json(200, {}));
    await getSalesDeal('deal/../x');
    expect(fetchMock.mock.calls[0][0]).toBe('/billing/admin/sales-deals/deal%2F..%2Fx');
  });

  it('generate link sends only installment_n: the amount always comes from the stored deal', async () => {
    fetchMock.mockResolvedValue(json(201, { link_id: 'slink_1', url: 'https://buy.stripe.com/x', status: 'open' }));
    await generateLink('deal_1', 2);
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe('/billing/admin/sales-deals/deal_1/payment-links');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ installment_n: 2 });
  });

  it('turns billing errors into a BillingError with detail.code and link_id', async () => {
    fetchMock.mockResolvedValue(json(409, { detail: { code: 'installment_already_paid', message: 'Already paid.', link_id: 'slink_9' } }));
    const err = await generateLink('deal_1', 1).catch((e) => e);
    expect(err).toBeInstanceOf(BillingError);
    expect(err).toMatchObject({ status: 409, code: 'installment_already_paid', message: 'Already paid.', linkId: 'slink_9' });
  });

  it('keeps a plain-string detail (auth errors) as the message', async () => {
    fetchMock.mockResolvedValue(json(403, { detail: 'Admin only' }));
    await expect(listSalesDeals()).rejects.toMatchObject({ status: 403, code: null, message: 'Admin only' });
  });

  it('offers Generate link only for no_link, expired and cancelled', () => {
    expect(['no_link', 'expired', 'cancelled'].every((s) => canGenerate(s as never))).toBe(true);
    expect(['open', 'paid', 'refunded'].some((s) => canGenerate(s as never))).toBe(false);
  });

  it('formats cents as money', () => {
    expect(money(25000)).toBe('$250.00');
    expect(money(null)).toBe('-');
  });
});

describe('recording fetch', () => {
  it('fetches a same-site recording with the token and keeps the mime base type', async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const sha = 'a'.repeat(64);
    const blob = await salesRecordingBlob(`${window.location.origin}/api/artifacts/${sha}`, 'audio/webm;codecs=opus');
    expect(fetchMock).toHaveBeenCalledWith(`/api/artifacts/${sha}`);
    expect(blob.type).toBe('audio/webm');
    expect(blob.size).toBe(3);
  });

  it('never sends the token to another host: an artifact there is fetched from this site by its hash', async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([1]), { status: 200 }));
    const sha = 'b'.repeat(64);
    await salesRecordingBlob(`https://formanova.ai/api/artifacts/${sha}`, null);
    expect(fetchMock).toHaveBeenCalledWith(`/api/artifacts/${sha}`);
  });

  it('refuses any other foreign address', async () => {
    await expect(salesRecordingBlob('https://evil.example/steal', null)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('record transcript', () => {
  it('keeps only ruby/client turns with text', () => {
    expect(
      recordTurns({ turns: [{ role: 'ruby', text: ' Hi ', start_ms: 1000 }, { role: 'system', text: 'x' }, { role: 'client', text: '' }, 'junk'] }),
    ).toEqual([{ role: 'ruby', text: 'Hi', start_ms: 1000 }]);
    expect(recordTurns(null)).toEqual([]);
  });
});
