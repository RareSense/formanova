/**
 * Framework-free WebRTC call engine for Ruby (FormaNova's AI sales agent).
 * Ported from the working test-call.html / Nova app.js. Browser APIs are
 * injectable so it can be unit tested.
 *
 * Recording lives in call-recorder.ts; the engine only hands out the streams.
 * Tools asked for by Ruby's reasoning head run through delegation.ts.
 */
import { DelegationRunner, type ToolRunner } from './delegation';

export type CallRole = 'client' | 'ruby';
export type CallState = 'idle' | 'connecting' | 'waiting' | 'live' | 'ended';
export type CallEndReason = 'user' | 'ruby_closed' | 'connection_lost' | 'error';
export type CallErrorCode =
  | 'unsupported'
  | 'mic_denied'
  | 'mic_missing'
  | 'start_failed'
  | 'no_answer'
  | 'connection_lost';

export interface CallTurn {
  role: CallRole;
  text: string;
  start_ms: number | null;
  end_ms: number | null;
}

export interface SessionAnswer {
  sdp: string;
  greeting?: string | null;
}

export interface CallEndResult {
  turns: CallTurn[];
  reason: CallEndReason;
}

export interface CallDeps {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  createPeerConnection(): RTCPeerConnection;
  /** Plays the remote audio. */
  playAudio(stream: MediaStream): void;
  isSupported(): boolean;
  now(): number;
}

export interface CallCallbacks {
  onState?(state: CallState): void;
  /** Full turn list, merged per speaker, after every transcript delta. */
  onTranscript?(turns: CallTurn[]): void;
  /** Fired on every transcript delta so the UI can show who is talking. */
  onActivity?(who: CallRole): void;
  onMuteChange?(muted: boolean): void;
  onError?(code: CallErrorCode): void;
  /** The caller's microphone, once granted. */
  onLocalStream?(mic: MediaStream): void;
  /** Ruby's voice, once it arrives. */
  onRemoteStream?(remote: MediaStream): void;
  /** True while Ruby looks something up (a tool runs or her head is thinking). */
  onBusy?(busy: boolean): void;
  /** True while the connection drops out and may come back. */
  onReconnecting?(reconnecting: boolean): void;
  onEnded?(result: CallEndResult): void;
}

export interface StartOptions {
  language: string;
  /** Exchanges the local SDP offer for the remote answer (server call). */
  createSession(args: { sdp: string; language: string }): Promise<SessionAnswer>;
  /** Runs a tool Ruby's head asks for; unknown tools should return {error}. */
  runTool?: ToolRunner;
  /** Ruby's current loudness (0..1), used to hear when she has finished speaking. */
  rubyLevel?: () => number;
  /** Used when Ruby checks the caller is still there. */
  clientName?: string | null;
}

const ICE_WAIT_MS = 4000;
const MIC_OPEN_FALLBACK_MS = 9000;
const GREETING_NUDGE_MS = 2000;
const NO_ANSWER_MS = 15000;
/** A dropped connection gets this long to come back before the call ends. */
const RECONNECT_GRACE_MS = 5000;
/** Ruby counts as speaking above this loudness (same as Nova). */
const SPEAKING_LEVEL = 0.012;
const WATCH_MS = 1000;
export const DEAD_AIR_CUE_MS = 6500;
// Owner, 2026-11-06: never dead air (the caller thinks the call dropped), but never nag "are you still there?".
// A reassuring check-in after 12 s of quiet, at most twice per call.
export const DEAD_AIR_CHECK_IN_MS = 12000;
const MAX_CHECK_INS = 2;
// A lookup gets a short spoken update after 6 s and one more after 14 s, never more.
export const LOOKUP_CUE_MS = 6000;
export const LOOKUP_SECOND_CUE_MS = 14000;
const DEAD_AIR_MAX_CUES = 8;
// Owner, 2026-11-07: a caller who walked away and left the call open. After 40 s with no words from them Ruby
// asks if they are still there, then again every 20 s, 3 times in all; still nothing: a warm goodbye and she hangs up.
export const AWAY_FIRST_MS = 40000;
export const AWAY_REPEAT_MS = 20000;
const AWAY_MAX_ASKS = 3;
/** She is told to say goodbye; if she never does, the call still ends after this long. */
const AWAY_CLOSE_MAX_MS = 15000;
export const GOODBYE_QUIET_MS = 1500;
export const GOODBYE_MAX_MS = 8000;
const GOODBYE_MIN_MS = 1200;
const GOODBYE_TICK_MS = 150;

export const DEAD_AIR_CUE =
  'Note for this moment only: the line has been quiet for several seconds. If you were cut off, finish your point in one short sentence. If the caller said something you have not answered yet, answer it now. If you were waiting for their answer, continue naturally. Do not mention this note.';
export const DEAD_AIR_ANSWER =
  'Note for this moment only: the caller spoke last and is waiting for your answer. Answer what they just said now, briefly. Do not ask whether they are still there or ready. Do not mention this note.';
export const STILL_WORKING_CUE =
  'Note for this moment only: your lookup is still running and the line is quiet. Say one short, natural line so the caller knows you are working on it (for example "just getting that for you" or "almost there"), never the same words as before, then wait for the result. Never ask if they are still there. Do not give any numbers yet. Do not mention this note.';
export const deadAirCheckIn = (name?: string | null) =>
  `The line is still quiet. Say out loud, warmly and briefly, ${
    name ? `using their name (${name}), ` : ''
  }that you are right here and they can take their time (for example "Take your time, I'm right here"). Never ask "are you still there?" or "can you hear me?". Do not mention this note.`;

export const awayCheck = (name?: string | null) =>
  `Note for this moment only, and it replaces the rule about never asking this: the caller has not said anything for a long time and may have stepped away. Ask briefly and warmly if they are still there${
    name ? `, using their name (${name})` : ''
  }, in different words from any earlier time, then wait. Do not mention this note.`;
export const AWAY_GOODBYE =
  "Note for this moment only: the caller has not answered for a long time and seems to be away. In one or two short, warm sentences say it seems they have stepped away, that you will end the call now, and that they can call again any time. Then say goodbye and end the call. Do not mention this note.";

function defaultDeps(): CallDeps {
  return {
    isSupported: () =>
      typeof window !== 'undefined' &&
      window.isSecureContext &&
      !!navigator.mediaDevices?.getUserMedia &&
      !!window.RTCPeerConnection,
    getUserMedia: (c) => navigator.mediaDevices.getUserMedia(c),
    createPeerConnection: () => new RTCPeerConnection(),
    playAudio: (stream) => {
      const el = document.createElement('audio');
      el.autoplay = true;
      el.srcObject = stream;
      el.play().catch(() => {});
      // Keep a reference so it is not garbage collected mid-call.
      (window as unknown as { __rubyAudio?: HTMLAudioElement }).__rubyAudio = el;
    },
    now: () => Date.now(),
  };
}

export class WebRTCCall {
  private deps: CallDeps;
  private cb: CallCallbacks;
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private mic: MediaStream | null = null;
  private remoteSeen = false;
  private turns: CallTurn[] = [];
  private timers: ReturnType<typeof setTimeout>[] = [];
  private watchTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private state: CallState = 'idle';
  private ready = false;
  private micOpen = false;
  private muted = false;
  private greeting: string | null = null;
  private finishing = false;
  private ending = false;
  private runner: DelegationRunner;
  private rubyLevel: () => number = () => 0;
  private clientName: string | null = null;
  private lastHeard = 0;
  private lastRubyOut = 0;
  private deadAirStep = 0;
  private deadAirCount = 0;
  /** Lookup phase: one spoken "still on it" per lookup, so a slow tool never leaves the line silent. */
  private lookup: 'idle' | 'running' | 'cued' | 'cued2' = 'idle';
  /** Caller away: counted from their last words or action (or the end of a lookup). */
  private awayFrom = 0;
  private awayAsks = 0;
  private awayAskedAt = 0;
  private awayClosingAt = 0;

  constructor(callbacks: CallCallbacks = {}, deps: Partial<CallDeps> = {}) {
    this.cb = callbacks;
    this.deps = { ...defaultDeps(), ...deps };
    this.runner = this.makeRunner((name) => ({ error: `Unknown tool ${name}` }));
  }

  private makeRunner(runTool: ToolRunner): DelegationRunner {
    return new DelegationRunner({
      runTool,
      send: (o) => this.send(o),
      isActive: () => this.state === 'live' && !this.finishing,
      onBusyChange: (b) => this.cb.onBusy?.(b),
      now: () => this.deps.now(),
    });
  }

  getState(): CallState {
    return this.state;
  }
  isMuted(): boolean {
    return this.muted;
  }
  getTurns(): CallTurn[] {
    return this.turns.map((t) => ({ ...t }));
  }
  isEnding(): boolean {
    return this.ending;
  }

  private setState(s: CallState) {
    this.state = s;
    this.cb.onState?.(s);
  }

  private later(fn: () => void, ms: number) {
    this.timers.push(setTimeout(fn, ms));
  }

  private send(obj: unknown): boolean {
    if (this.dc && this.dc.readyState === 'open') {
      try {
        this.dc.send(JSON.stringify(obj));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  /** Adds an instruction for Ruby (greeting, screen notes, uploads). Ignored outside a live call. */
  appendInstruction(content: string): boolean {
    if (this.state !== 'live' || this.finishing) return false;
    return this.send({ type: 'session.instructions.append', delegation_id: null, content });
  }

  private fail(code: CallErrorCode, reason: CallEndReason = 'error') {
    if (this.finishing || this.state === 'ended') return;
    this.cb.onError?.(code);
    void this.finish(reason);
  }

  async start(opts: StartOptions): Promise<void> {
    if (this.state !== 'idle') return;
    if (opts.runTool) this.runner = this.makeRunner(opts.runTool);
    if (opts.rubyLevel) this.rubyLevel = opts.rubyLevel;
    this.clientName = opts.clientName ?? null;
    this.setState('connecting');
    try {
      if (!this.deps.isSupported()) {
        this.fail('unsupported');
        return;
      }
      try {
        this.mic = await this.deps.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch (e) {
        const name = (e as { name?: string })?.name;
        this.fail(name === 'NotAllowedError' || name === 'SecurityError' ? 'mic_denied' : 'mic_missing');
        return;
      }
      if (this.finishing) {
        this.mic.getTracks().forEach((t) => t.stop());
        return;
      }
      this.cb.onLocalStream?.(this.mic);

      const pc = this.deps.createPeerConnection();
      this.pc = pc;
      pc.addEventListener('track', (e: RTCTrackEvent) => {
        const stream = e.streams?.[0] ?? new MediaStream([e.track]);
        this.deps.playAudio(stream);
        if (!this.remoteSeen) {
          this.remoteSeen = true;
          this.cb.onRemoteStream?.(stream);
        }
      });
      pc.addEventListener('connectionstatechange', () => this.onConnectionState(pc.connectionState));
      for (const track of this.mic.getAudioTracks()) pc.addTrack(track, this.mic);

      const dc = pc.createDataChannel('oai-events');
      this.dc = dc;
      dc.addEventListener('message', (e: MessageEvent) => {
        let ev: unknown;
        try {
          ev = JSON.parse(e.data);
        } catch {
          return; /* ignore malformed event */
        }
        try {
          this.onEvent(ev as Parameters<WebRTCCall['onEvent']>[0]);
        } catch {
          /* one bad event must not break the call */
        }
      });
      // Without a session.closed first, a closed channel is a dropped line, not a goodbye.
      dc.addEventListener('close', () => this.fail('connection_lost', 'connection_lost'));

      await pc.setLocalDescription(await pc.createOffer());
      await this.iceDone(pc);
      if (this.finishing) return;

      const answer = await opts.createSession({
        sdp: pc.localDescription?.sdp ?? '',
        language: opts.language,
      });
      if (this.finishing) return;
      this.greeting = answer.greeting ?? null;
      await pc.setRemoteDescription({ type: 'answer', sdp: answer.sdp });
      this.setState('waiting');
      this.later(() => {
        if (!this.ready) this.fail('no_answer');
      }, NO_ANSWER_MS);
    } catch {
      this.fail('start_failed');
    }
  }

  private onConnectionState(s: RTCPeerConnectionState) {
    if (this.finishing) return;
    if (s === 'failed') {
      this.fail('connection_lost', 'connection_lost');
    } else if (s === 'disconnected') {
      // Often comes back by itself (wifi hiccup): give it a moment before ending.
      if (this.reconnectTimer) return;
      this.cb.onReconnecting?.(true);
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.fail('connection_lost', 'connection_lost');
      }, RECONNECT_GRACE_MS);
    } else if (s === 'connected' && this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      this.cb.onReconnecting?.(false);
    }
  }

  private iceDone(pc: RTCPeerConnection): Promise<void> {
    if (pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((ok) => {
      const done = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', done);
          ok();
        }
      };
      pc.addEventListener('icegatheringstatechange', done);
      this.later(ok, ICE_WAIT_MS);
    });
  }

  private onEvent(ev: {
    type?: string;
    delta?: string;
    start_ms?: number;
    end_ms?: number;
    error?: unknown;
    delegation?: { id?: string };
    delegation_id?: string | null;
    event?: Record<string, unknown>;
  }) {
    switch (ev.type) {
      case 'session.started':
        this.ready = true;
        this.setState('live');
        // Mic stays closed until Ruby has begun greeting, so room noise does not talk over her.
        this.send({ type: 'session.input_audio.mute' });
        if (this.greeting) {
          this.send({ type: 'session.instructions.append', delegation_id: null, content: this.greeting });
        }
        this.later(() => this.openMic(), MIC_OPEN_FALLBACK_MS);
        this.later(() => {
          if (!this.turns.length) {
            this.send({
              type: 'session.instructions.append',
              delegation_id: null,
              content: 'Start speaking now: greet the caller out loud straight away, then continue as instructed.',
            });
          }
        }, GREETING_NUDGE_MS);
        this.startWatch();
        break;
      case 'session.input_transcript.delta':
        this.addTurn('client', ev.delta, ev.start_ms, ev.end_ms);
        break;
      case 'session.output_transcript.delta':
        this.lastRubyOut = this.deps.now();
        this.addTurn('ruby', ev.delta, ev.start_ms, ev.end_ms);
        this.openMic();
        break;
      case 'session.delegation.created':
        this.runner.delegationCreated(ev.delegation?.id);
        break;
      case 'response.event':
        this.runner.handle(ev.delegation_id, (ev.event || {}) as Parameters<DelegationRunner['handle']>[1]);
        break;
      case 'session.closed':
        void this.finish('ruby_closed');
        break;
      case 'error':
        if (!this.ready) this.fail('start_failed');
        break;
    }
  }

  private checkIns = 0;

  private heard() {
    this.lastHeard = this.deps.now();
    this.deadAirStep = 0;
  }

  /** Dead air (Nova): a quiet cue after 6.5 s of silence, a spoken check-in after 11.5 s. */
  private startWatch() {
    if (this.watchTimer) return;
    this.heard();
    this.awayFrom = this.deps.now();
    this.watchTimer = setInterval(() => this.watch(), WATCH_MS);
  }

  private watch() {
    this.runner.tick();
    if (this.state !== 'live' || this.finishing || this.ending || this.muted) {
      this.heard();
      if (this.muted) this.awayFrom = this.deps.now(); // on mute by choice: not away
      return;
    }
    if (this.watchAway()) return;
    if (this.rubyLevel() > SPEAKING_LEVEL) {
      this.heard();
      return;
    }
    if (this.runner.isBusy()) {
      if (this.lookup === 'idle') {
        // The lookup just started: count its silence from now, not from the caller's last words.
        this.lookup = 'running';
        this.heard();
      } else if (this.lookup === 'running' && this.deps.now() - this.lastHeard > LOOKUP_CUE_MS) {
        this.lookup = 'cued';
        this.appendInstruction(STILL_WORKING_CUE);
        this.heard();
      } else if (this.lookup === 'cued' && this.deps.now() - this.lastHeard > LOOKUP_SECOND_CUE_MS - LOOKUP_CUE_MS) {
        this.lookup = 'cued2';
        this.appendInstruction(STILL_WORKING_CUE);
        this.heard();
      }
      return;
    }
    if (this.lookup !== 'idle') {
      // The lookup just finished: start the normal silence count from here.
      this.lookup = 'idle';
      this.heard();
      if (!this.awayAsks) this.awayFrom = this.deps.now();
      return;
    }
    const quiet = this.deps.now() - this.lastHeard;
    // When the caller spoke last, Ruby owes an answer: never ask if they are still there.
    const callerSpokeLast = this.turns[this.turns.length - 1]?.role === 'client';
    if (this.deadAirStep === 0 && quiet > DEAD_AIR_CUE_MS && this.deadAirCount < DEAD_AIR_MAX_CUES) {
      this.deadAirStep = 1;
      this.deadAirCount++;
      this.appendInstruction(callerSpokeLast ? DEAD_AIR_ANSWER : DEAD_AIR_CUE);
    } else if (this.deadAirStep === 1 && quiet > DEAD_AIR_CHECK_IN_MS && !callerSpokeLast && this.checkIns < MAX_CHECK_INS) {
      this.deadAirStep = 2;
      this.checkIns++;
      this.appendInstruction(deadAirCheckIn(this.clientName));
    }
  }

  /** The caller did something on screen (typed, uploaded, shared a link): they are there. */
  clientActive() {
    this.awayFrom = this.deps.now();
    this.awayAsks = 0;
    this.awayClosingAt = 0;
  }

  /** Caller away (owner, 2026-11-07). True while it owns the moment, so the normal quiet cues stay out of the way. */
  private watchAway(): boolean {
    const now = this.deps.now();
    if (this.awayClosingAt) {
      if (this.rubyLevel() > SPEAKING_LEVEL) {
        this.endAfterGoodbye(); // she is saying goodbye: hang up once she is done
      } else if (now - this.awayClosingAt > AWAY_CLOSE_MAX_MS) {
        void this.finish('ruby_closed');
      }
      return true;
    }
    if (this.runner.isBusy() || this.lookup !== 'idle') return false; // a lookup: they are waiting, not away
    const waited = this.awayAsks ? now - this.awayAskedAt : now - this.awayFrom;
    if (waited < (this.awayAsks ? AWAY_REPEAT_MS : AWAY_FIRST_MS)) return this.awayAsks > 0;
    if (this.rubyLevel() > SPEAKING_LEVEL) return true;
    if (this.awayAsks < AWAY_MAX_ASKS) {
      this.awayAsks++;
      this.awayAskedAt = now;
      this.appendInstruction(awayCheck(this.clientName));
    } else {
      this.awayClosingAt = now;
      this.appendInstruction(AWAY_GOODBYE);
    }
    this.heard();
    return true;
  }

  private openMic() {
    if (this.micOpen || this.finishing) return;
    this.micOpen = true;
    if (!this.muted) this.send({ type: 'session.input_audio.unmute' });
  }

  private addTurn(role: CallRole, text?: string, start?: number, end?: number) {
    if (!text) return;
    this.heard();
    if (role === 'client') this.clientActive();
    const last = this.turns[this.turns.length - 1];
    if (last && last.role === role) {
      last.text += text;
      last.end_ms = end ?? last.end_ms;
    } else {
      this.turns.push({ role, text, start_ms: start ?? null, end_ms: end ?? null });
    }
    this.cb.onActivity?.(role);
    this.cb.onTranscript?.(this.getTurns());
  }

  setMuted(muted: boolean) {
    if (this.state !== 'live' && this.state !== 'waiting') return;
    this.muted = muted;
    this.clientActive();
    this.mic?.getAudioTracks().forEach((t) => (t.enabled = !muted));
    // Never open the input before the greeting phase is over.
    if (muted) this.send({ type: 'session.input_audio.mute' });
    else if (this.micOpen) this.send({ type: 'session.input_audio.unmute' });
    this.cb.onMuteChange?.(muted);
  }

  toggleMute() {
    this.setMuted(!this.muted);
  }

  /**
   * Ruby said goodbye (end_call tool): hang up once she has been quiet for 1.5 s
   * after her last audio or words, and after 8 s at the latest.
   */
  endAfterGoodbye() {
    if (this.ending || this.finishing) return;
    this.ending = true;
    const t0 = this.deps.now();
    const tick = () => {
      if (this.finishing) return;
      const now = this.deps.now();
      if (this.rubyLevel() > SPEAKING_LEVEL) this.lastRubyOut = now;
      const quietFor = now - Math.max(this.lastRubyOut, t0 - GOODBYE_QUIET_MS);
      if ((quietFor >= GOODBYE_QUIET_MS && now - t0 >= GOODBYE_MIN_MS) || now - t0 >= GOODBYE_MAX_MS) {
        void this.finish('ruby_closed');
        return;
      }
      this.timers.push(setTimeout(tick, GOODBYE_TICK_MS));
    };
    tick();
  }

  /** Ends the call from the user's side. */
  end(): Promise<void> {
    return this.finish('user');
  }

  private async finish(reason: CallEndReason): Promise<void> {
    if (this.finishing) return;
    this.finishing = true;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    if (this.watchTimer) clearInterval(this.watchTimer);
    this.watchTimer = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.runner.reset();
    if (this.state === 'live' || this.state === 'waiting') this.send({ type: 'session.close' });
    try {
      this.dc?.close();
    } catch {
      /* already closed */
    }
    try {
      this.pc?.close();
    } catch {
      /* already closed */
    }
    this.mic?.getTracks().forEach((t) => t.stop());
    this.setState('ended');
    this.cb.onEnded?.({ turns: this.getTurns(), reason });
  }
}
