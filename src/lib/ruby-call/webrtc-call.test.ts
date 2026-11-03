import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebRTCCall, type CallDeps, type CallEndResult, type CallErrorCode } from './webrtc-call';

type Listener = (e: unknown) => void;

class FakeDataChannel {
  readyState = 'open';
  sent: Record<string, unknown>[] = [];
  closed = false;
  private listeners: Record<string, Listener[]> = {};
  addEventListener(type: string, fn: Listener) {
    (this.listeners[type] ||= []).push(fn);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.closed = true;
    this.readyState = 'closed';
  }
  emit(type: string, e: unknown = {}) {
    (this.listeners[type] || []).forEach((fn) => fn(e));
  }
  message(obj: unknown) {
    this.emit('message', { data: JSON.stringify(obj) });
  }
}

class FakePC {
  iceGatheringState = 'complete';
  connectionState = 'new';
  localDescription = { sdp: 'offer-sdp' };
  remote: unknown = null;
  tracks: unknown[] = [];
  closed = false;
  dc = new FakeDataChannel();
  private listeners: Record<string, Listener[]> = {};
  addEventListener(type: string, fn: Listener) {
    (this.listeners[type] ||= []).push(fn);
  }
  removeEventListener() {}
  addTrack(t: unknown) {
    this.tracks.push(t);
  }
  createDataChannel() {
    return this.dc;
  }
  async createOffer() {
    return { type: 'offer', sdp: 'offer-sdp' };
  }
  async setLocalDescription() {}
  async setRemoteDescription(d: unknown) {
    this.remote = d;
  }
  close() {
    this.closed = true;
  }
  emit(type: string, e: unknown = {}) {
    (this.listeners[type] || []).forEach((fn) => fn(e));
  }
}

function makeMic() {
  const track = { enabled: true, stop: vi.fn() };
  const mic = { getAudioTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
  return { mic, track };
}

function setup(overrides: Partial<CallDeps> = {}) {
  const pc = new FakePC();
  const { mic, track } = makeMic();
  const recorder = { start: vi.fn(), stop: vi.fn(async () => {}), mimeType: 'audio/webm' };
  let onChunk: (b: Blob) => void = () => {};
  const deps: CallDeps = {
    isSupported: () => true,
    getUserMedia: vi.fn(async () => mic),
    createPeerConnection: () => pc as unknown as RTCPeerConnection,
    playAudio: vi.fn(),
    createRecorder: vi.fn((_m, _r, cb) => {
      onChunk = cb;
      return recorder;
    }),
    ...overrides,
  };
  const cbs = {
    onState: vi.fn(),
    onTranscript: vi.fn(),
    onActivity: vi.fn(),
    onMuteChange: vi.fn(),
    onError: vi.fn(),
    onRecordingChunk: vi.fn(),
    onEnded: vi.fn(),
  };
  const call = new WebRTCCall(cbs, deps);
  const createSession = vi.fn(async () => ({ sdp: 'answer-sdp', greeting: 'Greet them' }));
  return { call, pc, deps, cbs, track, recorder, createSession, chunk: (b: Blob) => onChunk(b) };
}

async function startLive(s: ReturnType<typeof setup>) {
  await s.call.start({ language: 'en', createSession: s.createSession });
  s.pc.dc.message({ type: 'session.started' });
}

describe('WebRTCCall', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('requests the mic with echo/noise/gain processing and exchanges SDP', async () => {
    const s = setup();
    await s.call.start({ language: 'hi', createSession: s.createSession });
    expect(s.deps.getUserMedia).toHaveBeenCalledWith({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    expect(s.createSession).toHaveBeenCalledWith({ sdp: 'offer-sdp', language: 'hi' });
    expect(s.pc.remote).toEqual({ type: 'answer', sdp: 'answer-sdp' });
    expect(s.pc.tracks).toHaveLength(1);
    expect(s.call.getState()).toBe('waiting');
  });

  it('on session.started goes live, mutes the mic, sends the greeting, then opens the mic on Ruby speech', async () => {
    const s = setup();
    await startLive(s);
    expect(s.call.getState()).toBe('live');
    expect(s.pc.dc.sent).toContainEqual({ type: 'session.input_audio.mute' });
    expect(s.pc.dc.sent).toContainEqual({
      type: 'session.instructions.append',
      delegation_id: null,
      content: 'Greet them',
    });
    s.pc.dc.message({ type: 'session.output_transcript.delta', delta: 'Hi' });
    expect(s.pc.dc.sent).toContainEqual({ type: 'session.input_audio.unmute' });
  });

  it('parses transcript deltas into merged turns per speaker', async () => {
    const s = setup();
    await startLive(s);
    s.pc.dc.message({ type: 'session.output_transcript.delta', delta: 'Hello ', start_ms: 0, end_ms: 400 });
    s.pc.dc.message({ type: 'session.output_transcript.delta', delta: 'there', end_ms: 900 });
    s.pc.dc.message({ type: 'session.input_transcript.delta', delta: 'Hi Ruby', start_ms: 1000, end_ms: 1500 });
    expect(s.call.getTurns()).toEqual([
      { role: 'ruby', text: 'Hello there', start_ms: 0, end_ms: 900 },
      { role: 'client', text: 'Hi Ruby', start_ms: 1000, end_ms: 1500 },
    ]);
    expect(s.cbs.onActivity).toHaveBeenLastCalledWith('client');
  });

  it('ignores malformed data channel messages', async () => {
    const s = setup();
    await startLive(s);
    s.pc.dc.emit('message', { data: 'not json' });
    expect(s.call.getState()).toBe('live');
  });

  it('mute and unmute send the right events and toggle the mic track', async () => {
    const s = setup();
    await startLive(s);
    s.pc.dc.message({ type: 'session.output_transcript.delta', delta: 'Hi' });
    s.pc.dc.sent.length = 0;
    s.call.setMuted(true);
    expect(s.pc.dc.sent).toEqual([{ type: 'session.input_audio.mute' }]);
    expect(s.track.enabled).toBe(false);
    expect(s.cbs.onMuteChange).toHaveBeenLastCalledWith(true);
    s.call.setMuted(false);
    expect(s.pc.dc.sent.at(-1)).toEqual({ type: 'session.input_audio.unmute' });
    expect(s.track.enabled).toBe(true);
  });

  it('stays muted when Ruby starts speaking after the user muted', async () => {
    const s = setup();
    await startLive(s);
    s.call.setMuted(true);
    s.pc.dc.sent.length = 0;
    s.pc.dc.message({ type: 'session.output_transcript.delta', delta: 'Hi' });
    expect(s.pc.dc.sent).not.toContainEqual({ type: 'session.input_audio.unmute' });
  });

  it('records the remote+mic mix and forwards chunks', async () => {
    const s = setup();
    await startLive(s);
    s.pc.emit('track', { streams: [{} as MediaStream], track: {} });
    expect(s.deps.playAudio).toHaveBeenCalled();
    expect(s.recorder.start).toHaveBeenCalled();
    const blob = new Blob(['x']);
    s.chunk(blob);
    expect(s.cbs.onRecordingChunk).toHaveBeenCalledWith(blob);
  });

  it('end closes channel, connection, mic and recorder, and reports turns and recording', async () => {
    const s = setup();
    await startLive(s);
    s.pc.emit('track', { streams: [{} as MediaStream], track: {} });
    s.chunk(new Blob(['x']));
    s.pc.dc.message({ type: 'session.input_transcript.delta', delta: 'bye' });
    await s.call.end();
    expect(s.pc.dc.closed).toBe(true);
    expect(s.pc.closed).toBe(true);
    expect(s.track.stop).toHaveBeenCalled();
    expect(s.recorder.stop).toHaveBeenCalled();
    expect(s.call.getState()).toBe('ended');
    const result = s.cbs.onEnded.mock.calls[0][0] as CallEndResult;
    expect(result.reason).toBe('user');
    expect(result.turns).toHaveLength(1);
    expect(result.recording).toBeInstanceOf(Blob);
    // ending twice is a no-op
    await s.call.end();
    expect(s.cbs.onEnded).toHaveBeenCalledTimes(1);
  });

  it('ends when Ruby closes the session', async () => {
    const s = setup();
    await startLive(s);
    s.pc.dc.message({ type: 'session.closed' });
    await vi.advanceTimersByTimeAsync(0);
    expect((s.cbs.onEnded.mock.calls[0][0] as CallEndResult).reason).toBe('ruby_closed');
  });

  it('reports connection loss', async () => {
    const s = setup();
    await startLive(s);
    s.pc.connectionState = 'failed';
    s.pc.emit('connectionstatechange');
    await vi.advanceTimersByTimeAsync(0);
    expect(s.cbs.onError).toHaveBeenCalledWith('connection_lost');
    expect(s.pc.closed).toBe(true);
  });

  it.each([
    ['NotAllowedError', 'mic_denied'],
    ['SecurityError', 'mic_denied'],
    ['NotFoundError', 'mic_missing'],
  ])('maps %s from getUserMedia to %s', async (name, code) => {
    const s = setup({
      getUserMedia: vi.fn(async () => {
        throw Object.assign(new Error('x'), { name });
      }),
    });
    await s.call.start({ language: 'en', createSession: s.createSession });
    expect(s.cbs.onError).toHaveBeenCalledWith(code as CallErrorCode);
    expect(s.createSession).not.toHaveBeenCalled();
    expect(s.call.getState()).toBe('ended');
  });

  it('reports unsupported browsers', async () => {
    const s = setup({ isSupported: () => false });
    await s.call.start({ language: 'en', createSession: s.createSession });
    expect(s.cbs.onError).toHaveBeenCalledWith('unsupported');
  });

  it('reports start_failed and releases the mic when the server session fails', async () => {
    const s = setup();
    s.createSession.mockRejectedValueOnce(new Error('500'));
    await s.call.start({ language: 'en', createSession: s.createSession });
    expect(s.cbs.onError).toHaveBeenCalledWith('start_failed');
    expect(s.track.stop).toHaveBeenCalled();
    expect(s.pc.closed).toBe(true);
  });

  it('gives up when Ruby never starts the session', async () => {
    const s = setup();
    await s.call.start({ language: 'en', createSession: s.createSession });
    await vi.advanceTimersByTimeAsync(15000);
    expect(s.cbs.onError).toHaveBeenCalledWith('no_answer');
  });
});
