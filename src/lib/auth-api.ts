// Custom Auth Service API Client
// Routes through edge function proxy to avoid mixed content (HTTPS -> HTTP)

const AUTH_URL = '/auth';

export interface AuthUser {
  id: string;
  email: string;
  is_active: boolean;
  is_superuser: boolean;
  is_verified: boolean;
  // Optional profile fields (may come from OAuth)
  full_name?: string;
  avatar_url?: string;
}

export interface AuthTokenResponse {
  access_token: string;
  token_type: string;
}

export interface AuthError {
  detail: string;
}

// ========== Token Storage ==========

const TOKEN_KEY = 'formanova_auth_token';
const USER_KEY = 'formanova_auth_user';

// Custom event to notify React of auth changes (fixes race condition)
export const AUTH_STATE_CHANGE_EVENT = 'formanova_auth_state_change';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  const userJson = localStorage.getItem(USER_KEY);
  if (!userJson) return null;
  try {
    return JSON.parse(userJson);
  } catch {
    return null;
  }
}

export function setStoredUser(user: AuthUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function removeStoredUser(): void {
  localStorage.removeItem(USER_KEY);
}

/**
 * Dispatch auth state change event to notify React components.
 * This fixes the race condition between localStorage writes and React state updates.
 */
export function dispatchAuthChange(user: AuthUser | null): void {
  window.dispatchEvent(new CustomEvent(AUTH_STATE_CHANGE_EVENT, { detail: { user } }));
}

// ========== Auth API Client ==========

class AuthApi {
  // Initiate Google OAuth login via edge function proxy (avoids mixed content)
  async initiateGoogleLogin(): Promise<void> {
    console.log('[Auth] Starting Google OAuth via proxy...');
    
    try {
      // Pass the current origin so backend knows where to redirect back
      const frontendCallbackUrl = `${window.location.origin}/oauth-callback`;
      const url = `${AUTH_URL}/auth/google/authorize?redirect_uri=${encodeURIComponent(frontendCallbackUrl)}`;
      
      console.log('[Auth] Requesting OAuth with callback:', frontendCallbackUrl);
      const response = await fetch(url);
      const data = await response.json();
      
      const redirectUrl = data.redirect_url || data.authorization_url;
      if (redirectUrl) {
        console.log('[Auth] Redirecting to:', redirectUrl);
        window.location.href = redirectUrl;
      } else if (data.error) {
        throw new Error(data.error);
      } else {
        throw new Error('No redirect URL received');
      }
    } catch (error) {
      console.error('[Auth] OAuth initiation failed:', error);
      throw error;
    }
  }

  // Exchange OAuth code for token (callback handler) - uses proxy
  async exchangeCodeForToken(code: string, state?: string): Promise<AuthTokenResponse> {
    const params = new URLSearchParams({ code });
    if (state) params.append('state', state);

    // Signup attribution depends on this call sending cookies. AUTH_URL is relative
    // ('/auth'), so this is same-origin, and fetch's default credentials mode
    // ('same-origin') sends the fn_attr cookie set in index.html. The backend reads it
    // here — this is the request that reaches UserManager.on_after_register.
    //
    // Do NOT add credentials:'omit', and do NOT route this through authenticatedFetch
    // (which is for Bearer-token calls, not this pre-token exchange). Either change
    // silently stops attribution being recorded: sign-in still works, no error is
    // raised, no test fails, and every utm_* column just stays NULL.
    const response = await fetch(
      `${AUTH_URL}/auth/google/callback?${params.toString()}`,
      { method: 'GET' }
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'OAuth callback failed' }));
      throw new Error(error.detail || 'Failed to exchange code for token');
    }

    const data = await response.json();
    return data;
  }

  // Register with email/password - uses proxy
  async register(email: string, password: string): Promise<AuthUser> {
    const response = await fetch(`${AUTH_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Registration failed' }));
      throw new Error(error.detail || 'Failed to register');
    }

    return await response.json();
  }

  // Login with email/password - uses proxy
  async login(email: string, password: string): Promise<AuthTokenResponse> {
    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);

    const response = await fetch(`${AUTH_URL}/auth/jwt/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Login failed' }));
      throw new Error(error.detail || 'Invalid email or password');
    }

    return await response.json();
  }

  // Logout - uses proxy
  async logout(): Promise<void> {
    const token = getStoredToken();
    if (!token) return;

    try {
      await fetch(`${AUTH_URL}/auth/jwt/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      removeStoredToken();
      removeStoredUser();
      dispatchAuthChange(null);
    }
  }

  // Get current user - uses proxy
  // NOTE: Does NOT clear session on 401. Only explicit signOut clears auth.
  // This prevents auto-logout when JWT expires during inactivity.
  async getCurrentUser(): Promise<AuthUser | null> {
    const token = getStoredToken();
    if (!token) return null;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(`${AUTH_URL}/users/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired — do NOT clear storage or dispatch logout.
          // Session persists until explicit signOut. API calls that need
          // fresh auth will handle 401 individually (e.g., admin dashboard
          // prompts re-auth).
          console.warn('[Auth] Token validation returned 401 — session preserved, token may need refresh');
          return null;
        }
        throw new Error('Failed to get user');
      }

      const user = await response.json();
      setStoredUser(user);
      dispatchAuthChange(user);
      return user;
    } catch (error) {
      console.error('Get user error:', error);
      return null;
    }
  }

  // Get authorization header for API requests
  getAuthHeader(): Record<string, string> {
    const token = getStoredToken();
    if (!token) return {};
    return { 'Authorization': `Bearer ${token}` };
  }
}

export const authApi = new AuthApi();
