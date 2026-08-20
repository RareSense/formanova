import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/authenticated-fetch', () => ({
  authenticatedFetch: vi.fn(),
}));

import { authenticatedFetch } from '@/lib/authenticated-fetch';
import {
  fetchNotificationSettings,
  isValidNotificationEmail,
  patchNotificationSettings,
} from '@/lib/notification-email-api';

const mockAuthenticatedFetch = vi.mocked(authenticatedFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function patchBody() {
  return JSON.parse((mockAuthenticatedFetch.mock.calls[0][1] as RequestInit).body as string);
}

beforeEach(() => {
  mockAuthenticatedFetch.mockReset();
});

describe('fetchNotificationSettings', () => {
  it('reads the three profile fields through an authenticated GET', async () => {
    mockAuthenticatedFetch.mockResolvedValue(jsonResponse({
      notification_email: '  cad@example.com ',
      effective_notification_email: 'cad@example.com',
      email_enabled: true,
    }));
    const controller = new AbortController();

    await expect(fetchNotificationSettings(controller.signal)).resolves.toEqual({
      notificationEmail: 'cad@example.com',
      effectiveEmail: 'cad@example.com',
      emailEnabled: true,
    });
    expect(mockAuthenticatedFetch).toHaveBeenCalledWith('/api/user/profile', { signal: controller.signal });
  });

  it('keeps the raw override separate from the effective address', async () => {
    // A null override is what tells the UI to render an empty input rather
    // than pre-filling with an account address the user would have to clear.
    mockAuthenticatedFetch.mockResolvedValue(jsonResponse({
      notification_email: null,
      effective_notification_email: 'account@example.com',
      email_enabled: true,
    }));

    await expect(fetchNotificationSettings()).resolves.toEqual({
      notificationEmail: null,
      effectiveEmail: 'account@example.com',
      emailEnabled: true,
    });
  });

  it('reports a disabled toggle', async () => {
    mockAuthenticatedFetch.mockResolvedValue(jsonResponse({
      notification_email: null,
      effective_notification_email: 'account@example.com',
      email_enabled: false,
    }));

    await expect(fetchNotificationSettings()).resolves.toMatchObject({ emailEnabled: false });
  });

  it('falls back safely on a profile that predates these fields', async () => {
    // The fields ship to prod separately from this UI, so an older profile
    // must not read as "notifications off" or blank out the address.
    mockAuthenticatedFetch.mockResolvedValue(jsonResponse({ notification_email: 'cad@example.com' }));

    await expect(fetchNotificationSettings()).resolves.toEqual({
      notificationEmail: 'cad@example.com',
      effectiveEmail: 'cad@example.com',
      emailEnabled: true,
    });
  });
});

describe('patchNotificationSettings', () => {
  it('sends only the address when only the address changes', async () => {
    mockAuthenticatedFetch.mockResolvedValue(jsonResponse({ success: true }));

    await expect(patchNotificationSettings({ notificationEmail: '  delivery@example.com ' }))
      .resolves.toEqual({ notificationEmail: 'delivery@example.com' });
    expect(patchBody()).toEqual({ notification_email: 'delivery@example.com' });
  });

  it('sends an explicit null to clear the override back to the account email', async () => {
    mockAuthenticatedFetch.mockResolvedValue(jsonResponse({ success: true }));

    await expect(patchNotificationSettings({ notificationEmail: null }))
      .resolves.toEqual({ notificationEmail: null });
    expect(patchBody()).toEqual({ notification_email: null });
  });

  it('sends only the toggle when only the toggle changes', async () => {
    mockAuthenticatedFetch.mockResolvedValue(jsonResponse({ success: true }));

    await expect(patchNotificationSettings({ emailEnabled: false }))
      .resolves.toEqual({ emailEnabled: false });
    expect(patchBody()).toEqual({ email_enabled: false });
  });

  it('never sends a null email_enabled, which the backend rejects with a 422', async () => {
    // email_enabled is NOT NULL server-side. notification_email accepts null
    // and email_enabled does not, so the key has to be absent, not nulled.
    mockAuthenticatedFetch.mockResolvedValue(jsonResponse({ success: true }));

    await patchNotificationSettings({ notificationEmail: 'a@example.com', emailEnabled: undefined });

    expect(patchBody()).not.toHaveProperty('email_enabled');
  });

  it('makes no request when there is nothing to change', async () => {
    await expect(patchNotificationSettings({})).resolves.toEqual({});
    expect(mockAuthenticatedFetch).not.toHaveBeenCalled();
  });

  it('rejects an invalid address before making a request', async () => {
    await expect(patchNotificationSettings({ notificationEmail: 'not-an-email' }))
      .rejects.toThrow('Enter a valid email address.');
    expect(mockAuthenticatedFetch).not.toHaveBeenCalled();
  });

  it('surfaces a plain-string backend validation message', async () => {
    mockAuthenticatedFetch.mockResolvedValue(jsonResponse({ detail: 'Email domain is not allowed.' }, 422));

    await expect(patchNotificationSettings({ notificationEmail: 'delivery@example.com' }))
      .rejects.toThrow('Email domain is not allowed.');
  });

  it('surfaces a field-validation 422 rather than a bare status code', async () => {
    mockAuthenticatedFetch.mockResolvedValue(jsonResponse({
      detail: [{ loc: ['body', 'notification_email'], msg: 'value is not a valid email address' }],
    }, 422));

    await expect(patchNotificationSettings({ notificationEmail: 'delivery@example.com' }))
      .rejects.toThrow('value is not a valid email address');
  });
});

describe('isValidNotificationEmail', () => {
  it('accepts ordinary email addresses and rejects incomplete values', () => {
    expect(isValidNotificationEmail('cad+alerts@example.co.uk')).toBe(true);
    expect(isValidNotificationEmail('cad@example')).toBe(false);
    expect(isValidNotificationEmail('cad example.com')).toBe(false);
    expect(isValidNotificationEmail('')).toBe(false);
  });
});
