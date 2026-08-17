import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/authenticated-fetch', () => ({
  authenticatedFetch: vi.fn(),
}));

import { authenticatedFetch } from '@/lib/authenticated-fetch';
import {
  fetchNotificationEmail,
  isValidNotificationEmail,
  patchNotificationEmail,
} from '@/lib/notification-email-api';

const mockAuthenticatedFetch = vi.mocked(authenticatedFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  mockAuthenticatedFetch.mockReset();
});

describe('notification email profile API', () => {
  it('reads and normalizes notification_email through authenticated GET /api/user/profile', async () => {
    mockAuthenticatedFetch.mockResolvedValue(jsonResponse({ notification_email: '  cad@example.com ' }));
    const controller = new AbortController();

    await expect(fetchNotificationEmail(controller.signal)).resolves.toBe('cad@example.com');
    expect(mockAuthenticatedFetch).toHaveBeenCalledWith('/api/user/profile', { signal: controller.signal });
  });

  it('returns null when no stored notification email exists', async () => {
    mockAuthenticatedFetch.mockResolvedValue(jsonResponse({ notification_email: null }));
    await expect(fetchNotificationEmail()).resolves.toBeNull();
  });

  it('PATCHes only notification_email and returns the normalized value', async () => {
    mockAuthenticatedFetch.mockResolvedValue(jsonResponse({ success: true }));

    await expect(patchNotificationEmail('  delivery@example.com ')).resolves.toBe('delivery@example.com');
    expect(mockAuthenticatedFetch).toHaveBeenCalledWith('/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notification_email: 'delivery@example.com' }),
    });
  });

  it('rejects invalid addresses before making a request', async () => {
    await expect(patchNotificationEmail('not-an-email')).rejects.toThrow('Enter a valid email address.');
    expect(mockAuthenticatedFetch).not.toHaveBeenCalled();
  });

  it('surfaces a backend validation message', async () => {
    mockAuthenticatedFetch.mockResolvedValue(jsonResponse({ detail: 'Email domain is not allowed.' }, 422));
    await expect(patchNotificationEmail('delivery@example.com')).rejects.toThrow('Email domain is not allowed.');
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
