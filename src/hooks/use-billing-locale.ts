import { useState, useEffect } from 'react';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { getStoredToken } from '@/lib/auth-api';

export interface BillingLocale {
  country: string;
  currency: string;
  symbol: string;
}

const USD_FALLBACK: BillingLocale = { country: '', currency: 'USD', symbol: '$' };

export function useBillingLocale(): BillingLocale {
  const [locale, setLocale] = useState<BillingLocale>(USD_FALLBACK);

  useEffect(() => {
    // Without a session, authenticatedFetch would send the visitor to /login, so
    // logged-out visitors (public /pricing) keep USD until they sign in.
    if (!getStoredToken()) return;
    authenticatedFetch('/billing/locale')
      .then(r => r.json())
      .then((data: BillingLocale) => {
        setLocale(data?.currency ? data : USD_FALLBACK);
      })
      .catch(() => {
        setLocale(USD_FALLBACK);
      });
  }, []);

  return locale;
}
