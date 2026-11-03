import { describe, it, expect, vi } from 'vitest';
import { AudioUploadError, CallRecorder, RECORDER_BITRATE, RECORDER_TIMESLICE_MS, type AudioUploader } from './call-recorder';

class FakeNode {
  connections: unknown[][] = [];
  connect(...args: unknown[]) {
    this.connections.push(args);
  }
}
class FakeAnalyser extends FakeNode {
  fftSize = 8;
  level = 0;
  getFloatTimeDomainData(buf: Float32Array) {
    buf.fill(this.level);
  }
}
class FakeCtx {
  state = 'running';
  closed = false;
  analysers: FakeAnalyser[] = [];
  merger = new FakeNode();
  sources: FakeNode[] = [];
  resume = vi.fn(async () => {});
  createMediaStreamDestination() {
    return { stream: { id: 'mix' } };
  }
  createChannelMerger() {
    return this.merger;
  }
  createMediaStreamSource() {
    const s = new FakeNode();
    this.sources.push(s);
    return s;
  }
  createAnalyser() {
    const a = new FakeAnalyser();
    this.analysers.push(a);
    return a;
  }
  async close() {
    this.closed = true;
    this.state = 'closed';
  }
}
class FakeRec {
  state = 'inactive';
  mimeType: string;
  opts: MediaRecorderOptions;
  timeslice = 0;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(opts: MediaRecorderOptions) {
    this.opts = opts;
    this.mimeType = opts.mimeType || '';
  }
  start(ts: number) {
    this.state = 'recording';
    this.timeslice = ts;
  }
  emit(text: string) {
    this.ondataavailable?.({ data: new Blob([text]) });
  }
  requestData = vi.fn(() => this.emit('tail'));
  stop() {
    this.emit('last');
    this.state = 'inactive';
    this.onstop?.();
  }
}

function setup(opts: { supported?: string[]; uploader?: AudioUploader } = {}) {
  const ctx = new FakeCtx();
  let rec: FakeRec | null = null;
  let t = 1000;
  const recorder = new CallRecorder({
    createAudioContext: () => ctx as unknown as AudioContext,
    createMediaRecorder: (_s, o) => (rec = new FakeRec(o)) as unknown as MediaRecorder,
    isTypeSupported: (type) => (opts.supported ?? ['audio/webm;codecs=opus']).includes(type),
    sha256: async (b) => `sha-${b.size}`,
    now: () => t,
    sleep: async () => {},
  });
  const uploads: { name: string; size: number; keepalive?: boolean }[] = [];
  const uploader: AudioUploader =
    opts.uploader ??
    (async (file, name, o) => {
      uploads.push({ name, size: file.size, keepalive: o?.keepalive });
      return { sha256: 'server', bytes: file.size };
    });
  return { recorder, ctx, rec: () => rec as FakeRec, uploads, uploader, tick: (ms: number) => (t += ms) };
}

const stream = (id: string) => ({ id }) as unknown as MediaStream;
const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

describe('CallRecorder', () => {
  it('mixes mic left and Ruby right in one fresh context, opus at 64 kbps in 5 s parts', () => {
    const s = setup();
    s.recorder.prepare();
    s.recorder.start(stream('mic'));
    s.recorder.addRemote(stream('remote'));
    expect(s.rec().opts).toEqual({ mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: RECORDER_BITRATE });
    expect(s.rec().timeslice).toBe(RECORDER_TIMESLICE_MS);
    expect(s.ctx.sources[0].connections[0]).toEqual([s.ctx.merger, 0, 0]);
    expect(s.ctx.sources[1].connections[0]).toEqual([s.ctx.merger, 0, 1]);
    expect(s.ctx.resume).toHaveBeenCalled();
  });

  it('falls back to audio/mp4 on Safari', () => {
    const s = setup({ supported: ['audio/mp4'] });
    s.recorder.start(stream('mic'));
    expect(s.rec().opts.mimeType).toBe('audio/mp4');
  });

  it('queues parts until the session id is known, then uploads them in order; final file at the end', async () => {
    const s = setup();
    s.recorder.start(stream('mic'));
    s.rec().emit('aaaa');
    s.rec().emit('bb');
    await flush();
    expect(s.uploads).toEqual([]);
    s.recorder.setUploader(s.uploader);
    await flush();
    expect(s.uploads.map((u) => u.name)).toEqual(['part-0000.webm', 'part-0001.webm']);
    s.tick(9000);
    const summary = await s.recorder.stop();
    expect(s.uploads.map((u) => u.name)).toEqual(['part-0000.webm', 'part-0001.webm', 'part-0002.webm', 'call.webm']);
    expect(s.uploads.at(-1)?.size).toBe(4 + 2 + 4);
    expect(summary).toEqual({
      mime: 'audio/webm;codecs=opus',
      final_sha256: 'sha-10',
      parts: [
        { seq: 0, sha256: 'sha-4', bytes: 4 },
        { seq: 1, sha256: 'sha-2', bytes: 2 },
        { seq: 2, sha256: 'sha-4', bytes: 4 },
      ],
      duration_ms: 9000,
      audio_seen: false,
      failed_parts: 0,
    });
    expect(s.ctx.closed).toBe(true);
    expect(await s.recorder.stop()).toBe(summary);
  });

  it('retries a failing part three times, then again with the next part', async () => {
    const calls: string[] = [];
    let failPart0 = true;
    const uploader: AudioUploader = async (file, name) => {
      calls.push(name);
      if (name === 'part-0000.webm' && failPart0) throw new Error('network');
      return { sha256: null, bytes: file.size };
    };
    const s = setup({ uploader });
    s.recorder.start(stream('mic'));
    s.recorder.setUploader(uploader);
    s.rec().emit('a');
    await flush();
    expect(calls.filter((c) => c === 'part-0000.webm')).toHaveLength(3);
    failPart0 = false;
    s.rec().emit('b');
    const summary = await s.recorder.stop();
    expect(summary.failed_parts).toBe(0);
    expect(summary.parts.map((p) => p.seq)).toEqual([0, 1, 2]);
  });

  it('does not retry a refused upload and reports the failed parts', async () => {
    let n = 0;
    const uploader: AudioUploader = async () => {
      n++;
      throw new AudioUploadError('too big', false);
    };
    const s = setup({ uploader });
    s.recorder.start(stream('mic'));
    s.recorder.setUploader(uploader);
    s.rec().emit('a');
    const summary = await s.recorder.stop();
    expect(summary.failed_parts).toBe(2);
    expect(summary.final_sha256).toBeNull();
    expect(n).toBe(3); // each part once, the full file once
  });

  it('marks audio_seen once real audio passes the threshold', () => {
    vi.useFakeTimers();
    try {
      const s = setup();
      s.recorder.start(stream('mic'));
      s.ctx.analysers[0].level = 0.001;
      vi.advanceTimersByTime(300);
      expect(s.recorder.summary().audio_seen).toBe(false);
      s.ctx.analysers[0].level = 0.2;
      vi.advanceTimersByTime(300);
      expect(s.recorder.summary().audio_seen).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('wakes a suspended context while recording', () => {
    vi.useFakeTimers();
    try {
      const s = setup();
      s.recorder.start(stream('mic'));
      s.ctx.resume.mockClear();
      s.ctx.state = 'suspended';
      vi.advanceTimersByTime(300);
      expect(s.ctx.resume).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('on pagehide asks for the newest audio and sends unsent parts with keepalive', async () => {
    const failing: AudioUploader = async () => {
      throw new Error('offline');
    };
    const s = setup();
    s.recorder.start(stream('mic'));
    s.recorder.setUploader(failing);
    s.rec().emit('x');
    await flush();
    s.recorder.setUploader(s.uploader);
    s.recorder.pageHide();
    await flush();
    expect(s.rec().requestData).toHaveBeenCalled();
    expect(s.uploads.filter((u) => u.keepalive).map((u) => u.name)).toEqual(['part-0000.webm', 'part-0001.webm']);
  });

  it('never throws when the browser cannot record', async () => {
    const recorder = new CallRecorder({ createAudioContext: () => null });
    expect(() => recorder.start(stream('mic'))).not.toThrow();
    const summary = await recorder.stop();
    expect(summary).toMatchObject({ parts: [], final_sha256: null, failed_parts: 0, audio_seen: false });
    const broken = new CallRecorder({
      createAudioContext: () => {
        throw new Error('no audio');
      },
    });
    expect(() => broken.start(stream('mic'))).not.toThrow();
  });
});
