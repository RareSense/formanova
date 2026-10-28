/**
 * Server timestamps that carry no zone are UTC: the backend stores naive UTC times
 * (e.g. supervised runs' created_at, "2026-10-28T13:00:20.839"). `new Date()` would read
 * those as the viewer's local time and shift every shown time by the viewer's UTC offset.
 * Parse them as UTC here; formatting with `Intl.DateTimeFormat(undefined, ...)` then shows
 * them in each viewer's own time zone.
 */
const HAS_ZONE = /(?:[Zz]|[+-]\d{2}(?::?\d{2})?)$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** The ISO string with an explicit UTC zone when it had none ("2026-10-28 13:00" -> "2026-10-28T13:00Z"). */
export function normalizeServerTime(value: string): string {
  const text = value.trim();
  if (!text || DATE_ONLY.test(text) || HAS_ZONE.test(text)) return text;
  return `${text.replace(' ', 'T')}Z`;
}

/** The instant a server timestamp names (zone-less values read as UTC). Invalid input gives an invalid Date. */
export function parseServerTime(value: string): Date {
  return new Date(normalizeServerTime(value));
}
