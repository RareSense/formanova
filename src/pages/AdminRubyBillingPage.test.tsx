import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({
  listSalesDeals: vi.fn(),
  getSalesDeal: vi.fn(),
  generateLink: vi.fn(),
  listSalesCalls: vi.fn(),
  getSalesCall: vi.fn(),
  salesRecordingBlob: vi.fn(),
}));
vi.mock('@/lib/ruby-call/admin-billing', async (orig) => ({ ...(await orig<object>()), ...api }));

import AdminRubyBillingPage from './AdminRubyBillingPage';
import type { SalesDeal, SalesDealRow } from '@/lib/ruby-call/admin-billing';

const XSS = '<img src=x onerror=alert(1)>';
const client = { user_id: 'u1', email: 'sara@brand.com', name: 'Sara Khan' };

const row = (over: Partial<SalesDealRow> = {}): SalesDealRow => ({
  deal_id: 'deal_1',
  client,
  project_name: 'Bracelet shoot, 82 images',
  total_cents: 50000,
  paid_cents: 25000,
  installments_paid: 1,
  installments_total: 2,
  payment_status: 'part_paid',
  has_refunds: false,
  needs_review: false,
  has_open_dispute: false,
  created_at: '2026-11-04T10:00:00Z',
  ...over,
});

const deal = (state2: SalesDeal['installments'][number]['state'] = 'no_link'): SalesDeal => ({
  deal_id: 'deal_1',
  client,
  project_name: 'Bracelet shoot, 82 images',
  currency: 'usd',
  total_cents: 50000,
  paid_cents: 25000,
  payment_status: 'part_paid',
  customer_email: 'billing@brand.com',
  package: { items: '82', note: XSS },
  created_at: '2026-11-04T10:00:00Z',
  installments: [
    {
      n: 1,
      label: 'Payment 1 of 2: 50% deposit',
      amount_cents: 25000,
      state: 'paid',
      current_link: {
        link_id: 'slink_1', status: 'paid', url: 'https://buy.stripe.com/a', paid_at: '2026-11-04T10:05:00Z', payer_email: 'billing@brand.com',
        amount_paid_cents: 25000, amount_refunded_cents: 0, needs_review: false, review_reason: null, created_at: '2026-11-04T10:00:00Z', dispute: null,
      },
      links: [],
    },
    { n: 2, label: 'Payment 2 of 2: on delivery', amount_cents: 25000, state: state2, current_link: null, links: [] },
  ],
  calls: [{ call_session_id: 'rbc_1', started_at: '2026-11-04T09:50:00Z', duration_seconds: 600, client_name: 'Sara Khan', made_this_deal: true }],
});

function renderPage(path = '/admin/ruby-orders') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <AdminRubyBillingPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
  api.listSalesDeals.mockResolvedValue({ items: [row(), row({ deal_id: 'deal_2', needs_review: true, has_open_dispute: true })], total: 2, limit: 50, offset: 0 });
  api.getSalesDeal.mockResolvedValue(deal());
  api.listSalesCalls.mockResolvedValue({ items: [], total: 0, limit: 50, offset: 0 });
});

describe('Admin Ruby orders page', () => {
  it('lists orders with paid / total and flags review and dispute rows', async () => {
    renderPage();
    expect(await screen.findAllByText('of $500.00 · 1/2 paid')).toHaveLength(2);
    const rows = document.querySelectorAll('tr[data-flagged="true"]');
    expect(rows).toHaveLength(1);
    expect(within(rows[0] as HTMLElement).getByText('Needs review')).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText('Dispute')).toBeInTheDocument();
  });

  it('shows Create payment link only for an installment without a usable link, and shows the new link', async () => {
    api.generateLink.mockResolvedValue({ link_id: 'slink_2', url: 'https://buy.stripe.com/new', status: 'open' });
    renderPage('/admin/ruby-orders?deal=deal_1');
    const btn = await screen.findByRole('button', { name: 'Create payment 2 link' });
    expect(screen.queryByRole('button', { name: 'Create payment 1 link' })).not.toBeInTheDocument();
    fireEvent.click(btn);
    await waitFor(() => expect(api.generateLink).toHaveBeenCalledWith('deal_1', 2));
    expect(await screen.findByText('https://buy.stripe.com/new')).toBeInTheDocument();
  });

  it.each(['open', 'paid', 'refunded'] as const)('no Create button when installment 2 is %s', async (state) => {
    api.getSalesDeal.mockResolvedValue(deal(state));
    renderPage('/admin/ruby-orders?deal=deal_1');
    await screen.findByText('Payment 2 of 2: on delivery');
    expect(screen.queryByRole('button', { name: /Create payment/ })).not.toBeInTheDocument();
  });

  it('after delivery: one click makes the link, then Email client opens a ready email with the amount and link', async () => {
    api.generateLink.mockResolvedValue({ link_id: 'slink_2', url: 'https://buy.stripe.com/new', status: 'open' });
    renderPage('/admin/ruby-orders?deal=deal_1');
    expect(await screen.findByText('Create it once the work is delivered.')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Create payment 2 link' }));
    const mail = await screen.findByRole('link', { name: /Email client/ });
    const href = mail.getAttribute('href') ?? '';
    expect(href.startsWith('mailto:billing%40brand.com?')).toBe(true);
    const params = new URLSearchParams(href.split('?')[1]);
    expect(params.get('subject')).toBe('Your FormaNova order: payment 2 of 2');
    const body = params.get('body') ?? '';
    expect(body).toContain('Hi Sara,');
    expect(body).toContain('Your images are ready.');
    expect(body).toContain('$250.00');
    expect(body).toContain('https://buy.stripe.com/new');
  });

  it('an open link already made shows Email client too; a paid one does not', async () => {
    const open = deal('open');
    open.installments[1].current_link = { ...open.installments[0].current_link!, link_id: 'slink_2', status: 'open', url: 'https://buy.stripe.com/two', paid_at: null };
    api.getSalesDeal.mockResolvedValue(open);
    renderPage('/admin/ruby-orders?deal=deal_1');
    expect(await screen.findByRole('link', { name: /Email client/ })).toHaveAttribute('href', expect.stringContaining('buy.stripe.com%2Ftwo'));
    expect(screen.getAllByRole('link', { name: /Email client/ })).toHaveLength(1); // payment 1 is paid: nothing to send
  });

  it('shows billing\'s message when Create fails', async () => {
    const { BillingError } = await import('@/lib/ruby-call/admin-billing');
    api.generateLink.mockRejectedValue(new BillingError(409, 'installment_already_paid', 'Already paid.', 'slink_9'));
    renderPage('/admin/ruby-orders?deal=deal_1');
    fireEvent.click(await screen.findByRole('button', { name: 'Create payment 2 link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Already paid.');
  });

  it('renders the package as text, never as HTML', async () => {
    renderPage('/admin/ruby-orders?deal=deal_1');
    const pkg = await screen.findByRole('region', { name: 'Package' });
    expect(pkg).toHaveTextContent(XSS);
    expect(pkg.querySelector('img')).toBeNull();
  });

  it('opens a call: transcript and record as text, recording fetched with the token on click', async () => {
    api.getSalesCall.mockResolvedValue({
      call_session_id: 'rbc_1', started_at: '2026-11-04T09:50:00Z', ended_at: '2026-11-04T10:00:00Z', duration_seconds: 600,
      client: { ...client, account_email: 'owner@brand.com' }, deal_ids: ['deal_1'],
      recording_url: `${window.location.origin}/api/artifacts/${'a'.repeat(64)}`, recording_status: 'final', recording_mime: 'audio/webm',
      record: { turns: [{ role: 'client', text: XSS }], lead: {} },
    });
    api.salesRecordingBlob.mockResolvedValue(new Blob(['x'], { type: 'audio/webm' }));
    renderPage('/admin/ruby-orders?view=calls&call=rbc_1');
    const transcript = await screen.findByRole('list', { name: 'Transcript' });
    expect(transcript).toHaveTextContent(XSS);
    expect(document.querySelector('img')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Play recording' }));
    await waitFor(() => expect(document.querySelector('audio')).toHaveAttribute('src', 'blob:x'));
    expect(api.salesRecordingBlob).toHaveBeenCalledWith(expect.stringContaining('/api/artifacts/'), 'audio/webm');
  });

  it('says why there is no recording', async () => {
    api.getSalesCall.mockResolvedValue({
      call_session_id: 'rbc_2', started_at: '2026-11-04T09:50:00Z', ended_at: '2026-11-04T09:51:00Z', duration_seconds: 60,
      client, deal_ids: [], recording_url: null, recording_status: 'too_large', recording_mime: null, record: {},
    });
    renderPage('/admin/ruby-orders?call=rbc_2');
    expect(await screen.findByText('The recording is too large to join here.')).toBeInTheDocument();
  });
});
