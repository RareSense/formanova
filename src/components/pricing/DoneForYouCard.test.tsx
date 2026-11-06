import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { DoneForYouCard } from './DoneForYouCard';

let mockUser: { email: string } | null = null;
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname + loc.search}</div>;
}

function renderCard(onOpenCall = vi.fn(), url = '/pricing') {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/pricing" element={<DoneForYouCard onOpenCall={onOpenCall} />} />
        <Route path="/login" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
  return onOpenCall;
}

describe('DoneForYouCard', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_RUBY_CALL_ALLOWLIST_EMAILS', 'ruby@example.com');
    mockUser = null;
  });
  afterEach(() => vi.unstubAllEnvs());

  it('is hidden for a signed-in user who is not allowlisted', () => {
    mockUser = { email: 'other@example.com' };
    renderCard();
    expect(screen.queryByText('Done for you')).not.toBeInTheDocument();
  });

  it('is hidden when no allowlist is configured', () => {
    vi.stubEnv('VITE_RUBY_CALL_ALLOWLIST_EMAILS', '');
    mockUser = { email: 'ruby@example.com' };
    renderCard();
    expect(screen.queryByText('Done for you')).not.toBeInTheDocument();
  });

  it('is shown for an allowlisted user', () => {
    mockUser = { email: 'Ruby@Example.com' };
    renderCard();
    // Laid out like a plan: italic kicker, "Custom" where the plan name goes, "Done for you" where the price goes.
    expect(screen.getByRole('region', { name: 'Done for you' })).toBeInTheDocument();
    expect(screen.getByText('We do it for you')).toBeInTheDocument();
    expect(screen.getByText('Custom')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Done for you' })).toBeInTheDocument();
    expect(screen.getByText('Bulk product, model & editorial shots')).toBeInTheDocument();
    expect(screen.getByText('Photos from your CAD files')).toBeInTheDocument();
    // Anyone can tell the call is with an AI, not a person, with no booking. Plain "our AI", never "sales agent".
    expect(screen.getByText(/from our AI, not a person/)).toBeInTheDocument();
    expect(screen.getByText(/no booking/i)).toBeInTheDocument();
    expect(screen.queryByText(/sales agent/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$30/)).not.toBeInTheDocument();
    expect(screen.queryByText(/recorded/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get my price' })).toBeInTheDocument();
  });

  it('sends a signed-out click to login and keeps the return path', () => {
    const onOpen = renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Get my price' }));
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByTestId('where')).toHaveTextContent(
      `/login?redirect=${encodeURIComponent('/pricing?talk=ruby')}`,
    );
  });

  it('opens the call window on click when signed in', () => {
    mockUser = { email: 'ruby@example.com' };
    const onOpen = renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Get my price' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('opens automatically after login when the URL has ?talk=ruby', () => {
    mockUser = { email: 'ruby@example.com' };
    const onOpen = renderCard(vi.fn(), '/pricing?talk=ruby');
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
