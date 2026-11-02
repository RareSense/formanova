/**
 * Framework-free WebRTC call engine for Ruby (FormaNova's AI sales agent).
 * Ported from the working test-call.html / Nova app.js. Browser APIs are
 * injectable so it can be unit tested.
 */

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
  recording: Blob | null;
}

export interface RecorderHandle {
  start(): void;
  /** Resolves once all chunks have been delivered. */
  stop(): Promise<void>;
  mimeType?: string;
}

export interface CallDeps {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  createPeerConnection(): RTCPeerConnection;
  /** Plays the remote audio. */
  playAudio(stream: MediaStream): void;
  /** Mixes mic + remote into a recorder; may return null if unsupported. */
  createRecorder(mic: MediaStream, remote: MediaStream, onChunk: (chunk: Blob) => void): RecorderHandle | null;
  isSupported(): boolean;
}

export interface CallCallbacks {
  onState?(state: CallState): void;
  /** Full turn list, merged per speaker, after every transcript delta. */
  onTranscript?(turns: CallTurn[]): void;
  /** Fired on every transcript delta so the UI can show who is talking. */
  onActivity?(who: CallRole): void;
  onMuteChange?(muted: boolean): void;
  onError?(code: CallErrorCode): void;
  /** Recording chunks as they are produced (upload comes later). */
  onRecordingChunk?(chunk: Blob): void;
  onEnded?(result: CallEndResult): void;
}

export interface StartOptions {
  language: string;
  /** Exchanges the local SDP offer for the remote answer (server call). */
  createSession(args: { sdp: string; language: string }): Promise<SessionAnswer>;
}

const ICE_WAIT_MS = 4000;
const MIC_OPEN_FALLBACK_MS = 9000;
const GREETING_NUDGE_MS = 2000;
const NO_ANSWER_MS = 15000;

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
    createRecorder: (mic, remote, onChunk) => {
      if (typeof MediaRecorder === 'undefined' || typeof AudioContext === 'undefined') return null;
      try {
        const ctx = new AudioContext();
        const dest = ctx.createMediaStreamDestination();
        ctx.createMediaStreamSource(mic).connect(dest);
        ctx.createMediaStreamSource(remote).connect(dest);
        const rec = new MediaRecorder(dest.stream);
        rec.ondataavailable = (e) => {
          if (e.data && e.data.size) onChunk(e.data);
        };
        return {
          mimeType: rec.mimeType,
          start: () => rec.start(1000),
          stop: () =>
            new Promise<void>((done) => {
              if (rec.state === 'inactive') {
                ctx.close().catch(() => {});
                done();
                return;
              }
              rec.onstop = () => {
                ctx.close().catch(() => {});
                done();
              };
              rec.stop();
            }),
        };
      } catch {
        return null;
      }
    },
  };
}

export class WebRTCCall {
  private deps: CallDeps;
  private cb: CallCallbacks;
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private mic: MediaStream | null = null;
  private recorder: RecorderHandle | null = null;
  private chunks: Blob[] = [];
  private turns: CallTurn[] = [];
  private timers: ReturnType<typeof setTimeout>[] = [];
  private state: CallState = 'idle';
  private ready = false;
  private micOpen = false;
  private muted = false;
  private greeting: string | null = null;
  private finishing = false;

  constructor(callbacks: CallCallbacks = {}, deps: Partial<CallDeps> = {}) {
    this.cb = callbacks;
    this.deps = { ...defaultDeps(), ...deps };
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

  private setState(s: CallState) {
    this.state = s;
    this.cb.onState?.(s);
  }

  private later(fn: () => void, ms: number) {
    this.timers.push(setTimeout(fn, ms));
  }

  private send(obj: unknown) {
    if (this.dc && this.dc.readyState === 'open') this.dc.send(JSON.stringify(obj));
  }

  private fail(code: CallErrorCode, reason: CallEndReason = 'error') {
    if (this.finishing || this.state === 'ended') return;
    this.cb.onError?.(code);
    void this.finish(reason);
  }

  async start(opts: StartOptions): Promise<void> {
    if (this.state !== 'idle') return;
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

      const pc = this.deps.createPeerConnection();
      this.pc = pc;
      pc.addEventListener('track', (e: RTCTrackEvent) => {
        const stream = e.streams?.[0] ?? new MediaStream([e.track]);
        this.deps.playAudio(stream);
        this.startRecording(stream);
      });
      pc.addEventListener('connectionstatechange', () => {
        if (['failed', 'disconnected'].includes(pc.connectionState) && !this.finishing) {
          this.fail('connection_lost', 'connection_lost');
        }
      });
      for (const track of this.mic.getAudioTracks()) pc.addTrack(track, this.mic);

      const dc = pc.createDataChannel('oai-events');
      this.dc = dc;
      dc.addEventListener('message', (e: MessageEvent) => {
        try {
          this.onEvent(JSON.parse(e.data));
        } catch {
          /* ignore malformed event */
        }
      });
      dc.addEventListener('close', () => {
        if (!this.finishing) void this.finish('ruby_closed');
      });

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

  private startRecording(remote: MediaStream) {
    if (this.recorder || !this.mic) return;
    const rec = this.deps.createRecorder(this.mic, remote, (chunk) => {
      this.chunks.push(chunk);
      this.cb.onRecordingChunk?.(chunk);
    });
    if (!rec) return;
    this.recorder = rec;
    try {
      rec.start();
    } catch {
      this.recorder = null;
    }
  }

  private onEvent(ev: {
    type?: string;
    delta?: string;
    start_ms?: number;
    end_ms?: number;
    error?: unknown;
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
        break;
      case 'session.input_transcript.delta':
        this.addTurn('client', ev.delta, ev.start_ms, ev.end_ms);
        break;
      case 'session.output_transcript.delta':
        this.addTurn('ruby', ev.delta, ev.start_ms, ev.end_ms);
        this.openMic();
        break;
      case 'session.closed':
        void this.finish('ruby_closed');
        break;
      case 'error':
        if (!this.ready) this.fail('start_failed');
        break;
    }
  }

  private openMic() {
    if (this.micOpen || this.finishing) return;
    this.micOpen = true;
    if (!this.muted) this.send({ type: 'session.input_audio.unmute' });
  }

  private addTurn(role: CallRole, text?: string, start?: number, end?: number) {
    if (!text) return;
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
    this.mic?.getAudioTracks().forEach((t) => (t.enabled = !muted));
    // Never open the input before the greeting phase is over.
    if (muted) this.send({ type: 'session.input_audio.mute' });
    else if (this.micOpen) this.send({ type: 'session.input_audio.unmute' });
    this.cb.onMuteChange?.(muted);
  }

  toggleMute() {
    this.setMuted(!this.muted);
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
    if (this.recorder) {
      try {
        await this.recorder.stop();
      } catch {
        /* recording is best effort */
      }
    }
    const type = this.recorder?.mimeType || 'audio/webm';
    const recording = this.chunks.length ? new Blob(this.chunks, { type }) : null;
    this.recorder = null;
    this.setState('ended');
    this.cb.onEnded?.({ turns: this.getTurns(), reason, recording });
  }
}
