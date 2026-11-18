import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const navigate = vi.hoisted(() => vi.fn());
const routerLocation = vi.hoisted(() => ({ current: { state: null as unknown } }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate, useLocation: () => routerLocation.current }));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'new@example.com' }, initializing: false }),
}));

const api = vi.hoisted(() => ({
  isOnboardingComplete: vi.fn(() => false),
  markOnboardingComplete: vi.fn(),
  saveUserType: vi.fn(async () => {}),
  setCachedUserType: vi.fn(),
  hasSavedUserType: vi.fn(async (): Promise<boolean | null> => false),
}));
vi.mock('@/lib/onboarding-api', () => api);

const ph = vi.hoisted(() => ({ trackUserTypeSelected: vi.fn(), trackSignup: vi.fn() }));
vi.mock('@/lib/posthog-events', () => ph);

const hc = vi.hoisted(() => ({ trackHeyCatchSignupCompleted: vi.fn() }));
vi.mock('@/lib/heycatch-events', () => hc);

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/components/JewelryBrandModal', () => ({ JewelryBrandModal: () => null }));

import RolePicker from './RolePicker';

function finishOnboarding() {
  render(<RolePicker />);
  fireEvent.click(screen.getByRole('button', { name: /freelancer/i }));
  fireEvent.click(screen.getByRole('button', { name: /i agree to the/i }));
  fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
}

describe('RolePicker signup events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.isOnboardingComplete.mockReturnValue(false);
    routerLocation.current = { state: null };
  });

  it('counts a signup once for a brand-new account (no role on the server yet)', async () => {
    api.hasSavedUserType.mockResolvedValue(false);
    finishOnboarding();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/studio', { replace: true }));
    expect(ph.trackSignup).toHaveBeenCalledTimes(1);
    expect(ph.trackSignup).toHaveBeenCalledWith('google', 'new@example.com');
    expect(hc.trackHeyCatchSignupCompleted).toHaveBeenCalledTimes(1);
    expect(hc.trackHeyCatchSignupCompleted).toHaveBeenCalledWith({ user_type: 'freelancer' });
    expect(ph.trackUserTypeSelected).toHaveBeenCalledWith({ user_type: 'freelancer' });
  });

  it('does not count a returning user onboarding again on a new device', async () => {
    api.hasSavedUserType.mockResolvedValue(true);
    finishOnboarding();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/studio', { replace: true }));
    expect(ph.trackSignup).not.toHaveBeenCalled();
    expect(hc.trackHeyCatchSignupCompleted).not.toHaveBeenCalled();
    // Role selection itself is still reported, as before.
    expect(ph.trackUserTypeSelected).toHaveBeenCalledWith({ user_type: 'freelancer' });
  });

  it('does not count a signup when the server cannot say, and onboarding still completes', async () => {
    api.hasSavedUserType.mockResolvedValue(null);
    finishOnboarding();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/studio', { replace: true }));
    expect(ph.trackSignup).not.toHaveBeenCalled();
    expect(hc.trackHeyCatchSignupCompleted).not.toHaveBeenCalled();
    expect(api.markOnboardingComplete).toHaveBeenCalledWith('u1');
  });

  it('checks the server before saving, so the save can never make a new user look returning', async () => {
    const order: string[] = [];
    api.hasSavedUserType.mockImplementation(async () => { order.push('check'); return false; });
    api.saveUserType.mockImplementation(async () => { order.push('save'); });
    finishOnboarding();
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(order).toEqual(['check', 'save']);
  });

  it('sends no signup when saving the role fails', async () => {
    api.hasSavedUserType.mockResolvedValue(false);
    api.saveUserType.mockRejectedValueOnce(new Error('500'));
    finishOnboarding();
    await screen.findByText(/something went wrong/i);
    expect(ph.trackSignup).not.toHaveBeenCalled();
    expect(hc.trackHeyCatchSignupCompleted).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('RolePicker destination after onboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.isOnboardingComplete.mockReturnValue(false);
    api.hasSavedUserType.mockResolvedValue(false);
    api.saveUserType.mockResolvedValue(undefined);
  });

  it('goes on to the page the user was heading to', async () => {
    routerLocation.current = { state: { from: '/image-to-cad?ref=hero' } };
    finishOnboarding();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/image-to-cad?ref=hero', { replace: true }));
  });

  it('goes to the studio, as before, when there is no destination', async () => {
    routerLocation.current = { state: null };
    finishOnboarding();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/studio', { replace: true }));
  });

  it('never goes to an unsafe destination', async () => {
    routerLocation.current = { state: { from: '//evil.example' } };
    finishOnboarding();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/studio', { replace: true }));
  });

  it('sends an already-onboarded user straight on to their destination', async () => {
    api.isOnboardingComplete.mockReturnValue(true);
    routerLocation.current = { state: { from: '/credits' } };
    render(<RolePicker />);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/credits', { replace: true }));
  });
});
