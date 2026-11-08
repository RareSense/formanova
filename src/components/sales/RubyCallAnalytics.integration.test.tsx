/**
 * Integration: a whole Ruby call through the real dialog, hook, call tools and posthog-events,
 * with only the network, the WebRTC engine, the recorder and posthog-js faked. Checks the funnel
 * events fire once each, in order, with the right numbers, and never carry personal data.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RubyCallDialog } from './RubyCallDialog';
import { DoneForYouCard } from '@/components/pricing/DoneForYouCard';
import type { CallCallbacks, StartOptions, WebRTCCall } from '@/lib/ruby-call/webrtc-call';
import type { CallRecorder } from '@/lib/ruby-call/call-recorder';
import { SCREEN_CLAIM_NOTE } from '@/lib/ruby-call/screen-claims';

vi.mock('posthog-js', () => ({
  default: { capture: vi.fn(), people: { set: vi.fn(), set_once: vi.fn() }, identify: vi.fn(), reset: vi.fn(), __loaded: true },
}));
import posthog from 'posthog-js';

let mockUser: { id: string; email: string; full_name: string } | null = null;
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));

const QUOTE = {
  approved: true,
  last_offer: false,
  client: {
    totalCents: 3400,
    turnaroundLabel: 'Standard',
    lines: [{ label: 'E-commerce image, 2K', quantity: 5, unitPrice: '$6.80', lineTotal: '$34.00' }],
  },
};
const api = vi.hoisted(() => ({
  getLanguages: vi.fn(),
  startVoiceSession: vi.fn(),
  callAudioUploader: vi.fn(() => 'uploader'),
  runQuote: vi.fn(),
  runNegotiate: vi.fn(),
}));
vi.mock('@/lib/ruby-call/sales-call-api', async (orig) => ({ ...(await orig<typeof import('@/lib/ruby-call/sales-call-api')>()), ...api }));
const pay = vi.hoisted(() => ({
  createPaymentLink: vi.fn(async () => ({ url: 'https://pay/x', simulated: false, linkId: 'pl_1' })),
  paymentLinkStatus: vi.fn(),
  // Paid as soon as it is watched, so the test needs no timers.
  watchPayment: vi.fn((_check: unknown, opts: { onPaid(at: string | null): void }) => {
    queueMicrotask(() => opts.onPaid('2026-11-06T12:00:00Z'));
    return () => {};
  }),
}));
vi.mock('@/lib/ruby-call/payment-link', async (orig) => ({ ...(await orig<typeof import('@/lib/ruby-call/payment-link')>()), ...pay }));
const uploads = vi.hoisted(() => ({ uploadClientFile: vi.fn() }));
vi.mock('@/lib/ruby-call/client-uploads', async (orig) => ({ ...(await orig<typeof import('@/lib/ruby-call/client-uploads')>()), ...uploads }));
vi.mock('@/lib/ruby-call/post-call-save', () => ({
  saveCallRecord: vi.fn(async () => true),
  keepLocally: vi.fn(),
  saveOnPageHide: vi.fn(),
  retryUnsavedCalls: vi.fn(async () => 0),
}));
const memory = vi.hoisted(() => ({ fetchPastCalls: vi.fn(async (): Promise<unknown[]> => []) }));
vi.mock('@/lib/ruby-call/call-memory', async (orig) => ({
  openPastLink: (await orig<typeof import('@/lib/ruby-call/call-memory')>()).openPastLink,
  fetchPastCalls: memory.fetchPastCalls,
  callerContext: () => ({ timezone: 'Asia/Karachi', local_time: 't', browser_language: 'en-US' }),
}));

function fakes() {
  let cbs: CallCallbacks = {};
  const engine = {
    start: vi.fn(async (_o: StartOptions) => {}),
    end: vi.fn(async () => {}),
    toggleMute: vi.fn(),
    appendInstruction: vi.fn((_content: string) => true),
    endAfterGoodbye: vi.fn(),
    getTurns: () => [],
    getState: () => 'live',
  };
  const recorder = {
    prepare: vi.fn(),
    start: vi.fn(),
    addRemote: vi.fn(),
    setUploader: vi.fn(),
    stop: vi.fn(async () => null),
    summary: vi.fn(() => null),
    remoteLevel: () => 0,
    localLevel: () => 0,
    pageHide: vi.fn(),
    pageShow: vi.fn(),
  };
  return {
    engine,
    recorder,
    createCall: (c: CallCallbacks) => {
      cbs = c;
      return engine as unknown as WebRTCCall;
    },
    cbs: () => cbs,
    opts: () => engine.start.mock.calls[0][0],
  };
}

const rubyCalls = () => vi.mocked(posthog.capture).mock.calls.filter((c) => String(c[0]).startsWith('ruby_'));
const events = () => rubyCalls().map((c) => c[0]);
const propsOf = (name: string) => rubyCalls().find((c) => c[0] === name)?.[1] as Record<string, unknown>;

function renderCall(f: ReturnType<typeof fakes>) {
  render(
    <RubyCallDialog open onOpenChange={vi.fn()} createCall={f.createCall} createRecorder={() => f.recorder as unknown as CallRecorder} />,
  );
}

describe('Ruby call analytics (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'u1', email: 'asha@brand.com', full_name: 'Asha' };
    api.getLanguages.mockResolvedValue([{ code: 'en', name: 'English' }]);
    api.runQuote.mockResolvedValue(QUOTE);
    api.startVoiceSession.mockResolvedValue({ sdp: 'a', greeting: null, callSessionId: 'cs1', workflowId: 'wf1' });
  });

  it('the pricing card button records the click, signed in or not', () => {
    const onOpen = vi.fn();
    const { unmount } = render(
      <MemoryRouter>
        <DoneForYouCard onOpenCall={onOpen} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Get my price' }));
    unmount();
    mockUser = null;
    render(
      <MemoryRouter>
        <DoneForYouCard onOpenCall={onOpen} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Get my price' }));
    expect(rubyCalls().map((c) => [c[0], c[1]])).toEqual([
      ['ruby_cta_clicked', { signed_in: true }],
      ['ruby_cta_clicked', { signed_in: false }],
    ]);
  });

  it('a returning caller with an unpaid link from the last call: the page watches it, and Ruby hears when it is paid', async () => {
    memory.fetchPastCalls.mockResolvedValueOnce([
      { date: 'd', lead: {}, transcript: 'Client: bye', uploads: 0, links: 0, payment: { link_id: 'pl_old', status: 'open', total: '$285.00' } },
    ]);
    pay.paymentLinkStatus.mockResolvedValue({ status: 'paid', paidAt: null });
    const f = fakes();
    renderCall(f);
    fireEvent.click(screen.getByRole('button', { name: 'Start call' }));
    await waitFor(() => expect(f.engine.start).toHaveBeenCalled());
    await act(async () => {
      await f.opts().createSession({ sdp: 'offer', language: 'en' });
    });
    expect(pay.watchPayment).not.toHaveBeenCalled(); // not before the call is live
    act(() => f.cbs().onState?.('live'));
    await waitFor(() => expect(pay.watchPayment).toHaveBeenCalledTimes(1));
    const check = pay.watchPayment.mock.calls[0][0] as () => Promise<unknown>;
    await check();
    expect(pay.paymentLinkStatus).toHaveBeenCalledWith('pl_old');
    await waitFor(() => expect(f.engine.appendInstruction).toHaveBeenCalledWith(expect.stringContaining('payment was received')));
  });

  it('a caller with no unpaid past link starts no watch', async () => {
    const f = fakes();
    renderCall(f);
    fireEvent.click(screen.getByRole('button', { name: 'Start call' }));
    await waitFor(() => expect(f.engine.start).toHaveBeenCalled());
    await act(async () => {
      await f.opts().createSession({ sdp: 'offer', language: 'en' });
    });
    act(() => f.cbs().onState?.('live'));
    expect(pay.watchPayment).not.toHaveBeenCalled();
  });

  it('a full call records the funnel in order: started, connected, quotes, link, paid, uploads, team, ended', async () => {
    const f = fakes();
    renderCall(f);
    fireEvent.click(screen.getByRole('button', { name: 'Start call' }));
    await waitFor(() => expect(f.engine.start).toHaveBeenCalled());
    await act(async () => {
      await f.opts().createSession({ sdp: 'offer', language: 'en' });
    });
    act(() => f.cbs().onState?.('live'));

    const order = { lines: [{ productId: 'ecommerce-2k', quantity: 5 }] };
    await act(async () => {
      await f.opts().runTool!('quote_shoot', order);
      await f.opts().runTool!('quote_shoot', order);
      await f.opts().runTool!('send_payment_link', { ...order, email: 'asha@brand.com' });
    });
    await waitFor(() => expect(events()).toContain('ruby_payment_received'));

    await act(async () => {
      await f.opts().runTool!('request_upload', { purpose: 'jewelry_photos' });
    });
    uploads.uploadClientFile.mockResolvedValueOnce({ id: 'f1' }).mockRejectedValueOnce(new Error('too big'));
    const input = await waitFor(() => {
      const el = document.querySelector('input[type="file"]');
      expect(el).not.toBeNull();
      return el as HTMLInputElement;
    });
    await act(async () => {
      fireEvent.change(input, {
        target: { files: [new File(['a'], 'ring.jpg', { type: 'image/jpeg' }), new File(['b'], 'big.jpg', { type: 'image/jpeg' })] },
      });
    });
    await waitFor(() => expect(events()).toContain('ruby_files_uploaded'));
    await act(async () => {
      await f.opts().runTool!('contact_team', {});
    });
    await act(async () => {
      await f.cbs().onEnded?.({ turns: [], reason: 'ruby_closed' } as never);
    });

    expect(events()).toEqual([
      'ruby_call_started',
      'ruby_call_connected',
      'ruby_quote_shown',
      'ruby_quote_shown',
      'ruby_payment_link_created',
      'ruby_payment_received',
      'ruby_files_uploaded',
      'ruby_team_contact_shown',
      'ruby_call_ended',
    ]);
    expect(propsOf('ruby_call_started')).toEqual({ language: 'en' });
    expect(propsOf('ruby_call_connected')).toMatchObject({ language: 'en' });
    expect(propsOf('ruby_quote_shown')).toEqual({
      approved: true,
      total_cents: 3400,
      image_count: 5,
      sizes: '2k',
      turnaround: 'standard',
      installments: 1,
      last_offer: false,
      quote_number: 1,
    });
    expect(rubyCalls().filter((c) => c[0] === 'ruby_quote_shown')[1][1]).toMatchObject({ quote_number: 2 });
    expect(propsOf('ruby_payment_link_created')).toEqual({ total_cents: 3400, first_payment_cents: 3400, installments: 1, simulated: false });
    expect(propsOf('ruby_payment_received')).toMatchObject({ amount_cents: 3400 });
    expect(propsOf('ruby_files_uploaded')).toEqual({ purpose: 'jewelry_photos', uploaded: 1, failed: 1 });
    expect(propsOf('ruby_call_ended')).toMatchObject({
      reason: 'ruby_closed',
      quotes_shown: 2,
      link_created: true,
      paid: true,
      files_uploaded: 1,
      error_code: null,
    });
    expect(typeof propsOf('ruby_call_ended').duration_s).toBe('number');

    // No personal data in any Ruby event: no email, name, payment link or call ids.
    const all = JSON.stringify(rubyCalls());
    for (const secret of ['asha@brand.com', 'Asha', 'https://pay/x', 'cs1', 'wf1']) expect(all).not.toContain(secret);
  });

  it('Ruby saying "it is on your screen" when nothing new was shown gets a note to correct herself; a real panel does not', async () => {
    const f = fakes();
    renderCall(f);
    fireEvent.click(screen.getByRole('button', { name: 'Start call' }));
    await waitFor(() => expect(f.engine.start).toHaveBeenCalled());
    await act(async () => {
      await f.opts().createSession({ sdp: 'offer', language: 'en' });
    });
    act(() => f.cbs().onState?.('live'));
    const notes = () => f.engine.appendInstruction.mock.calls.filter((c) => c[0] === SCREEN_CLAIM_NOTE).length;

    // The call in question: "put it" -> "Done, it's on your screen." with nothing shown.
    act(() => f.cbs().onTranscript?.([{ role: 'client', text: 'Put it.' }, { role: 'ruby', text: "Done, it's on your screen." }] as never));
    await waitFor(() => expect(notes()).toBe(1), { timeout: 4000 });

    // A real quote on screen after the caller spoke: the claim is true, no note.
    act(() => f.cbs().onTranscript?.([{ role: 'client', text: 'Show me the price.' }] as never));
    await act(async () => {
      await f.opts().runTool!('quote_shoot', { lines: [{ productId: 'ecommerce-2k', quantity: 5 }] });
    });
    act(() =>
      f.cbs().onTranscript?.([{ role: 'client', text: 'Show me the price.' }, { role: 'ruby', text: "I've put your price on your screen." }] as never),
    );
    await new Promise((r) => setTimeout(r, 3000));
    expect(notes()).toBe(1);
  }, 10000);

  it('a typed brief is saved with the call and Ruby is told', async () => {
    const { saveCallRecord } = await import('@/lib/ruby-call/post-call-save');
    const f = fakes();
    renderCall(f);
    fireEvent.click(screen.getByRole('button', { name: 'Start call' }));
    await waitFor(() => expect(f.engine.start).toHaveBeenCalled());
    await act(async () => {
      await f.opts().createSession({ sdp: 'offer', language: 'en' });
    });
    act(() => f.cbs().onState?.('live'));
    await act(async () => {
      await f.opts().runTool!('request_brief', {});
    });
    const box = await screen.findByLabelText(/Or just tell Ruby/);
    fireEvent.change(box, { target: { value: 'Black models, tight crops' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(f.engine.appendInstruction).toHaveBeenCalledWith(expect.stringContaining('Black models, tight crops'));
    await act(async () => {
      await f.cbs().onEnded?.({ turns: [], reason: 'ruby_closed' } as never);
    });
    const saved = JSON.stringify(vi.mocked(saveCallRecord).mock.calls.at(-1));
    expect(saved).toContain('Black models, tight crops');
  });

  it('a call that fails before connecting records the failure and the end, never "connected"', async () => {
    const f = fakes();
    renderCall(f);
    fireEvent.click(screen.getByRole('button', { name: 'Start call' }));
    await waitFor(() => expect(f.engine.start).toHaveBeenCalled());
    await act(async () => {
      f.cbs().onError?.('mic_denied');
      await f.cbs().onEnded?.({ turns: [], reason: 'error' } as never);
    });
    expect(events()).toEqual(['ruby_call_started', 'ruby_call_failed', 'ruby_call_ended']);
    expect(propsOf('ruby_call_failed')).toEqual({ error_code: 'mic_denied', stage: 'connecting' });
    expect(propsOf('ruby_call_ended')).toMatchObject({
      reason: 'error',
      quotes_shown: 0,
      link_created: false,
      paid: false,
      error_code: 'mic_denied',
    });
  });
});
