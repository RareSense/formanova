// Centralized authenticated fetch wrapper
// Handles 401 globally: clears auth state → redirects to /login with preserved destination

import { getStoredToken, removeStoredToken, removeStoredUser, dispatchAuthChange } from '@/lib/auth-api';

/**
 * Custom error thrown on 401 to signal auth expiry.
 * Callers can catch this if they need to handle it specially,
 * but by default authenticatedFetch already triggers the redirect.
 */
export class AuthExpiredError extends Error {
  constructor() {
    super('AUTH_EXPIRED');
    this.name = 'AuthExpiredError';
  }
}

/**
 * Perform a redirect to /login while preserving the current full path.
 * Safe to call multiple times — only the first navigation wins.
 */
let redirecting = false;
function redirectToLogin(): void {
  if (redirecting) return;
  redirecting = true;

  // Clear all auth state
  removeStoredToken();
  removeStoredUser();
  dispatchAuthChange(null);

  const currentPath = window.location.pathname + window.location.search + window.location.hash;
  window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
}

// Reset flag when module is re-evaluated (HMR)
if (import.meta.hot) {
  import.meta.hot.dispose(() => { redirecting = false; });
}

/**
 * Authenticated fetch wrapper.
 * - Automatically attaches Bearer JWT
 * - On 401: clears session, redirects to /login, throws AuthExpiredError
 * - All protected API calls should use this instead of raw fetch
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = getStoredToken();
  if (!token) {
    redirectToLogin();
    throw new AuthExpiredError();
  }

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    redirectToLogin();
    throw new AuthExpiredError();
  }

  return response;
}
