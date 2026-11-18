import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const auth = vi.hoisted(() => ({ user: { id: 'u1' } as { id: string } | null, initializing: false }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));

const done = vi.hoisted(() => ({ value: false }));
vi.mock('@/lib/onboarding-api', () => ({ isOnboardingComplete: () => done.value }));

import { OnboardingRedirectHandler } from './OnboardingRedirectHandler';

function OnboardingProbe() {
  const location = useLocation();
  return <div data-testid="onboarding">{JSON.stringify(location.state)}</div>;
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <OnboardingRedirectHandler />
      <Routes>
        <Route path="/onboarding" element={<OnboardingProbe />} />
        <Route path="*" element={<div data-testid="page" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('OnboardingRedirectHandler', () => {
  beforeEach(() => {
    auth.user = { id: 'u1' };
    auth.initializing = false;
    done.value = false;
  });

  it('sends a not-yet-onboarded user to onboarding, remembering where they were going', async () => {
    renderAt('/image-to-cad?ref=hero');
    const probe = await screen.findByTestId('onboarding');
    expect(JSON.parse(probe.textContent!)).toEqual({ from: '/image-to-cad?ref=hero' });
  });

  it('leaves onboarded users where they are', () => {
    done.value = true;
    renderAt('/image-to-cad');
    expect(screen.getByTestId('page')).toBeTruthy();
  });

  it('leaves public pages and signed-out visitors alone', () => {
    renderAt('/');
    expect(screen.getByTestId('page')).toBeTruthy();
    auth.user = null;
    renderAt('/dashboard');
    expect(screen.queryByTestId('onboarding')).toBeNull();
  });
});
