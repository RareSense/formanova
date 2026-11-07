import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const token = vi.hoisted(() => ({ value: null as string | null }));
vi.mock('@/lib/auth-api', () => ({ getStoredToken: () => token.value }));

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/authenticated-fetch', () => ({ authenticatedFetch: fetchMock }));

import { useBillingLocale } from './use-billing-locale';

describe('useBillingLocale', () => {
  beforeEach(() => {
    token.value = null;
    fetchMock.mockReset();
  });

  // /pricing is public: without a token, authenticatedFetch would send the visitor to /login.
  it('does not look up the locale without a session, and uses USD', () => {
    const { result } = renderHook(() => useBillingLocale());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current).toEqual({ country: '', currency: 'USD', symbol: '$' });
  });

  it('uses the backend locale for a signed-in user', async () => {
    token.value = 'jwt';
    fetchMock.mockResolvedValue({ json: async () => ({ country: 'IN', currency: 'INR', symbol: '₹' }) });
    const { result } = renderHook(() => useBillingLocale());
    expect(fetchMock).toHaveBeenCalledWith('/billing/locale');
    await waitFor(() => expect(result.current.currency).toBe('INR'));
  });
});
