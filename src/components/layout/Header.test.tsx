import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { GenerationIndicator, Header, isNavLinkActivePath } from './Header';

const mockGenerations = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock('@/contexts/GenerationsContext', () => ({
  useGenerations: () => ({ generations: mockGenerations.list }),
  buildCadRestorePath: vi.fn(),
}));

const mockAuth = vi.hoisted(() => ({ user: null as null | { id: string; email: string } }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockAuth.user, signOut: vi.fn(), signInWithGoogle: vi.fn() }),
}));
vi.mock('@/contexts/CreditsContext', () => ({
  useCredits: () => ({ credits: 10, lastDelta: null }),
}));
vi.mock('@/hooks/useIsAdmin', () => ({ useIsAdmin: () => false }));
vi.mock('@/hooks/useUserType', () => ({ useUserType: () => null }));
vi.mock('@/components/ThemeSwitcher', () => ({ ThemeSwitcher: () => null }));
vi.mock('@/components/ThemeLogo', () => ({ ThemeLogo: () => null }));

const running = (extra: Record<string, unknown> = {}) => ({
  workflowId: 'w1',
  kind: 'cad',
  status: 'running',
  ...extra,
});

function renderPill() {
  return render(
    <MemoryRouter>
      <GenerationIndicator />
    </MemoryRouter>,
  );
}

describe('GenerationIndicator', () => {
  it('shows a calm In queue pill, with no spinner, when every running run is supervised CAD', () => {
    mockGenerations.list = [running({ supervised: true })];
    const { container } = renderPill();
    expect(screen.getByText('In queue')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'In queue' })).toBeTruthy();
    expect(container.querySelector('.animate-spin')).toBeNull();
  });

  it('counts several supervised runs', () => {
    mockGenerations.list = [running({ supervised: true }), running({ workflowId: 'w2', supervised: true })];
    renderPill();
    expect(screen.getByText('2 in queue')).toBeTruthy();
  });

  it('keeps the spinning Generating pill for an ordinary running run', () => {
    mockGenerations.list = [running()];
    const { container } = renderPill();
    expect(screen.getByText('Generating…')).toBeTruthy();
    expect(container.querySelector('.animate-spin')).not.toBeNull();
  });

  it('keeps Generating when supervised and ordinary runs are mixed', () => {
    mockGenerations.list = [running({ supervised: true }), running({ workflowId: 'w2' })];
    renderPill();
    expect(screen.getByText('2 Generating…')).toBeTruthy();
  });
});

// Both the desktop nav and the mobile menu render the same links, so each
// label appears twice when it is shown.
function renderHeader() {
  return render(
    <MemoryRouter>
      <Header />
    </MemoryRouter>,
  );
}

describe('Header nav links', () => {
  it('does not offer Dashboard to a logged-out visitor, in either menu', () => {
    mockAuth.user = null;
    renderHeader();
    expect(screen.queryAllByRole('link', { name: 'Dashboard' })).toHaveLength(0);
    expect(screen.getAllByRole('link', { name: 'Home' })).toHaveLength(2);
  });

  it('offers Pricing to a logged-out visitor, in both menus', () => {
    mockAuth.user = null;
    renderHeader();
    const pricing = screen.getAllByRole('link', { name: 'Pricing' });
    expect(pricing).toHaveLength(2);
    pricing.forEach((link) => expect(link.getAttribute('href')).toBe('/pricing'));
  });

  it('does not add a Pricing nav link for a signed-in user (they buy from the credits pill)', () => {
    mockAuth.user = { id: 'u1', email: 'user@example.com' };
    renderHeader();
    expect(screen.queryAllByRole('link', { name: 'Pricing' })).toHaveLength(0);
  });

  it('keeps Dashboard for a signed-in user, in both menus', () => {
    mockAuth.user = { id: 'u1', email: 'user@example.com' };
    renderHeader();
    const dashboard = screen.getAllByRole('link', { name: 'Dashboard' });
    expect(dashboard).toHaveLength(2);
    dashboard.forEach((link) => expect(link.getAttribute('href')).toBe('/dashboard'));
  });
});

const dashboardLink = {
  path: '/dashboard',
  activePaths: ['/dashboard', '/studio', '/studio-cad', '/text-to-cad', '/image-to-cad'],
};

describe('isNavLinkActivePath', () => {
  it('marks Dashboard active on the merged hub and every studio entry route', () => {
    expect(isNavLinkActivePath('/dashboard', dashboardLink)).toBe(true);
    expect(isNavLinkActivePath('/studio', dashboardLink)).toBe(true);
    expect(isNavLinkActivePath('/studio-cad', dashboardLink)).toBe(true);
    expect(isNavLinkActivePath('/text-to-cad', dashboardLink)).toBe(true);
    expect(isNavLinkActivePath('/image-to-cad', dashboardLink)).toBe(true);
  });

  it('stays active while working inside a studio workflow', () => {
    expect(isNavLinkActivePath('/studio/categories', dashboardLink)).toBe(true);
    expect(isNavLinkActivePath('/studio/rings', dashboardLink)).toBe(true);
  });

  it('keeps unrelated routes inactive for the Dashboard nav link', () => {
    expect(isNavLinkActivePath('/', dashboardLink)).toBe(false);
    expect(isNavLinkActivePath('/credits', dashboardLink)).toBe(false);
    expect(isNavLinkActivePath('/generations', dashboardLink)).toBe(false);
  });
});
