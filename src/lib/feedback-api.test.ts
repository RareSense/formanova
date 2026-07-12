import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/authenticated-fetch', () => ({
  authenticatedFetch: vi.fn(),
}));

import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { listFeedback } from '@/lib/feedback-api';

const mockFetch = vi.mocked(authenticatedFetch);

beforeEach(() => {
  mockFetch.mockReset();
  // Fresh Response per call — a Response body can only be consumed once.
  mockFetch.mockImplementation(async () =>
    new Response(JSON.stringify({ items: [], total: 0, limit: 20, offset: 0 }), { status: 200 }),
  );
});

describe('listFeedback', () => {
  it('sends reporter_email as a query param when provided', async () => {
    await listFeedback({ reporter_email: 'jo', limit: 20 });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('reporter_email=jo');
    expect(url).toContain('limit=20');
  });

  it('omits reporter_email entirely when empty or absent', async () => {
    await listFeedback({ limit: 20 });
    expect(mockFetch.mock.calls[0][0]).not.toContain('reporter_email');
    await listFeedback({ reporter_email: '', limit: 20 });
    expect(mockFetch.mock.calls[1][0]).not.toContain('reporter_email');
  });

  it('sends the raw term unescaped — backend handles % and _ escaping', async () => {
    await listFeedback({ reporter_email: 'a_b%c' });
    const url = mockFetch.mock.calls[0][0] as string;
    // URLSearchParams URL-encodes, but the decoded value must be the raw term
    expect(decodeURIComponent(url)).toContain('reporter_email=a_b%c');
  });

  it('combines reporter_email with existing filters', async () => {
    await listFeedback({ reporter_email: 'jo', category: 'ring', email_status: 'failed' });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('reporter_email=jo');
    expect(url).toContain('category=ring');
    expect(url).toContain('email_status=failed');
  });
});
