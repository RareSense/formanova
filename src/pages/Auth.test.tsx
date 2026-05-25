import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import Auth from './Auth';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: '/login', search: '', hash: '', state: null }),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

vi.mock('react-helmet-async', () => ({
  Helmet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ThemeLogo', () => ({
  ThemeLogo: ({ className }: { className?: string }) => <div className={className} />,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const mockSetStoredToken = vi.fn();
const mockSetStoredUser = vi.fn();
const mockDispatchAuthChange = vi.fn();
const mockGetCurrentUser = vi.fn();

vi.mock('@/lib/auth-api', () => ({
  authApi: { getCurrentUser: () => mockGetCurrentUser() },
  getStoredToken: () => null,
  setStoredToken: (t: string) => mockSetStoredToken(t),
  setStoredUser: (u: unknown) => mockSetStoredUser(u),
  dispatchAuthChange: (u: unknown) => mockDispatchAuthChange(u),
}));

vi.mock('@/lib/public-url', () => ({
  getPublicSiteUrl: () => 'https://staging.formanova.ai',
}));

function renderAuth() {
  return render(
    <MemoryRouter initialEntries={['/login']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Auth />
    </MemoryRouter>,
  );
}

describe('Shopify reviewer login', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockSetStoredToken.mockReset();
    mockSetStoredUser.mockReset();
    mockDispatchAuthChange.mockReset();
    mockGetCurrentUser.mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not render reviewer form when flag is off', () => {
    vi.stubEnv('VITE_SHOPIFY_REVIEW_LOGIN', 'false');
    renderAuth();
    expect(screen.queryByText('Reviewer Login')).toBeNull();
    expect(screen.queryByPlaceholderText('Email')).toBeNull();
  });

  it('renders reviewer form when flag is true', () => {
    vi.stubEnv('VITE_SHOPIFY_REVIEW_LOGIN', 'true');
    renderAuth();
    expect(screen.getByText('Reviewer Login')).toBeTruthy();
    expect(screen.getByPlaceholderText('Email')).toBeTruthy();
    expect(screen.getByPlaceholderText('Password')).toBeTruthy();
  });

  it('stores token and navigates to /my-shopify-store on success', async () => {
    vi.stubEnv('VITE_SHOPIFY_REVIEW_LOGIN', 'true');

    const fakeUser = { id: 'u1', email: 'reviewer@example.com', name: 'Shopify Reviewer', picture: null };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'tok-abc', user: fakeUser }),
    });

    renderAuth();

    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'reviewer@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'secret' } });
    fireEvent.submit(screen.getByPlaceholderText('Email').closest('form')!);

    await waitFor(() => {
      expect(mockSetStoredToken).toHaveBeenCalledWith('tok-abc');
      expect(mockSetStoredUser).toHaveBeenCalledWith(fakeUser);
      expect(mockDispatchAuthChange).toHaveBeenCalledWith(fakeUser);
      expect(mockNavigate).toHaveBeenCalledWith('/my-shopify-store', { replace: true });
    });
  });

  it('fetches current user when response has no user field', async () => {
    vi.stubEnv('VITE_SHOPIFY_REVIEW_LOGIN', 'true');

    const fakeUser = { id: 'u2', email: 'reviewer@example.com', name: 'Shopify Reviewer' };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'tok-xyz' }),
    });
    mockGetCurrentUser.mockResolvedValueOnce(fakeUser);

    renderAuth();

    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'reviewer@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'secret' } });
    fireEvent.submit(screen.getByPlaceholderText('Email').closest('form')!);

    await waitFor(() => {
      expect(mockSetStoredToken).toHaveBeenCalledWith('tok-xyz');
      expect(mockDispatchAuthChange).toHaveBeenCalledWith(fakeUser);
      expect(mockNavigate).toHaveBeenCalledWith('/my-shopify-store', { replace: true });
    });
  });

  it('shows error message on invalid credentials', async () => {
    vi.stubEnv('VITE_SHOPIFY_REVIEW_LOGIN', 'true');

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: 'Invalid credentials' }),
    });

    renderAuth();

    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'wrong@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'bad' } });
    fireEvent.submit(screen.getByPlaceholderText('Email').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeTruthy();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockSetStoredToken).not.toHaveBeenCalled();
  });

  it('shows fallback error on network failure', async () => {
    vi.stubEnv('VITE_SHOPIFY_REVIEW_LOGIN', 'true');

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error());

    renderAuth();

    fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'x@x.com' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'x' } });
    fireEvent.submit(screen.getByPlaceholderText('Email').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Login failed')).toBeTruthy();
    });
  });
});
