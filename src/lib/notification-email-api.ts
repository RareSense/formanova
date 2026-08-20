import { authenticatedFetch } from '@/lib/authenticated-fetch';

interface NotificationProfileResponse {
  notification_email?: unknown;
  effective_notification_email?: unknown;
  email_enabled?: unknown;
}

/** The delivery settings for long-running generation results. */
export interface NotificationSettings {
  /**
   * The raw stored override, or null when the user has never set one. Drives
   * whether the address input renders empty or pre-filled; do not use
   * effectiveEmail for that, since it is never null.
   */
  notificationEmail: string | null;
  /**
   * Where results actually go right now: the override if set, else the account
   * email. Null only on a profile that predates these fields, in which case the
   * caller supplies the account email itself.
   */
  effectiveEmail: string | null;
  /** Transactional result/status mail only, never a marketing unsubscribe. */
  emailEnabled: boolean;
}

export interface NotificationSettingsPatch {
  /** A string sets the override; explicit null clears it back to the account email. */
  notificationEmail?: string | null;
  emailEnabled?: boolean;
}

const NOTIFICATION_EMAIL_ERROR = 'Could not update the notification settings. Please try again.';

function normalizeEmail(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function isValidNotificationEmail(value: string): boolean {
  const email = value.trim();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Pulls a readable message out of either a plain detail or a FastAPI field-validation list. */
function detailMessage(detail: unknown): string | null {
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  if (Array.isArray(detail)) {
    const messages = detail
      .map(entry => (entry && typeof entry === 'object' ? (entry as { msg?: unknown }).msg : null))
      .filter((msg): msg is string => typeof msg === 'string' && msg.trim().length > 0);
    if (messages.length) return messages.join(' ');
  }
  return null;
}

async function responseError(response: Response, fallbackMessage: string): Promise<Error> {
  const payload = await response.json().catch(() => null);
  return new Error(detailMessage(payload?.detail) ?? fallbackMessage);
}

/** Reads the profile fields that govern where a finished generation is emailed. */
export async function fetchNotificationSettings(signal?: AbortSignal): Promise<NotificationSettings> {
  const response = await authenticatedFetch('/api/user/profile', { signal });
  if (!response.ok) throw await responseError(response, 'Could not load the saved notification settings.');

  const profile = await response.json() as NotificationProfileResponse;
  const notificationEmail = normalizeEmail(profile.notification_email);

  return {
    notificationEmail,
    // These three fields ship to production separately from this UI. On an
    // older profile the effective address degrades to the override, and the
    // toggle to on, so nobody reads as "notifications off" by accident.
    effectiveEmail: normalizeEmail(profile.effective_notification_email) ?? notificationEmail,
    emailEnabled: typeof profile.email_enabled === 'boolean' ? profile.email_enabled : true,
  };
}

/**
 * Persists whichever settings the caller passed, omitting the rest.
 *
 * The two fields are asymmetric server-side: notification_email accepts an
 * explicit null to clear the override, while email_enabled is NOT NULL and
 * returns 422 on null. So the toggle key is only ever written with a real
 * boolean, never nulled to mean "unchanged".
 */
export async function patchNotificationSettings(
  patch: NotificationSettingsPatch,
): Promise<NotificationSettingsPatch> {
  const body: Record<string, unknown> = {};
  const applied: NotificationSettingsPatch = {};

  if (patch.notificationEmail !== undefined) {
    if (patch.notificationEmail === null) {
      body.notification_email = null;
      applied.notificationEmail = null;
    } else {
      const email = patch.notificationEmail.trim();
      if (!isValidNotificationEmail(email)) throw new Error('Enter a valid email address.');
      body.notification_email = email;
      applied.notificationEmail = email;
    }
  }

  if (typeof patch.emailEnabled === 'boolean') {
    body.email_enabled = patch.emailEnabled;
    applied.emailEnabled = patch.emailEnabled;
  }

  if (Object.keys(body).length === 0) return applied;

  const response = await authenticatedFetch('/api/user/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await responseError(response, NOTIFICATION_EMAIL_ERROR);
  return applied;
}
