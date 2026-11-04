import { describe, it, expect, vi } from 'vitest';
import { CREDIT_PLANS } from '@/lib/credit-plans';
import { createCallTools, type ToolApi, type ToolHost } from './call-tools';
import { clientWording, installmentsOf, money, panelFromShowArgs, quotePanel } from './panels';

function makeHost() {
  const host = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tests read fields of any panel kind
    showPanel: vi.fn(async (_panel: any) => true),
    setLastQuote: vi.fn(),
    clearPanels: vi.fn(),
    setView: vi.fn(),
    updateLead: vi.fn(),
    setPayment: vi.fn(),
    endAfterGoodbye: vi.fn(),
    callSessionId: () => 'cs-1',
  } satisfies ToolHost;
  return host;
}

const APPROVED = {
  approved: true,
  needs_team_quote: false,
  client: {
    lines: [
      { label: 'Images, 2K', quantity: 120, unitPriceCents: 1000, lineTotalCents: 120000, needsTeamQuote: false },
      { label: 'Revisions', quantity: 15, unitPriceCents: 0, lineTotalCents: 0, needsTeamQuote: false, kind: 'allowance' },
    ],
    turnaround: 'rush',
    turnaroundLabel: 'Rush (3 days)',
    surchargeShare: 0.25,
    discountShare: 0.1,
    totalCents: 135000,
    partial: false,
    installments: [
      { label: 'Deposit before work starts', amountCents: 67500 },
      { label: 'Balance on delivery, before the final files are released', amountCents: 67500 },
    ],
  },
  internal: { quote: { costCents: 1 } },
};

function makeApi(over: Partial<ToolApi> = {}): ToolApi {
  return {
    runQuote: vi.fn(async () => APPROVED),
    runNegotiate: vi.fn(async () => ({ allowed: true, reason_for_ruby: null, negotiation: { n: 1 } })),
    createPaymentLink: vi.fn(async (r: { installment: number }) => ({ url: `https://x/pay/test/cs-1-${r.installment}`, simulated: true })),
    ...over,
  };
}

describe('panels', () => {
  it('formats money from cents', () => {
    expect(money(120000)).toBe('$1,200');
    expect(money(1250)).toBe('$12.50');
    expect(money(null)).toBe('');
  });

  it('validates show_on_screen tables and lists', () => {
    expect(panelFromShowArgs({ kind: 'table', title: 'T', columns: ['a', 'b'], rows: [['1', 2], ['3']], highlight: 1 })).toEqual({
      kind: 'table',
      title: 'T',
      kicker: undefined,
      columns: ['a', 'b'],
      rows: [
        ['1', '2'],
        ['3', ''],
      ],
      highlight: 1,
      total: undefined,
      note: undefined,
    });
    expect(panelFromShowArgs({ kind: 'table', title: 'T', columns: ['a'], rows: [] })).toHaveProperty('error');
    expect(panelFromShowArgs({ kind: 'list', title: 'L', items: ['x'] })).toMatchObject({ kind: 'list', items: ['x'] });
    expect(panelFromShowArgs({ kind: 'chart', title: 'X' })).toHaveProperty('error');
    // Wider than the compact layout can show: refused, so Ruby never claims it is on screen.
    expect(panelFromShowArgs({ kind: 'table', title: 'T', columns: ['1', '2', '3', '4', '5', '6', '7'], rows: [['a']] })).toHaveProperty('error');
    expect(panelFromShowArgs({ kind: 'list', items: ['x'] })).toHaveProperty('error');
  });

  it('turns a quote into a table with turnaround, discount and total', () => {
    expect(quotePanel(APPROVED)).toEqual({
      kind: 'table',
      title: 'Your quote',
      kicker: 'Rush (3 days)',
      columns: ['Item', 'Qty', 'Per unit', 'Total'],
      rows: [
        ['Images, 2K', '120', '$10', '$1,200'],
        ['Revisions', '15', 'Bonus', 'Free'],
        ['Turnaround: Rush (3 days)', '', '+25%', ''],
        ['Discount', '', '-10%', ''],
      ],
      total: '$1,350',
      note: undefined,
      schedule: [
        { n: 1, label: 'Deposit before work starts', amountCents: 67500, amount: '$675', due: null },
        { n: 2, label: 'Balance on delivery, before the final files are released', amountCents: 67500, amount: '$675', due: null },
      ],
    });
  });

  it('uses client wording: no "team" and no "human fix"', () => {
    expect(clientWording('15 human fixes in total')).toBe('15 fixes by an expert AI creative editor in total');
    expect(clientWording('This order needs a quote from our team')).toBe('This order needs a custom quote');
    expect(installmentsOf({ installments: [] })).toBeNull();
  });

  it('shows the delivery promise from the quote', () => {
    const p = quotePanel({ ...APPROVED, client: { ...APPROVED.client, deliveryWithin: '5 working days' } });
    expect(p).toMatchObject({ delivery: 'Delivery: within 5 working days, usually faster' });
  });

  it('shows a refused quote without numbers', () => {
    const p = quotePanel({ approved: false, client: { message: 'This order needs a quote from our team', teamContact: { email: 'studio@formanova.ai' } } });
    expect(p).toEqual({
      kind: 'list',
      title: 'Your quote',
      kicker: 'Quote',
      items: ['This order needs a custom quote', 'Contact: studio@formanova.ai'],
    });
  });
});

describe('call tools', () => {
  it('answers unknown tools with an error', async () => {
    const run = createCallTools(makeHost(), makeApi());
    expect(await run('fly', {})).toEqual({ error: 'Unknown tool "fly".' });
  });

  it('show_on_screen and clear_screen drive the panels', async () => {
    const host = makeHost();
    const run = createCallTools(host, makeApi());
    expect(await run('show_on_screen', { kind: 'list', title: 'Steps', items: ['a'] })).toEqual({ shown: true, layout: 'compact' });
    expect(host.showPanel).toHaveBeenCalledWith(expect.objectContaining({ kind: 'list', title: 'Steps' }));
    expect(await run('show_on_screen', { kind: 'table', title: 'x' })).toHaveProperty('error');
    expect(await run('clear_screen', {})).toEqual({ cleared: true });
    expect(host.clearPanels).toHaveBeenCalled();
  });

  it('show_on_screen reports an error when the panel did not render', async () => {
    const host = makeHost();
    host.showPanel.mockResolvedValue(false);
    expect(await createCallTools(host, makeApi())('show_on_screen', { kind: 'list', title: 'S', items: ['a'] })).toHaveProperty('error');
  });

  it('compare_plans shows the app plan data and returns it', async () => {
    const host = makeHost();
    const out = await createCallTools(host, makeApi())('compare_plans', {});
    expect((out.plans as unknown[]).length).toBe(CREDIT_PLANS.length);
    expect(out.plans).toContainEqual(expect.objectContaining({ name: CREDIT_PLANS[0].name, price_usd: CREDIT_PLANS[0].price }));
    expect(host.showPanel.mock.calls[0][0].rows[0][1]).toBe(`$${CREDIT_PLANS[0].price}`);
  });

  it('quote_shoot runs ruby_quote with negotiation, shows the quote and hides internal costs from the model', async () => {
    const host = makeHost();
    const api = makeApi();
    const out = await createCallTools(host, api)('quote_shoot', {
      lines: [{ productId: 'p2k', quantity: 120 }],
      turnaround: 'rush',
      negotiation: { n: 1 },
      installmentCount: 2,
    });
    expect(api.runQuote).toHaveBeenCalledWith({
      lines: [{ productId: 'p2k', quantity: 120 }],
      turnaround: 'rush',
      negotiation: { n: 1 },
      installmentCount: 2,
    });
    expect(out).toEqual({ approved: true, needs_team_quote: false, client: APPROVED.client, shown: true });
    expect(host.setLastQuote).toHaveBeenCalledWith({
      request: { lines: [{ productId: 'p2k', quantity: 120 }], turnaround: 'rush', negotiation: { n: 1 }, installmentCount: 2 },
      total: '$1,350',
      approved: true,
    });
    expect(out).not.toHaveProperty('internal');
    expect(host.showPanel.mock.calls[0][0]).toMatchObject({ kind: 'table', total: '$1,350' });
  });

  it('quote_shoot tells the model when a price is the last offer, and only then', async () => {
    const api = makeApi({ runQuote: vi.fn(async () => ({ ...APPROVED, last_offer: true })) });
    const out = await createCallTools(makeHost(), api)('quote_shoot', { lines: [{ productId: 'p', quantity: 300 }] });
    expect(out).toMatchObject({ approved: true, last_offer: true });
    const normal = await createCallTools(makeHost(), makeApi())('quote_shoot', { lines: [{ productId: 'p', quantity: 3 }] });
    expect(normal).not.toHaveProperty('last_offer');
  });

  it('request_contact shows the field for the channel the client chose, text channels only', async () => {
    const host = makeHost();
    const run = createCallTools(host, makeApi());
    expect(await run('request_contact', { channel: 'whatsapp' })).toEqual({ shown: true });
    expect(host.showPanel.mock.calls[0][0]).toMatchObject({ kind: 'reach', channel: 'whatsapp' });
    expect(await run('request_contact', { channel: 'phone' })).toHaveProperty('error');
    expect(host.showPanel).toHaveBeenCalledTimes(1);
  });

  it('quote_shoot reports bad input and failures as errors', async () => {
    const api = makeApi({ runQuote: vi.fn(async () => Promise.reject(new Error('down'))) });
    const run = createCallTools(makeHost(), api);
    expect(await run('quote_shoot', { lines: [] })).toHaveProperty('error');
    expect(await run('quote_shoot', { lines: [{ productId: 'p', quantity: 1 }], turnaround: 'tomorrow' })).toHaveProperty('error');
    expect(await run('quote_shoot', { lines: [{ productId: 'p', quantity: 1 }], installmentCount: 5 })).toHaveProperty('error');
    expect(await run('quote_shoot', { lines: [{ productId: 'p', quantity: 1 }] })).toHaveProperty('error');
  });

  it('check_concession passes the args to ruby_negotiate and returns its result', async () => {
    const api = makeApi();
    const args = { negotiation: { a: 1 }, proposal: { share: 0.05, inExchangeFor: 'case_study' } };
    expect(await createCallTools(makeHost(), api)('check_concession', args)).toMatchObject({ allowed: true });
    expect(api.runNegotiate).toHaveBeenCalledWith(args);
  });

  it('request_upload, request_link and contact_team show their cards', async () => {
    const host = makeHost();
    const run = createCallTools(host, makeApi());
    await run('request_upload', { title: 'Your rings', purpose: 'jewelry_photos' });
    await run('request_upload', { purpose: 'weird' });
    await run('request_link', { title: 'Your store' });
    await run('contact_team', {});
    expect(host.showPanel.mock.calls.map((c) => [c[0].kind, c[0].purpose ?? c[0].title])).toEqual([
      ['upload', 'jewelry_photos'],
      ['upload', 'other'],
      ['link', 'Your store'],
      ['contact', 'Talk to the FormaNova team'],
    ]);
  });

  it('update_lead keeps only known fields', async () => {
    const host = makeHost();
    await createCallTools(host, makeApi())('update_lead', { brand: ' Aura ', shopify: true, pieces: 120, hack: 'x', notes: '' });
    expect(host.updateLead).toHaveBeenCalledWith({ brand: 'Aura', shopify: true, pieces: '120', hack: 'x' });
    await createCallTools(host, makeApi())('update_lead', {
      data_ready: 'partly',
      data_sorted: false,
      needs_curation: true,
      photo_quality_notes: 'Some blurry shots',
      photo_source: 'link',
    });
    expect(host.updateLead).toHaveBeenLastCalledWith({
      data_ready: 'partly',
      data_sorted: false,
      needs_curation: true,
      photo_quality_notes: 'Some blurry shots',
      photo_source: 'link',
    });
    await createCallTools(host, makeApi())('update_lead', {
      resolution: '2K',
      aspect_ratios: ['1:1', '4:5'],
      style: 'clean white',
      references: 'moodboard on Drive',
      photos_link: 'https://drive.google.com/x',
      future_field: true,
      models_source: 'library',
      model_looks: 'South Asian, 25-35, soft studio light',
      'Bad Key': 'x',
      nested: { a: 1 },
    });
    expect(host.updateLead).toHaveBeenLastCalledWith({
      resolution: '2K',
      aspect_ratios: '1:1, 4:5',
      style: 'clean white',
      references: 'moodboard on Drive',
      photos_link: 'https://drive.google.com/x',
      future_field: true,
      models_source: 'library',
      model_looks: 'South Asian, 25-35, soft studio light',
    });
  });

  it('accepts express turnaround', async () => {
    const api = makeApi();
    await createCallTools(makeHost(), api)('quote_shoot', { lines: [{ productId: 'p', quantity: 1 }], turnaround: 'express' });
    expect(api.runQuote).toHaveBeenCalledWith({ lines: [{ productId: 'p', quantity: 1 }], turnaround: 'express' });
  });

  it('set_call_view maps captions, text size and panel', async () => {
    const host = makeHost();
    expect(await createCallTools(host, makeApi())('set_call_view', { captions: 'on', text_size: 'large', panel: 'hide' })).toEqual({ done: true });
    expect(host.setView).toHaveBeenCalledWith({ captions: true, textSize: 'large', panel: 'hide' });
    expect(await createCallTools(host, makeApi())('set_call_view', { compact: true })).toEqual({ done: true, layout: 'compact' });
    expect(host.setView).toHaveBeenLastCalledWith({ compact: true });
  });

  it('end_call hangs up after the goodbye', async () => {
    const host = makeHost();
    expect(await createCallTools(host, makeApi())('end_call', { reason: 'done' })).toEqual({ ending: true });
    expect(host.endAfterGoodbye).toHaveBeenCalled();
  });

  describe('send_payment_link', () => {
    const args = {
      lines: [{ productId: 'p2k', quantity: 120 }],
      turnaround: 'rush',
      negotiation: { n: 1 },
      installmentCount: 2,
      email: 'a@b.co',
    };
    const INSTALLMENTS = [
      { n: 1, label: 'Deposit before work starts', amountCents: 67500, amount: '$675', due: null, url: 'https://x/pay/test/cs-1-1' },
      {
        n: 2,
        label: 'Balance on delivery, before the final files are released',
        amountCents: 67500,
        amount: '$675',
        due: null,
        url: null,
      },
    ];

    it('re-prices, creates a link for the first payment only, shows the deal and saves the payment', async () => {
      const host = makeHost();
      const api = makeApi();
      const out = await createCallTools(host, api)('send_payment_link', args);
      expect(api.runQuote).toHaveBeenCalledWith({ lines: args.lines, turnaround: 'rush', negotiation: { n: 1 }, installmentCount: 2 });
      expect(api.createPaymentLink).toHaveBeenCalledWith({
        callSessionId: 'cs-1',
        email: 'a@b.co',
        quote: APPROVED.client,
        installment: 1,
        amountCents: 67500,
      });
      expect(api.createPaymentLink).toHaveBeenCalledTimes(1);
      expect(out).toEqual({
        url: 'https://x/pay/test/cs-1-1',
        total: '$1,350',
        totalCents: 135000,
        simulated: true,
        installments: INSTALLMENTS,
      });
      expect(host.showPanel.mock.calls[0][0]).toMatchObject({ kind: 'deal', total: '$1,350', simulated: true, installments: INSTALLMENTS });
      expect(host.setPayment).toHaveBeenCalledWith({
        url: 'https://x/pay/test/cs-1-1',
        total: '$1,350',
        totalCents: 135000,
        simulated: true,
        email: 'a@b.co',
        installments: INSTALLMENTS,
      });
      expect(host.updateLead).toHaveBeenCalledWith(expect.objectContaining({ email: 'a@b.co', payment_link: 'https://x/pay/test/cs-1-1' }));
    });

    it('makes a one-payment plan when the quote has no installments', async () => {
      const client = { ...APPROVED.client, installments: undefined };
      const api = makeApi({ runQuote: vi.fn(async () => ({ ...APPROVED, client })) });
      const out = await createCallTools(makeHost(), api)('send_payment_link', args);
      expect(out.installments).toEqual([
        { n: 1, label: 'Full payment before work starts', amountCents: 135000, amount: '$1,350', due: null, url: 'https://x/pay/test/cs-1-1' },
      ]);
    });

    it('refuses without a valid email or when the order needs a team quote', async () => {
      const host = makeHost();
      const api = makeApi({ runQuote: vi.fn(async () => ({ approved: false, client: { message: 'no' } })) });
      const run = createCallTools(host, api);
      expect(await run('send_payment_link', { ...args, email: 'nope' })).toHaveProperty('error');
      expect(await run('send_payment_link', args)).toHaveProperty('error');
      expect(api.createPaymentLink).not.toHaveBeenCalled();
      expect(host.setPayment).not.toHaveBeenCalled();
    });
  });
});
