/**
 * "[Screen] ..." notes that keep Ruby aware of what the caller does on the page
 * (contract §3). At most one note per window, never the same note twice in a row.
 * A note that arrives inside the window waits (only the newest few are kept) and
 * goes out when the window has passed, so a closed panel is never lost.
 */

export const SCREEN_NOTE_WINDOW_MS = 2000;
const MAX_WAITING = 3;

export interface ScreenNoteOptions {
  send(content: string): void;
  now?: () => number;
  windowMs?: number;
}

export class ScreenNotes {
  private sendFn: (content: string) => void;
  private now: () => number;
  private windowMs: number;
  private lastSentAt = -Infinity;
  private lastNote: string | null = null;
  private waiting: string[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(opts: ScreenNoteOptions) {
    this.sendFn = opts.send;
    this.now = opts.now ?? (() => Date.now());
    this.windowMs = opts.windowMs ?? SCREEN_NOTE_WINDOW_MS;
  }

  /** `text` without the prefix, e.g. "The client closed the Quote panel." */
  note(text: string) {
    if (this.stopped) return;
    const content = `[Screen] ${text.trim()}`;
    const lastQueued = this.waiting[this.waiting.length - 1] ?? this.lastNote;
    if (content === lastQueued) return;
    this.waiting.push(content);
    if (this.waiting.length > MAX_WAITING) this.waiting.shift();
    this.pump();
  }

  private pump() {
    if (this.timer || this.stopped || !this.waiting.length) return;
    const wait = this.lastSentAt + this.windowMs - this.now();
    if (wait > 0) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.pump();
      }, wait);
      return;
    }
    const next = this.waiting.shift() as string;
    if (next !== this.lastNote) {
      this.lastNote = next;
      this.lastSentAt = this.now();
      try {
        this.sendFn(next);
      } catch {
        /* a note must never break the call */
      }
    }
    this.pump();
  }

  stop() {
    this.stopped = true;
    this.waiting = [];
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
