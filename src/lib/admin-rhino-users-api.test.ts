import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAuthFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/authenticated-fetch', () => ({ authenticatedFetch: mockAuthFetch }));

import { listAdminRhinoUsers, rhinoDateRange } from './admin-rhino-users-api';
import { AdminGenerationsApiError } from './admin-generations-api';

function okJson(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as unknown as Response);
}

const BODY = {
  totals: { users: 2, runs: 5, credits: 700 },
  items: [{
    user_id: 'u1', user_email: 'a@b.co', first_run_at: '2026-10-20T12:00:00',
    last_run_at: '2026-10-28T09:00:00', runs: 3, credits: 420,
  }],
  total: 2, limit: 20, offset: 0,
};

beforeEach(() => { mockAuthFetch.mockReset(); });

describe('rhinoDateRange', () => {
  it('keeps "from" as an inclusive start of day', () => {
    expect(rhinoDateRange('2026-10-01', '')).toEqual({ created_after: '2026-10-01T00:00:00' });
  });

  it('turns an inclusive "to" day into the next day, since created_before is exclusive', () => {
    expect(rhinoDateRange('', '2026-10-31')).toEqual({ created_before: '2026-11-01T00:00:00' });
    expect(rhinoDateRange('', '2026-12-31')).toEqual({ created_before: '2027-01-01T00:00:00' });
    expect(rhinoDateRange('', '2028-02-28')).toEqual({ created_before: '2028-02-29T00:00:00' });
  });

  it('sends nothing for an empty or malformed range', () => {
    expect(rhinoDateRange('', '')).toEqual({});
    expect(rhinoDateRange('nope', '2026-13-45')).toEqual({});
  });
});

describe('listAdminRhinoUsers', () => {
  it('calls the relative /api/admin/rhino-users path with paging and dates', async () => {
    mockAuthFetch.mockReturnValueOnce(okJson(BODY));
    await listAdminRhinoUsers({
      limit: 20, offset: 40, created_after: '2026-10-01T00:00:00', created_before: '2026-11-01T00:00:00',
    });
    const url = new URL(mockAuthFetch.mock.calls[0][0], 'http://x');
    expect(url.pathname).toBe('/api/admin/rhino-users');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      limit: '20', offset: '40', created_after: '2026-10-01T00:00:00', created_before: '2026-11-01T00:00:00',
    });
  });

  it('omits unset params', async () => {
    mockAuthFetch.mockReturnValueOnce(okJson(BODY));
    await listAdminRhinoUsers({});
    expect(mockAuthFetch.mock.calls[0][0]).toBe('/api/admin/rhino-users');
  });

  it('returns totals, rows and the user count for paging', async () => {
    mockAuthFetch.mockReturnValueOnce(okJson(BODY));
    const res = await listAdminRhinoUsers({ limit: 20 });
    expect(res.totals).toEqual({ users: 2, runs: 5, credits: 700 });
    expect(res.items[0]).toEqual(BODY.items[0]);
    expect(res.total).toBe(2);
  });

  it('throws AdminGenerationsApiError with the backend detail', async () => {
    mockAuthFetch.mockReturnValueOnce(Promise.resolve({
      ok: false, status: 403, json: () => Promise.resolve({ detail: 'Forbidden' }), text: () => Promise.resolve(''),
    } as unknown as Response));
    const err = await listAdminRhinoUsers({}).catch((e) => e);
    expect(err).toBeInstanceOf(AdminGenerationsApiError);
    expect(err).toMatchObject({ status: 403, message: 'Forbidden' });
  });
});
