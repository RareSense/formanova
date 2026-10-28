import { describe, expect, it } from 'vitest';
import { normalizeServerTime, parseServerTime } from './server-time';

describe('server times are read as UTC when they carry no zone', () => {
  it('reads a naive ISO time as UTC, not as the viewer local time', () => {
    expect(parseServerTime('2026-10-28T13:00:20.839').toISOString()).toBe('2026-10-28T13:00:20.839Z');
    expect(parseServerTime('2026-10-28 13:00:20').toISOString()).toBe('2026-10-28T13:00:20.000Z');
  });

  it('keeps an explicit zone as sent', () => {
    expect(parseServerTime('2026-10-28T13:00:20Z').toISOString()).toBe('2026-10-28T13:00:20.000Z');
    expect(parseServerTime('2026-10-28T18:00:20+05:00').toISOString()).toBe('2026-10-28T13:00:20.000Z');
    expect(parseServerTime('2026-10-28T08:00:20-0500').toISOString()).toBe('2026-10-28T13:00:20.000Z');
    expect(normalizeServerTime('2026-10-28T13:00:20+00')).toBe('2026-10-28T13:00:20+00');
  });

  it('leaves date-only and empty values alone, and bad input stays invalid', () => {
    expect(normalizeServerTime('2026-10-28')).toBe('2026-10-28');
    expect(normalizeServerTime('  ')).toBe('');
    expect(Number.isNaN(parseServerTime('not a date').getTime())).toBe(true);
  });
});
