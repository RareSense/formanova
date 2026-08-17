import { authenticatedFetch } from '@/lib/authenticated-fetch';

interface NotificationEmailProfileResponse {
  notification_email?: unknown;
}

const NOTIFICATION_EMAIL_ERROR = 'Could not update the notification email. Please try again.';

function normalizeNotificationEmail(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function isValidNotificationEmail(value: string): boolean {
  const email = value.trim();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function responseError(response: Response, fallbackMessage: string): Promise<Error> {
  const payload = await response.json().catch(() => null);
  const detail = payload?.detail;
  if (typeof detail === 'string' && detail.trim()) return new Error(detail);
  return new Error(fallbackMessage);
}

/** Reads only the profile field used for long-running generation delivery. */
export async function fetchNotificationEmail(signal?: AbortSignal): Promise<string | null> {
  const response = await authenticatedFetch('/api/user/profile', { signal });
  if (!response.ok) throw await responseError(response, 'Could not load the saved notification email.');

  const profile = await response.json() as NotificationEmailProfileResponse;
  return normalizeNotificationEmail(profile.notification_email);
}

/** Persists the account-level delivery address for future generation notifications. */
export async function patchNotificationEmail(email: string): Promise<string> {
  const normalizedEmail = email.trim();
  if (!isValidNotificationEmail(normalizedEmail)) {
    throw new Error('Enter a valid email address.');
  }

  const response = await authenticatedFetch('/api/user/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notification_email: normalizedEmail }),
  });
  if (!response.ok) throw await responseError(response, NOTIFICATION_EMAIL_ERROR);
  return normalizedEmail;
}
