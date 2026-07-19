import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetStoredToken = vi.hoisted(() => vi.fn<[], string | null>());
const mockRemoveStoredToken = vi.hoisted(() => vi.fn());
const mockRemoveStoredUser = vi.hoisted(() => vi.fn());
const mockDispatchAuthChange = vi.hoisted(() => vi.fn());

vi.mock('@/lib/auth-api', () => ({
  getStoredToken: mockGetStoredToken,
  removeStoredToken: mockRemoveStoredToken,
  removeStoredUser: mockRemoveStoredUser,
  dispatchAuthChange: mockDispatchAuthChange,
}));

// Helpers to set window.location for tests
function setLocation(pathname: string, search = '', hash = '') {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { pathname, search, hash, href: '' },
    writable: true,
  });
}

describe('redirectToLogin', () => {
  beforeEach(async () => {
    vi.resetModules();
    mockGetStoredToken.mockReset();
    mockRemoveStoredToken.mockReset();
    mockRemoveStoredUser.mockReset();
    mockDispatchAuthChange.mockReset();
    // Reset the module-level redirecting flag by re-importing
  });

  it('redirects to /login?redirect=<path> when not on login page', async () => {
    setLocation('/studio', '?mode=product', '');
    mockGetStoredToken.mockReturnValue(null);

    const { authenticatedFetch } = await import('./authenticated-fetch');
    await expect(authenticatedFetch('/api/test')).rejects.toThrow('AUTH_EXPIRED');

    expect(window.location.href).toBe('/login?redirect=%2Fstudio%3Fmode%3Dproduct');
  });

  it('redirects to plain /login when already on /login to prevent redirect loop', async () => {
    setLocation('/login', '?redirect=%2Flogin%3Fredirect%3D...', '');
    mockGetStoredToken.mockReturnValue(null);

    const { authenticatedFetch } = await import('./authenticated-fetch');
    await expect(authenticatedFetch('/api/test')).rejects.toThrow('AUTH_EXPIRED');

    expect(window.location.href).toBe('/login');
  });

  it('redirects to plain /login when on /login subpath', async () => {
    setLocation('/login/callback', '', '');
    mockGetStoredToken.mockReturnValue(null);

    const { authenticatedFetch } = await import('./authenticated-fetch');
    await expect(authenticatedFetch('/api/test')).rejects.toThrow('AUTH_EXPIRED');

    expect(window.location.href).toBe('/login');
  });

  it('clears auth state before redirecting', async () => {
    setLocation('/dashboard', '', '');
    mockGetStoredToken.mockReturnValue(null);

    const { authenticatedFetch } = await import('./authenticated-fetch');
    await expect(authenticatedFetch('/api/test')).rejects.toThrow('AUTH_EXPIRED');

    expect(mockRemoveStoredToken).toHaveBeenCalled();
    expect(mockRemoveStoredUser).toHaveBeenCalled();
    expect(mockDispatchAuthChange).toHaveBeenCalledWith(null);
  });

  it('redirects on 401 response', async () => {
    setLocation('/studio', '', '');
    mockGetStoredToken.mockReturnValue('valid-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 401 }));

    const { authenticatedFetch } = await import('./authenticated-fetch');
    await expect(authenticatedFetch('/api/test')).rejects.toThrow('AUTH_EXPIRED');

    expect(mockRemoveStoredToken).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
