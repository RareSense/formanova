import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));

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
