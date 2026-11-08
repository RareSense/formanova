import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';

// HeyCatch identity: signed-in users are identified by their stable id (email and
// name as properties), and sign-out resets so the next visitor starts anonymous.

const heycatch = vi.hoisted(() => ({ setIdentity: vi.fn(), resetIdentity: vi.fn() }));
vi.mock('@heycatch/sdk', () => ({ analytics: heycatch }));
vi.mock('@/lib/posthog-events', () => ({ trackLogin: vi.fn(), trackLogout: vi.fn(), identifyUser: vi.fn() }));

const api = vi.hoisted(() => ({
  token: null as string | null,
  current: null as { id: string; email: string; full_name?: string } | null,
}));
vi.mock('@/lib/auth-api', () => ({
  AUTH_STATE_CHANGE_EVENT: 'test-auth-change',
  getStoredToken: () => api.token,
  getStoredUser: () => null,
  authApi: {
    getCurrentUser: async () => api.current,
    logout: async () => {},
    getAuthHeader: () => ({}),
    initiateGoogleLogin: async () => {},
  },
}));

function SignOut() {
  const { signOut } = useAuth();
  return <button onClick={() => signOut()}>Sign out</button>;
}

const renderAuth = () => render(<AuthProvider><SignOut /></AuthProvider>);

describe('AuthContext, HeyCatch identity', () => {
  beforeEach(() => {
    heycatch.setIdentity.mockReset();
    heycatch.resetIdentity.mockReset();
    api.token = null;
    api.current = null;
  });

  it('identifies a user who just signed in', () => {
    renderAuth();
    act(() => {
      window.dispatchEvent(new CustomEvent('test-auth-change', {
        detail: { user: { id: 'u1', email: 'sam@example.com', full_name: 'Sam Rivers' } },
      }));
    });
    expect(heycatch.setIdentity).toHaveBeenCalledWith('u1', { email: 'sam@example.com', name: 'Sam Rivers' });
  });

  it('identifies a returning user once the session is confirmed', async () => {
    api.token = 'jwt';
    api.current = { id: 'u2', email: 'ana@example.com' };
    renderAuth();
    await waitFor(() => expect(heycatch.setIdentity).toHaveBeenCalledWith('u2', { email: 'ana@example.com', name: undefined }));
  });

  it('does not identify anyone without a session', async () => {
    renderAuth();
    await act(async () => {});
    expect(heycatch.setIdentity).not.toHaveBeenCalled();
  });

  it('resets the identity on sign-out', async () => {
    renderAuth();
    await act(async () => { screen.getByRole('button', { name: 'Sign out' }).click(); });
    expect(heycatch.resetIdentity).toHaveBeenCalledTimes(1);
  });
});
