import { describe, it, expect, vi, beforeEach } from 'vitest';

// -- URL tests: verify authenticatedFetch is used and paths are relative --

const mockAuthFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/authenticated-fetch', () => ({
  authenticatedFetch: mockAuthFetch,
  AuthExpiredError: class AuthExpiredError extends Error {
    constructor() {
      super('AUTH_EXPIRED');
      this.name = 'AuthExpiredError';
    }
  },
}));

import { AuthExpiredError } from '@/lib/authenticated-fetch';
import {
  listAdminGenerations,
  getAdminGenerationDetail,
  normalizeAdminGenerationDetail,
  AdminGenerationsApiError,
} from './admin-generations-api';

function okJson(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response);
}

function notOk(status = 500, body: unknown = {}) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response);
}

beforeEach(() => mockAuthFetch.mockReset());

describe('admin-generations-api URL shapes', () => {
  it('listAdminGenerations calls a relative /api/admin/generations path', async () => {
    mockAuthFetch.mockReturnValueOnce(okJson({ items: [], total: 0, limit: 10, offset: 0 }));
    await listAdminGenerations({ limit: 10, offset: 0 });
    const [url] = mockAuthFetch.mock.calls[0];
    expect(url).toMatch(/^\/api\/admin\/generations/);
    expect(url).not.toContain('formanova.ai');
  });

  it('getAdminGenerationDetail calls a relative /api/admin/generations/{id} path', async () => {
    mockAuthFetch.mockReturnValueOnce(okJson({ workflow_id: 'wf-99', status: 'completed', steps: [] }));
    await getAdminGenerationDetail('wf-99');
    const [url] = mockAuthFetch.mock.calls[0];
    expect(url).toMatch(/^\/api\/admin\/generations/);
    expect(url).toContain('wf-99');
    expect(url).not.toContain('formanova.ai');
  });
});

describe('admin-generations-api error handling', () => {
  it('throws AdminGenerationsApiError on non-ok response', async () => {
    mockAuthFetch.mockReturnValueOnce(notOk(403, { detail: 'Forbidden' }));
    await expect(listAdminGenerations()).rejects.toMatchObject({
      name: 'AdminGenerationsApiError',
      status: 403,
      message: 'Forbidden',
    });
  });

  it('propagates AuthExpiredError without wrapping it', async () => {
    mockAuthFetch.mockRejectedValueOnce(new AuthExpiredError());
    await expect(listAdminGenerations()).rejects.toMatchObject({
      name: 'AuthExpiredError',
      message: 'AUTH_EXPIRED',
    });
  });
});

describe('supervised filter and shared normalizer', () => {
  it('listAdminGenerations sends supervised only when given', async () => {
    mockAuthFetch.mockReturnValueOnce(okJson({ items: [], total: 0, limit: 10, offset: 0 }));
    await listAdminGenerations({ supervised: false });
    expect(mockAuthFetch.mock.calls[0][0]).toContain('supervised=false');
    mockAuthFetch.mockReturnValueOnce(okJson({ items: [], total: 0, limit: 10, offset: 0 }));
    await listAdminGenerations({});
    expect(mockAuthFetch.mock.calls[1][0]).not.toContain('supervised');
  });

  it('normalizeAdminGenerationDetail keeps the data wrapper and id fallback', () => {
    const d = normalizeAdminGenerationDetail(
      { workflow_id: 'w', workflow_name: 'jewelry_cad_generate', status: 'running', steps: [] },
      'w',
    );
    expect(d.workflow_id).toBe('w');
    expect(d.workflow_name).toBe('jewelry_cad_generate');
    expect(d.steps).toEqual([]);
    expect(normalizeAdminGenerationDetail({ data: { workflow_name: 'x' } }, 'w2').workflow_id).toBe('w2');
  });
});
