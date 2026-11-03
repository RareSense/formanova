import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { RubyCallDialog, pickDefaultLanguage } from './RubyCallDialog';
import type { CallCallbacks, WebRTCCall } from '@/lib/ruby-call/webrtc-call';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'a@b.c', full_name: 'Asha' } }),
}));

const api = vi.hoisted(() => ({
  getLanguages: vi.fn(),
  startVoiceSession: vi.fn(),
  endCall: vi.fn(),
}));
vi.mock('@/lib/ruby-call/sales-call-api', () => api);

function fakeEngine() {
  let cbs: CallCallbacks = {};
  const engine = {
    start: vi.fn(async () => {}),
    end: vi.fn(async () => {}),
    toggleMute: vi.fn(),
  };
  const createCall = (c: CallCallbacks) => {
    cbs = c;
    return engine as unknown as WebRTCCall;
  };
  return { engine, createCall, cbs: () => cbs };
}

function renderDialog(createCall: (c: CallCallbacks) => WebRTCCall) {
  return render(<RubyCallDialog open onOpenChange={vi.fn()} createCall={createCall} />);
}

describe('RubyCallDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getLanguages.mockResolvedValue([
      { code: 'en', name: 'English' },
      { code: 'hi', name: 'Hindi' },
    ]);
    api.endCall.mockResolvedValue(undefined);
  });

  it('picks the browser language when supported, else English', () => {
    const langs = [
      { code: 'en', name: 'English' },
      { code: 'hi', name: 'Hindi' },
    ];
    expect(pickDefaultLanguage(langs, 'hi-IN')).toBe('hi');
    expect(pickDefaultLanguage(langs, 'fr-FR')).toBe('en');
  });

  it('goes idle -> connecting -> in call -> ended and saves the call', async () => {
    const f = fakeEngine();
    renderDialog(f.createCall);
    expect(screen.getByRole('button', { name: 'Start talking' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start talking' }));
    await waitFor(() => expect(f.engine.start).toHaveBeenCalled());
    expect(screen.getByText('Connecting to Ruby')).toBeInTheDocument();

    // The engine asks for a session with the signed-in user's name.
    api.startVoiceSession.mockResolvedValue({ sdp: 'a', greeting: null, callSessionId: 'cs1' });
    const startArgs = (f.engine.start.mock.calls[0] as unknown[])[0] as {
      createSession: (a: { sdp: string; language: string }) => Promise<unknown>;
    };
    await startArgs.createSession({ sdp: 'offer', language: 'en' });
    expect(api.startVoiceSession).toHaveBeenCalledWith({ language: 'en', sdp: 'offer', clientName: 'Asha' });

    act(() => {
      f.cbs().onState?.('live');
      f.cbs().onActivity?.('ruby');
      f.cbs().onTranscript?.([
        { role: 'ruby', text: 'Hello, I am Ruby', start_ms: 0, end_ms: 1 },
        { role: 'client', text: 'Hi there', start_ms: 2, end_ms: 3 },
      ]);
    });
    expect(screen.getByText('Ruby is speaking')).toBeInTheDocument();
    expect(screen.getByText('Hello, I am Ruby')).toBeInTheDocument();
    expect(screen.getByText('Hi there')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /mute/i }));
    expect(f.engine.toggleMute).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /end call/i }));
    expect(f.engine.end).toHaveBeenCalled();

    await act(async () => {
      await f.cbs().onEnded?.({
        turns: [{ role: 'client', text: 'Hi there', start_ms: 2, end_ms: 3 }],
        reason: 'user',
        recording: null,
      });
    });
    expect(api.endCall).toHaveBeenCalledWith({
      callSessionId: 'cs1',
      turns: [{ role: 'client', text: 'Hi there', start_ms: 2, end_ms: 3 }],
      reason: 'user',
    });
    expect(await screen.findByText('Thanks — your call is saved.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Close' }).length).toBeGreaterThan(0);
  });

  it('shows a friendly microphone-blocked message without internal details', async () => {
    const f = fakeEngine();
    renderDialog(f.createCall);
    fireEvent.click(screen.getByRole('button', { name: 'Start talking' }));
    await waitFor(() => expect(f.engine.start).toHaveBeenCalled());

    act(() => {
      f.cbs().onError?.('mic_denied');
    });
    await act(async () => {
      await f.cbs().onEnded?.({ turns: [], reason: 'error', recording: null });
    });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/microphone access is blocked/i);
    expect(alert).toHaveTextContent(/allow the microphone/i);
    expect(api.endCall).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows connection lost copy', async () => {
    const f = fakeEngine();
    renderDialog(f.createCall);
    fireEvent.click(screen.getByRole('button', { name: 'Start talking' }));
    await waitFor(() => expect(f.engine.start).toHaveBeenCalled());
    act(() => {
      f.cbs().onError?.('connection_lost');
    });
    await act(async () => {
      await f.cbs().onEnded?.({ turns: [], reason: 'connection_lost', recording: null });
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(/connection was lost/i);
  });
});
