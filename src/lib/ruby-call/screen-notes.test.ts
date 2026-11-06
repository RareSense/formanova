import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScreenNotes } from './screen-notes';

describe('ScreenNotes', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const make = () => {
    const sent: string[] = [];
    const notes = new ScreenNotes({ send: (c) => sent.push(c), now: () => Date.now() });
    return { sent, notes };
  };

  it('prefixes notes with [Screen] and sends the first one straight away', () => {
    const { sent, notes } = make();
    notes.note('The client muted their microphone.');
    expect(sent).toEqual(['[Screen] The client muted their microphone.']);
  });

  it('sends at most one note per 2 s, keeping later notes for after the window', async () => {
    const { sent, notes } = make();
    notes.note('A');
    notes.note('B');
    expect(sent).toEqual(['[Screen] A']);
    await vi.advanceTimersByTimeAsync(1999);
    expect(sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toEqual(['[Screen] A', '[Screen] B']);
  });

  it('never sends the same note twice in a row', async () => {
    const { sent, notes } = make();
    notes.note('A');
    notes.note('A');
    await vi.advanceTimersByTimeAsync(5000);
    notes.note('A');
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent).toEqual(['[Screen] A']);
    notes.note('B');
    notes.note('A');
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent).toEqual(['[Screen] A', '[Screen] B', '[Screen] A']);
  });

  it('keeps only the newest few waiting notes and stops cleanly', async () => {
    const { sent, notes } = make();
    notes.note('1');
    ['2', '3', '4', '5'].forEach((n) => notes.note(n));
    await vi.advanceTimersByTimeAsync(20000);
    expect(sent).toEqual(['[Screen] 1', '[Screen] 3', '[Screen] 4', '[Screen] 5']);
    notes.note('6');
    notes.note('7');
    notes.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(sent.at(-1)).toBe('[Screen] 6');
  });

  it('survives a throwing sender', () => {
    const notes = new ScreenNotes({ send: () => { throw new Error('closed'); } });
    expect(() => notes.note('A')).not.toThrow();
  });
});
