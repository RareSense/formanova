/**
 * Records a Ruby call (contract §5): the caller's microphone on the left channel,
 * Ruby's voice on the right, mixed in a fresh AudioContext per call. Two separate
 * channels at unity gain, so nothing is summed and nothing can clip; the context runs
 * at the device's own sample rate (no resampling). MediaRecorder cuts a part every
 * 5 s and each part is uploaded straight away, so a closed tab loses seconds, not the
 * call. At the end the full file (all parts in order, which is a valid file) goes up.
 *
 * Recording is best effort and must never break the call: every step is guarded.
 */

export const RECORDER_TIMESLICE_MS = 5000;
export const RECORDER_BITRATE = 64_000;
const LEVEL_POLL_MS = 250;
/** RMS above this (about -40 dBFS) counts as real audio, not line noise. */
const AUDIO_SEEN_RMS = 0.01;
const UPLOAD_TRIES = 3;
const STOP_WAIT_MS = 4000;
/** Browsers refuse keepalive bodies above 64 KB in total. */
const KEEPALIVE_BUDGET = 60_000;

export const MIME_PREFERENCE = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/webm'];

export interface UploadedAudio {
  sha256: string | null;
  bytes: number;
}

export class AudioUploadError extends Error {
  constructor(
    message: string,
    readonly retriable: boolean,
  ) {
    super(message);
  }
}

export type AudioUploader = (file: Blob, filename: string, opts?: { keepalive?: boolean }) => Promise<UploadedAudio>;

export interface RecordingPart {
  seq: number;
  sha256: string | null;
  bytes: number;
}

export interface RecordingSummary {
  mime: string;
  final_sha256: string | null;
  parts: RecordingPart[];
  duration_ms: number;
  audio_seen: boolean;
  failed_parts: number;
}

export interface RecorderDeps {
  createAudioContext(): AudioContext | null;
  createMediaRecorder(stream: MediaStream, opts: MediaRecorderOptions): MediaRecorder | null;
  isTypeSupported(type: string): boolean;
  sha256(blob: Blob): Promise<string | null>;
  now(): number;
  sleep(ms: number): Promise<void>;
}

async function blobSha256(blob: Blob): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

function defaultRecorderDeps(): RecorderDeps {
  return {
    createAudioContext: () => {
      const Ctor =
        typeof window === 'undefined'
          ? undefined
          : window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      return Ctor ? new Ctor() : null;
    },
    createMediaRecorder: (stream, opts) => (typeof MediaRecorder === 'undefined' ? null : new MediaRecorder(stream, opts)),
    isTypeSupported: (t) => typeof MediaRecorder !== 'undefined' && !!MediaRecorder.isTypeSupported?.(t),
    sha256: blobSha256,
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
}

export function extensionFor(mime: string): string {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

interface Part {
  seq: number;
  blob: Blob;
  sha256: string | null;
  uploaded: boolean;
  /** The server refused it (4xx): retrying will not help. */
  refused: boolean;
  /** A keepalive send is in flight. */
  sending: boolean;
}

export class CallRecorder {
  private deps: RecorderDeps;
  private ctx: AudioContext | null = null;
  private merger: ChannelMergerNode | null = null;
  private rec: MediaRecorder | null = null;
  private analysers: AnalyserNode[] = [];
  private remoteAnalyser: AnalyserNode | null = null;
  private levelTimer: ReturnType<typeof setInterval> | null = null;
  private parts: Part[] = [];
  private uploader: AudioUploader | null = null;
  private queue: Promise<void> = Promise.resolve();
  private mime = '';
  private startedAt: number | null = null;
  private stoppedAt: number | null = null;
  private audioSeen = false;
  private remoteAdded = false;
  private hiding = false;
  private pumpWaiting = false;
  private stopping: Promise<RecordingSummary> | null = null;

  constructor(deps: Partial<RecorderDeps> = {}) {
    this.deps = { ...defaultRecorderDeps(), ...deps };
  }

  /**
   * Creates the AudioContext. Call it synchronously from the click that starts the
   * call: browsers only let a context run when it is created during a user gesture.
   */
  prepare() {
    if (this.ctx) return;
    try {
      this.ctx = this.deps.createAudioContext();
      void this.ctx?.resume?.().catch(() => {});
    } catch {
      this.ctx = null;
    }
  }

  isRecording(): boolean {
    return !!this.rec;
  }

  /** Starts recording the microphone (left channel). */
  start(mic: MediaStream) {
    if (this.rec || this.stopping) return;
    try {
      this.prepare();
      const ctx = this.ctx;
      if (!ctx) return;
      const dest = ctx.createMediaStreamDestination();
      const merger = ctx.createChannelMerger(2);
      merger.connect(dest);
      this.merger = merger;
      this.connect(mic, 0);
      this.mime = MIME_PREFERENCE.find((t) => this.deps.isTypeSupported(t)) || '';
      let rec: MediaRecorder | null = null;
      try {
        rec = this.deps.createMediaRecorder(dest.stream, {
          ...(this.mime ? { mimeType: this.mime } : {}),
          audioBitsPerSecond: RECORDER_BITRATE,
        });
      } catch {
        // Some browsers reject the options; their defaults still record.
        rec = this.deps.createMediaRecorder(dest.stream, {});
      }
      if (!rec) return;
      this.mime = rec.mimeType || this.mime || 'audio/webm';
      rec.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size) this.addPart(e.data);
      };
      rec.start(RECORDER_TIMESLICE_MS);
      this.rec = rec;
      this.startedAt = this.deps.now();
      this.levelTimer = setInterval(() => this.checkLevels(), LEVEL_POLL_MS);
    } catch {
      this.rec = null;
    }
  }

  /** Adds Ruby's voice (right channel). */
  addRemote(remote: MediaStream) {
    if (this.remoteAdded || !this.merger) return;
    try {
      this.remoteAnalyser = this.connect(remote, 1);
      this.remoteAdded = true;
    } catch {
      /* the caller's side is still recorded */
    }
  }

  private connect(stream: MediaStream, channel: number): AnalyserNode | null {
    const ctx = this.ctx as AudioContext;
    const source = ctx.createMediaStreamSource(stream);
    source.connect(this.merger as ChannelMergerNode, 0, channel);
    try {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      this.analysers.push(analyser);
      return analyser;
    } catch {
      return null; /* silence detection is optional */
    }
  }

  private static rms(a: AnalyserNode): number {
    const buf = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / buf.length);
  }

  /** Ruby's current loudness (RMS, 0..1); 0 when unknown. */
  remoteLevel(): number {
    try {
      return this.remoteAnalyser && !this.stopping ? CallRecorder.rms(this.remoteAnalyser) : 0;
    } catch {
      return 0;
    }
  }

  private checkLevels() {
    const ctx = this.ctx;
    // A suspended or interrupted context records silence: wake it up.
    if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') void ctx.resume?.().catch(() => {});
    if (this.audioSeen) return;
    for (const a of this.analysers) {
      try {
        if (CallRecorder.rms(a) > AUDIO_SEEN_RMS) {
          this.audioSeen = true;
          return;
        }
      } catch {
        /* ignore */
      }
    }
  }

  /** Where parts go (known once the voice session has started). Queued parts go up now. */
  setUploader(uploader: AudioUploader | null) {
    this.uploader = uploader;
    this.pump();
  }

  private addPart(blob: Blob) {
    const part: Part = { seq: this.parts.length, blob, sha256: null, uploaded: false, refused: false, sending: false };
    this.parts.push(part);
    if (this.hiding) {
      void this.sendKeepalive();
      return;
    }
    this.pump();
  }

  /** Uploads every part not yet up, in order, one at a time. */
  private pump(): Promise<void> {
    // One waiting round is enough: it sees every part added before it starts.
    if (this.pumpWaiting) return this.queue;
    this.pumpWaiting = true;
    this.queue = this.queue
      .then(async () => {
        this.pumpWaiting = false;
        if (!this.uploader) return;
        for (const part of this.parts) {
          if (part.uploaded || part.refused || part.sending || this.hiding) continue;
          await this.uploadPart(part);
        }
      })
      .catch(() => {});
    return this.queue;
  }

  private async uploadPart(part: Part) {
    const uploader = this.uploader;
    if (!uploader) return;
    if (part.sha256 === null) part.sha256 = await this.deps.sha256(part.blob);
    const name = `part-${String(part.seq).padStart(4, '0')}.${extensionFor(this.mime)}`;
    const res = await this.withRetry(() => uploader(part.blob, name), () => (part.refused = true));
    if (res) {
      part.uploaded = true;
      part.sha256 = part.sha256 ?? res.sha256;
    }
  }

  private async withRetry(fn: () => Promise<UploadedAudio>, onRefused?: () => void): Promise<UploadedAudio | null> {
    for (let i = 0; i < UPLOAD_TRIES; i++) {
      try {
        return await fn();
      } catch (e) {
        if (e instanceof AudioUploadError && !e.retriable) {
          onRefused?.();
          return null;
        }
        if (i < UPLOAD_TRIES - 1) await this.deps.sleep(1000 * 2 ** i);
      }
    }
    return null;
  }

  /** Last chance when the tab is closing: ask for the newest audio, send small parts with keepalive. */
  pageHide() {
    if (this.hiding || !this.uploader) return;
    this.hiding = true;
    try {
      if (this.rec && this.rec.state === 'recording') this.rec.requestData();
    } catch {
      /* ignore */
    }
    void this.sendKeepalive();
  }

  /** The tab stayed open after all (pagehide fires on bfcache too). */
  pageShow() {
    if (!this.hiding) return;
    this.hiding = false;
    this.pump();
  }

  private async sendKeepalive() {
    const uploader = this.uploader;
    if (!uploader) return;
    let budget = KEEPALIVE_BUDGET;
    for (const part of this.parts) {
      if (part.uploaded || part.refused || part.sending || part.blob.size > budget) continue;
      budget -= part.blob.size;
      part.sending = true;
      const name = `part-${String(part.seq).padStart(4, '0')}.${extensionFor(this.mime)}`;
      try {
        await uploader(part.blob, name, { keepalive: true });
        part.uploaded = true;
      } catch {
        /* nothing more can be done while the tab closes */
      } finally {
        part.sending = false;
      }
    }
  }

  /**
   * Stops recording, sends the last part, retries failed parts, then uploads the
   * full file. Never throws; safe to call more than once.
   */
  stop(): Promise<RecordingSummary> {
    if (!this.stopping) this.stopping = this.doStop();
    return this.stopping;
  }

  private async doStop(): Promise<RecordingSummary> {
    if (this.levelTimer) clearInterval(this.levelTimer);
    this.levelTimer = null;
    this.checkLevels();
    const rec = this.rec;
    if (rec && rec.state !== 'inactive') {
      await new Promise<void>((done) => {
        const timer = setTimeout(done, STOP_WAIT_MS);
        rec.onstop = () => {
          clearTimeout(timer);
          // dataavailable for the last part fires before stop.
          done();
        };
        try {
          rec.stop();
        } catch {
          clearTimeout(timer);
          done();
        }
      });
    }
    this.stoppedAt = this.deps.now();
    this.hiding = false;
    try {
      void this.ctx?.close?.().catch(() => {});
    } catch {
      /* ignore */
    }
    await this.pump(); // the last part, and a second round for any part that failed
    let finalSha: string | null = null;
    if (this.parts.length && this.uploader) {
      const full = new Blob(
        this.parts.map((p) => p.blob),
        { type: this.mime || 'audio/webm' },
      );
      const uploader = this.uploader;
      const res = await this.withRetry(() => uploader(full, `call.${extensionFor(this.mime)}`));
      if (res) finalSha = (await this.deps.sha256(full)) ?? res.sha256;
    }
    return this.summary(finalSha);
  }

  /** What is known right now (used for an early save before the final upload). */
  summary(finalSha: string | null = null): RecordingSummary {
    const end = this.stoppedAt ?? this.deps.now();
    return {
      mime: this.mime || 'audio/webm',
      final_sha256: finalSha,
      parts: this.parts.filter((p) => p.uploaded).map((p) => ({ seq: p.seq, sha256: p.sha256, bytes: p.blob.size })),
      duration_ms: this.startedAt === null ? 0 : Math.max(0, end - this.startedAt),
      audio_seen: this.audioSeen,
      failed_parts: this.parts.filter((p) => !p.uploaded).length,
    };
  }

  hasAudio(): boolean {
    return this.parts.length > 0;
  }
}
