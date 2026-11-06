import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { RubyCallDialog, pickDefaultLanguage } from './RubyCallDialog';
import { currentCaption } from '@/lib/ruby-call/call-view';
import type { CallCallbacks, StartOptions, WebRTCCall } from '@/lib/ruby-call/webrtc-call';
import type { CallRecorder } from '@/lib/ruby-call/call-recorder';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'a@b.c', full_name: 'Asha' } }),
}));

const api = vi.hoisted(() => ({
  getLanguages: vi.fn(),
  startVoiceSession: vi.fn(),
  callAudioUploader: vi.fn(() => 'uploader'),
}));
vi.mock('@/lib/ruby-call/sales-call-api', async (orig) => ({
  ...(await orig<typeof import('@/lib/ruby-call/sales-call-api')>()),
  ...api,
}));
const save = vi.hoisted(() => ({
  saveCallRecord: vi.fn(async () => true),
  keepLocally: vi.fn(),
  saveOnPageHide: vi.fn(),
  retryUnsavedCalls: vi.fn(async () => 0),
}));
vi.mock('@/lib/ruby-call/post-call-save', () => save);
const memory = vi.hoisted(() => ({
  fetchPastCalls: vi.fn(async () => [{ date: 'd', lead: {}, transcript: 'Ruby: hi', uploads: 0, links: 0 }]),
  callerContext: () => ({ timezone: 'Asia/Karachi', local_time: 'Tue 3 Nov, 15:40', browser_language: 'en-US' }),
}));
vi.mock('@/lib/ruby-call/call-memory', () => memory);

const SUMMARY = { mime: 'audio/webm', final_sha256: 'f', parts: [{ seq: 0, sha256: 's', bytes: 3 }], duration_ms: 9, audio_seen: true, failed_parts: 0 };

function fakes() {
  let cbs: CallCallbacks = {};
  const engine = {
    start: vi.fn(async (_o: StartOptions) => {}),
    end: vi.fn(async () => {}),
    toggleMute: vi.fn(),
    appendInstruction: vi.fn(() => true),
    endAfterGoodbye: vi.fn(),
    getTurns: () => [],
    getState: () => 'live',
  };
  const recorder = {
    prepare: vi.fn(),
    start: vi.fn(),
    addRemote: vi.fn(),
    setUploader: vi.fn(),
    stop: vi.fn(async () => SUMMARY),
    summary: vi.fn(() => ({ ...SUMMARY, final_sha256: null })),
    remoteLevel: () => 0,
    pageHide: vi.fn(),
    pageShow: vi.fn(),
  };
  const createCall = (c: CallCallbacks) => {
    cbs = c;
    return engine as unknown as WebRTCCall;
  };
  const opts = () => engine.start.mock.calls[0][0];
  return { engine, recorder, createCall, cbs: () => cbs, opts };
}

function renderDialog(f: ReturnType<typeof fakes>) {
  return render(
    <RubyCallDialog
      open
      onOpenChange={vi.fn()}
      createCall={f.createCall}
      createRecorder={() => f.recorder as unknown as CallRecorder}
    />,
  );
}

async function startCall(f: ReturnType<typeof fakes>, withSession = true) {
  renderDialog(f);
  fireEvent.click(screen.getByRole('button', { name: 'Start call' }));
  await waitFor(() => expect(f.engine.start).toHaveBeenCalled());
  if (withSession) {
    api.startVoiceSession.mockResolvedValue({ sdp: 'a', greeting: null, callSessionId: 'cs1', workflowId: 'wf1' });
    await act(async () => {
      await f.opts().createSession({ sdp: 'offer', language: 'en' });
    });
  }
}

describe('RubyCallDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getLanguages.mockResolvedValue([
      { code: 'en', name: 'English' },
      { code: 'hi', name: 'Hindi' },
    ]);
  });

  it('picks the browser language when supported, else English', () => {
    const langs = [
      { code: 'en', name: 'English' },
      { code: 'hi', name: 'Hindi' },
    ];
    expect(pickDefaultLanguage(langs, 'hi-IN')).toBe('hi');
    expect(pickDefaultLanguage(langs, 'fr-FR')).toBe('en');
  });

  it('captions show the line spoken now and skip Ruby listening sounds', () => {
    const t = (role: 'ruby' | 'client', text: string) => ({ role, text, start_ms: null, end_ms: null });
    expect(currentCaption([t('client', 'We sell rings'), t('ruby', 'Mm-hmm.')])?.turn.text).toBe('We sell rings');
    expect(currentCaption([])).toBeNull();
  });

  it('starts a session with memory and context, records, and saves the full call', async () => {
    const f = fakes();
    await startCall(f);
    expect(screen.getByText('Connecting…')).toBeInTheDocument();
    expect(f.recorder.prepare).toHaveBeenCalled();
    expect(api.startVoiceSession).toHaveBeenCalledWith({
      language: 'en',
      sdp: 'offer',
      clientName: 'Asha',
      clientEmail: 'a@b.c',
      caller: memory.callerContext(),
      pastCalls: [{ date: 'd', lead: {}, transcript: 'Ruby: hi', uploads: 0, links: 0 }],
    });
    expect(api.callAudioUploader).toHaveBeenCalledWith('wf1', 'cs1');
    expect(f.recorder.setUploader).toHaveBeenCalledWith('uploader');
    expect(f.opts().clientName).toBe('Asha');

    const mic = {} as MediaStream;
    act(() => {
      f.cbs().onLocalStream?.(mic);
      f.cbs().onState?.('live');
      f.cbs().onActivity?.('ruby');
      f.cbs().onTranscript?.([
        { role: 'ruby', text: 'Hello, I am Ruby', start_ms: 0, end_ms: 1 },
        { role: 'client', text: 'Hi there', start_ms: 2, end_ms: 3 },
      ]);
    });
    expect(f.recorder.start).toHaveBeenCalledWith(mic);
    expect(screen.getByText('00:00')).toBeInTheDocument();
    // Captions are off by default, like Eva's page.
    expect(screen.queryByText('Hi there')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Captions' }));
    expect(screen.getByText('Hi there')).toBeInTheDocument();
    expect(screen.queryByText('Hello, I am Ruby')).not.toBeInTheDocument();
    expect(f.engine.appendInstruction).toHaveBeenCalledWith('[Screen] The client turned captions on.');

    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    expect(f.engine.toggleMute).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /end call/i }));
    expect(f.engine.end).toHaveBeenCalled();

    const turns = [{ role: 'client' as const, text: 'Hi there', start_ms: 2, end_ms: 3 }];
    await act(async () => {
      await f.cbs().onEnded?.({ turns, reason: 'user' });
    });
    expect(save.keepLocally).toHaveBeenCalled();
    expect(save.saveCallRecord).toHaveBeenCalledWith('u1', {
      turns,
      call_session_id: 'cs1',
      reason: 'user',
      session_workflow_id: 'wf1',
      started_at: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
      ended_at: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
      lead: {},
      uploads: [],
      links: [],
      recording: SUMMARY,
    });
    expect(await screen.findByText('Thanks for calling.')).toBeInTheDocument();
  });

  it('shows "Ruby is checking" while a tool runs', async () => {
    const f = fakes();
    await startCall(f);
    act(() => {
      f.cbs().onState?.('live');
      f.cbs().onBusy?.(true);
    });
    expect(screen.getByText('00:00 · Ruby is checking…')).toBeInTheDocument();
  });

  it('looks like Eva: a phone-shaped call card that says plainly it is our AI, with no extra text', () => {
    const f = fakes();
    renderDialog(f);
    const phone = screen.getByTestId('ruby-phone');
    expect(screen.getByRole('heading', { name: 'Call our AI now' })).toBeInTheDocument();
    expect(phone).toHaveTextContent('Get your custom price.');
    expect(screen.getByRole('button', { name: 'Start call' })).toBeInTheDocument();
    expect(phone).not.toHaveTextContent(/sales agent/i);
    expect(phone).not.toHaveTextContent(/recorded/i);
    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
    expect(screen.queryByTestId('ruby-stage')).not.toBeInTheDocument();
  });

  it('puts prices and uploads in their own card beside the call, not inside it', async () => {
    const f = fakes();
    await startCall(f);
    act(() => f.cbs().onState?.('live'));
    await act(async () => {
      await f.opts().runTool!('show_on_screen', { kind: 'list', title: 'Next steps', items: ['Send photos'] });
    });
    const phone = screen.getByTestId('ruby-phone');
    const stage = screen.getByTestId('ruby-stage');
    expect(stage).toHaveTextContent('Send photos');
    expect(phone.contains(stage)).toBe(false);
  });

  it('shows panels beside the call, closes and hides them, and tells Ruby', async () => {
    const f = fakes();
    await startCall(f);
    act(() => f.cbs().onState?.('live'));
    const runTool = f.opts().runTool!;
    await act(async () => {
      await runTool('show_on_screen', { kind: 'list', title: 'Next steps', items: ['Send photos'] });
    });
    expect(screen.getByRole('region', { name: 'Next steps' })).toBeInTheDocument();
    expect(screen.getByText('Send photos')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hide panel' }));
    expect(screen.queryByText('Send photos')).not.toBeInTheDocument();
    expect(f.engine.appendInstruction).toHaveBeenCalledWith('[Screen] The client hid the panel.');
    await act(async () => {
      await runTool('set_call_view', { panel: 'show' });
    });
    expect(screen.getByText('Send photos')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close Next steps' }));
    expect(screen.queryByText('Send photos')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(f.engine.appendInstruction).toHaveBeenCalledWith('[Screen] The client closed the Next steps panel.'),
      { timeout: 3000 }, // screen notes are throttled to one per 2 s
    );
  });

  it('keeps one panel on screen: the newest replaces it, earlier ones stay reachable, clear_screen removes it', async () => {
    const f = fakes();
    await startCall(f);
    act(() => f.cbs().onState?.('live'));
    const runTool = f.opts().runTool!;
    // The result waits for the real render, so start it and let React commit (sync act) before awaiting.
    let pending: Promise<Record<string, unknown>> = Promise.resolve({});
    await act(async () => {
      pending = Promise.resolve(runTool('show_on_screen', { kind: 'list', title: 'Plans', items: ['Basic'] }));
      await Promise.resolve();
    });
    expect(await pending).toEqual({ shown: true, layout: 'compact' });
    await act(async () => {
      await runTool('show_on_screen', { kind: 'list', title: 'Steps', items: ['Send photos'] });
    });
    expect(screen.queryByText('Basic')).not.toBeInTheDocument();
    expect(screen.getByText('Send photos')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Plans' }));
    expect(screen.getByText('Basic')).toBeInTheDocument();
    expect(screen.queryByText('Send photos')).not.toBeInTheDocument();
    await act(async () => {
      await runTool('clear_screen', {});
    });
    expect(screen.queryByText('Basic')).not.toBeInTheDocument();
  });

  it('saves the lead Ruby collected and the last quote with the call', async () => {
    const f = fakes();
    await startCall(f);
    act(() => f.cbs().onState?.('live'));
    const runTool = f.opts().runTool!;
    await act(async () => {
      await runTool('update_lead', { brand: 'Aura', pieces: '500' });
      await runTool('update_lead', { email: 'u@aura.co' });
    });
    await act(async () => {
      await f.cbs().onEnded?.({ turns: [], reason: 'ruby_closed' });
    });
    expect(save.saveCallRecord).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ lead: { brand: 'Aura', pieces: '500', email: 'u@aura.co' } }),
    );
  });

  it('saves the call even when it ends by a lost connection with no words', async () => {
    const f = fakes();
    await startCall(f);
    act(() => f.cbs().onError?.('connection_lost'));
    await act(async () => {
      await f.cbs().onEnded?.({ turns: [], reason: 'connection_lost' });
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(/connection was lost/i);
    expect(save.saveCallRecord).toHaveBeenCalledWith('u1', expect.objectContaining({ reason: 'connection_lost', turns: [], recording: SUMMARY }));
  });

  it('shows a friendly microphone-blocked message and saves nothing when no session started', async () => {
    const f = fakes();
    await startCall(f, false);
    act(() => f.cbs().onError?.('mic_denied'));
    await act(async () => {
      await f.cbs().onEnded?.({ turns: [], reason: 'error' });
    });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/microphone access is blocked/i);
    expect(save.saveCallRecord).not.toHaveBeenCalled();
    expect(f.recorder.stop).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('retries unsaved calls of this user when it opens', () => {
    renderDialog(fakes());
    expect(save.retryUnsavedCalls).toHaveBeenCalledWith('u1');
  });
});
