import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DEAD_AIR_ANSWER,
  DEAD_AIR_CUE,
  STILL_WORKING_CUE,
  WebRTCCall,
  deadAirCheckIn,
  type CallDeps,
  type CallEndResult,
  type CallErrorCode,
} from './webrtc-call';

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
  const deps: CallDeps = {
    isSupported: () => true,
    getUserMedia: vi.fn(async () => mic),
    createPeerConnection: () => pc as unknown as RTCPeerConnection,
    playAudio: vi.fn(),
    now: () => Date.now(),
    ...overrides,
  };
  const cbs = {
    onState: vi.fn(),
    onTranscript: vi.fn(),
    onActivity: vi.fn(),
    onMuteChange: vi.fn(),
    onError: vi.fn(),
    onLocalStream: vi.fn(),
    onRemoteStream: vi.fn(),
    onBusy: vi.fn(),
    onReconnecting: vi.fn(),
    onEnded: vi.fn(),
  };
  const call = new WebRTCCall(cbs, deps);
  const createSession = vi.fn(async () => ({ sdp: 'answer-sdp', greeting: 'Greet them' }));
  return { call, pc, deps, cbs, track, mic, createSession };
}

async function startLive(s: ReturnType<typeof setup>, extra: Record<string, unknown> = {}) {
  await s.call.start({ language: 'en', createSession: s.createSession, ...extra });
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

  it('hands out the mic and Ruby streams (once) for recording, and plays Ruby', async () => {
    const s = setup();
    await startLive(s);
    expect(s.cbs.onLocalStream).toHaveBeenCalledWith(s.mic);
    const remote = {} as MediaStream;
    s.pc.emit('track', { streams: [remote], track: {} });
    s.pc.emit('track', { streams: [remote], track: {} });
    expect(s.deps.playAudio).toHaveBeenCalled();
    expect(s.cbs.onRemoteStream).toHaveBeenCalledTimes(1);
    expect(s.cbs.onRemoteStream).toHaveBeenCalledWith(remote);
  });

  it('end closes the session, channel, connection and mic, and reports turns', async () => {
    const s = setup();
    await startLive(s);
    s.pc.dc.message({ type: 'session.input_transcript.delta', delta: 'bye' });
    await s.call.end();
    expect(s.pc.dc.sent).toContainEqual({ type: 'session.close' });
    expect(s.pc.dc.closed).toBe(true);
    expect(s.pc.closed).toBe(true);
    expect(s.track.stop).toHaveBeenCalled();
    expect(s.call.getState()).toBe('ended');
    const result = s.cbs.onEnded.mock.calls[0][0] as CallEndResult;
    expect(result.reason).toBe('user');
    expect(result.turns).toHaveLength(1);
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

  it('treats a data channel that closes without session.closed as a lost connection', async () => {
    const s = setup();
    await startLive(s);
    s.pc.dc.emit('close');
    await vi.advanceTimersByTimeAsync(0);
    expect(s.cbs.onError).toHaveBeenCalledWith('connection_lost');
    expect((s.cbs.onEnded.mock.calls[0][0] as CallEndResult).reason).toBe('connection_lost');
  });

  it('gives a disconnected line 5 s to come back before ending', async () => {
    const s = setup();
    await startLive(s);
    s.pc.connectionState = 'disconnected';
    s.pc.emit('connectionstatechange');
    expect(s.cbs.onReconnecting).toHaveBeenLastCalledWith(true);
    await vi.advanceTimersByTimeAsync(3000);
    s.pc.connectionState = 'connected';
    s.pc.emit('connectionstatechange');
    expect(s.cbs.onReconnecting).toHaveBeenLastCalledWith(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(s.cbs.onError).not.toHaveBeenCalled();
    s.pc.connectionState = 'disconnected';
    s.pc.emit('connectionstatechange');
    await vi.advanceTimersByTimeAsync(5000);
    expect(s.cbs.onError).toHaveBeenCalledWith('connection_lost');
  });

  it('runs delegated tools and sends the outputs back', async () => {
    const s = setup();
    const runTool = vi.fn(async () => ({ shown: true }));
    await startLive(s, { runTool });
    s.pc.dc.message({ type: 'session.delegation.created', delegation: { id: 'd1' } });
    expect(s.cbs.onBusy).toHaveBeenLastCalledWith(true);
    s.pc.dc.message({
      type: 'response.event',
      delegation_id: 'd1',
      event: { type: 'response.output_item.done', item: { type: 'function_call', call_id: 'c1', name: 'show_on_screen', arguments: '{"kind":"list"}' } },
    });
    s.pc.dc.message({ type: 'response.event', delegation_id: 'd1', event: { type: 'response.completed' } });
    await vi.advanceTimersByTimeAsync(0);
    expect(runTool).toHaveBeenCalledWith('show_on_screen', { kind: 'list' });
    expect(s.pc.dc.sent).toContainEqual({
      type: 'response.item.create',
      item: { type: 'function_call_output', call_id: 'c1', output: '{"shown":true}' },
    });
    expect(s.pc.dc.sent.at(-1)).toEqual({ type: 'response.create' });
  });

  it('answers unknown tools with an error when no runner is given', async () => {
    const s = setup();
    await startLive(s);
    s.pc.dc.message({
      type: 'response.event',
      delegation_id: 'd1',
      event: { type: 'response.output_item.done', item: { type: 'function_call', call_id: 'c1', name: 'nope' } },
    });
    s.pc.dc.message({ type: 'response.event', delegation_id: 'd1', event: { type: 'response.done' } });
    await vi.advanceTimersByTimeAsync(0);
    const out = s.pc.dc.sent.find((m) => m.type === 'response.item.create') as { item: { output: string } };
    expect(JSON.parse(out.item.output)).toHaveProperty('error');
  });

  it('appends instructions only during a live call', async () => {
    const s = setup();
    expect(s.call.appendInstruction('x')).toBe(false);
    await startLive(s);
    expect(s.call.appendInstruction('[Screen] hi')).toBe(true);
    expect(s.pc.dc.sent).toContainEqual({ type: 'session.instructions.append', delegation_id: null, content: '[Screen] hi' });
  });

  describe('dead air', () => {
    const cues = (s: ReturnType<typeof setup>) =>
      s.pc.dc.sent
        .filter(
          (m) =>
            m.content === DEAD_AIR_CUE ||
            m.content === DEAD_AIR_ANSWER ||
            m.content === deadAirCheckIn('Asha') ||
            m.content === STILL_WORKING_CUE,
        )
        .map((m) => m.content);

    it('when the caller spoke last, asks Ruby to answer and never checks in', async () => {
      const s = setup();
      await startLive(s, { clientName: 'Asha' });
      s.pc.dc.message({ type: 'session.output_transcript.delta', delta: 'What do you sell?' });
      s.pc.dc.message({ type: 'session.input_transcript.delta', delta: 'Rings. What is a deposit?' });
      await vi.advanceTimersByTimeAsync(7000);
      expect(cues(s)).toEqual([DEAD_AIR_ANSWER]);
      await vi.advanceTimersByTimeAsync(10000);
      expect(cues(s)).toEqual([DEAD_AIR_ANSWER]);
    });

    it('never leaves dead air: cue at 6.5 s, a reassuring check-in at 12 s, at most twice per call', async () => {
      const s = setup();
      await startLive(s, { clientName: 'Asha' });
      s.pc.dc.message({ type: 'session.output_transcript.delta', delta: 'Hi' });
      await vi.advanceTimersByTimeAsync(6000);
      expect(cues(s)).toEqual([]);
      await vi.advanceTimersByTimeAsync(1000);
      expect(cues(s)).toEqual([DEAD_AIR_CUE]);
      await vi.advanceTimersByTimeAsync(6000); // 13 s
      expect(cues(s)).toEqual([DEAD_AIR_CUE, deadAirCheckIn('Asha')]);
      expect(deadAirCheckIn('Asha')).toContain('Asha');
      for (let i = 0; i < 3; i++) {
        s.pc.dc.message({ type: 'session.output_transcript.delta', delta: 'Take your time.' });
        await vi.advanceTimersByTimeAsync(14000);
      }
      expect(cues(s).filter((c) => c === deadAirCheckIn('Asha'))).toHaveLength(2);
    });

    it('never tells Ruby to ask "are you still there?"', () => {
      for (const note of [deadAirCheckIn('Asha'), STILL_WORKING_CUE]) {
        expect(note).toContain('Never ask');
        expect(note.toLowerCase()).not.toMatch(/ask if they can hear you|ask whether they are still/);
      }
    });

    it('resets on any words; during a slow tool Ruby says once that she is still on it', async () => {
      const s = setup();
      let release: () => void = () => {};
      const runTool = vi.fn(() => new Promise<Record<string, unknown>>((r) => (release = () => r({}))));
      await startLive(s, { runTool, clientName: 'Asha' });
      await vi.advanceTimersByTimeAsync(5000);
      s.pc.dc.message({ type: 'session.input_transcript.delta', delta: 'so' });
      await vi.advanceTimersByTimeAsync(5000);
      expect(cues(s)).toEqual([]);
      s.pc.dc.message({
        type: 'response.event',
        delegation_id: 'd1',
        event: { type: 'response.output_item.done', item: { type: 'function_call', call_id: 'c1', name: 'quote_shoot' } },
      });
      await vi.advanceTimersByTimeAsync(6000);
      expect(cues(s)).toEqual([]);
      await vi.advanceTimersByTimeAsync(2500);
      expect(cues(s)).toEqual([STILL_WORKING_CUE]); // about 6 s into the lookup (checked once a second): a short spoken update, no dead air
      await vi.advanceTimersByTimeAsync(9000);
      expect(cues(s)).toEqual([STILL_WORKING_CUE, STILL_WORKING_CUE]); // about 14 s: one more, never a stream
      await vi.advanceTimersByTimeAsync(20000);
      expect(cues(s)).toEqual([STILL_WORKING_CUE, STILL_WORKING_CUE]);
      release();
      s.pc.dc.message({ type: 'response.event', delegation_id: 'd1', event: { type: 'response.completed' } });
      await vi.advanceTimersByTimeAsync(5000);
      expect(cues(s)).toEqual([STILL_WORKING_CUE, STILL_WORKING_CUE]); // silence counts from the end of the lookup
      await vi.advanceTimersByTimeAsync(3500);
      expect(cues(s)).toEqual([STILL_WORKING_CUE, STILL_WORKING_CUE, DEAD_AIR_ANSWER]); // the caller spoke last: Ruby owes an answer
    });

    it('stays quiet while Ruby is audibly speaking', async () => {
      const s = setup();
      await startLive(s, { rubyLevel: () => 0.2 });
      await vi.advanceTimersByTimeAsync(20000);
      expect(cues(s)).toEqual([]);
    });

    it('never fires after end_call', async () => {
      const s = setup();
      await startLive(s, { rubyLevel: () => 0.2 });
      s.call.endAfterGoodbye();
      await vi.advanceTimersByTimeAsync(7000);
      expect(cues(s)).toEqual([]);
    });
  });

  describe('end_call', () => {
    it('hangs up 1.5 s after Ruby stops speaking', async () => {
      const s = setup();
      let level = 0.2;
      await startLive(s, { rubyLevel: () => level });
      s.call.endAfterGoodbye();
      await vi.advanceTimersByTimeAsync(3000);
      expect(s.cbs.onEnded).not.toHaveBeenCalled();
      level = 0;
      await vi.advanceTimersByTimeAsync(1300);
      expect(s.cbs.onEnded).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(400);
      expect((s.cbs.onEnded.mock.calls[0][0] as CallEndResult).reason).toBe('ruby_closed');
    });

    it('waits for her last words too, and hangs up after 8 s at the latest', async () => {
      const s = setup();
      await startLive(s, { rubyLevel: () => 0.5 });
      s.call.endAfterGoodbye();
      await vi.advanceTimersByTimeAsync(7800);
      expect(s.cbs.onEnded).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(300);
      expect(s.cbs.onEnded).toHaveBeenCalledTimes(1);
    });

    it('hangs up quickly when Ruby is already silent', async () => {
      const s = setup();
      await startLive(s);
      s.call.endAfterGoodbye();
      await vi.advanceTimersByTimeAsync(1400);
      expect(s.cbs.onEnded).toHaveBeenCalledTimes(1);
    });
  });
});
