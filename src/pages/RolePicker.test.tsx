import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

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

/** Never settles: a server that does not answer. */
const hang = () => new Promise<boolean | null>(() => {});

function answerQuestion() {
  fireEvent.click(screen.getByRole('button', { name: /freelancer/i }));
  fireEvent.click(screen.getByRole('button', { name: /i agree to the/i }));
  fireEvent.click(screen.getByRole('button', { name: /^continue$/i }));
}

async function finishOnboarding() {
  render(<RolePicker />);
  await screen.findByRole('button', { name: /freelancer/i });
  answerQuestion();
}

beforeEach(() => {
  vi.clearAllMocks();
  api.isOnboardingComplete.mockReturnValue(false);
  api.hasSavedUserType.mockReset();
  api.hasSavedUserType.mockResolvedValue(false);
  api.saveUserType.mockReset();
  api.saveUserType.mockResolvedValue(undefined);
  routerLocation.current = { state: null };
});

describe('RolePicker: who is asked', () => {
  it('asks a brand-new account (no role on the server yet)', async () => {
    render(<RolePicker />);
    expect(await screen.findByText(/what best describes you/i)).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows a spinner, not the question, while the server is checked', () => {
    api.hasSavedUserType.mockImplementation(hang);
    render(<RolePicker />);
    expect(screen.queryByText(/what best describes you/i)).toBeNull();
    expect(screen.getByLabelText(/loading/i)).toBeTruthy();
  });

  it('never asks a returning user on a new device: remembers them here and sends them on', async () => {
    api.hasSavedUserType.mockResolvedValue(true);
    routerLocation.current = { state: { from: '/image-to-cad' } };
    render(<RolePicker />);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/image-to-cad', { replace: true }));
    expect(api.markOnboardingComplete).toHaveBeenCalledWith('u1');
    expect(screen.queryByText(/what best describes you/i)).toBeNull();
    expect(api.saveUserType).not.toHaveBeenCalled();
    expect(ph.trackSignup).not.toHaveBeenCalled();
    expect(hc.trackHeyCatchSignupCompleted).not.toHaveBeenCalled();
  });

  it('asks when the server cannot say', async () => {
    api.hasSavedUserType.mockResolvedValue(null);
    render(<RolePicker />);
    expect(await screen.findByText(/what best describes you/i)).toBeTruthy();
    expect(api.markOnboardingComplete).not.toHaveBeenCalled();
  });

  it('sends an already-onboarded user straight on, without asking the server', async () => {
    api.isOnboardingComplete.mockReturnValue(true);
    routerLocation.current = { state: { from: '/credits' } };
    render(<RolePicker />);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/credits', { replace: true }));
    expect(api.hasSavedUserType).not.toHaveBeenCalled();
  });
});

describe('RolePicker: slow server', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
  afterEach(() => { vi.useRealTimers(); });

  it('asks anyway after 3 seconds, and Continue still finishes without counting a signup', async () => {
    api.hasSavedUserType.mockImplementation(hang);
    render(<RolePicker />);
    expect(screen.queryByText(/what best describes you/i)).toBeNull();
    act(() => { vi.advanceTimersByTime(3000); });
    await screen.findByText(/what best describes you/i);
    answerQuestion();
    await act(async () => { vi.advanceTimersByTime(3000); });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/studio', { replace: true }));
    expect(api.saveUserType).toHaveBeenCalled();
    expect(ph.trackSignup).not.toHaveBeenCalled();
  });

  it('a late "returning" answer never pulls someone away mid-choice', async () => {
    let answer: (v: boolean) => void = () => {};
    api.hasSavedUserType.mockImplementation(() => new Promise((r) => { answer = r; }));
    render(<RolePicker />);
    act(() => { vi.advanceTimersByTime(3000); });
    await screen.findByText(/what best describes you/i);
    await act(async () => { answer(true); });
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByText(/what best describes you/i)).toBeTruthy();
  });
});

describe('RolePicker: signup events', () => {
  it('counts a signup once for a brand-new account', async () => {
    await finishOnboarding();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/studio', { replace: true }));
    expect(ph.trackSignup).toHaveBeenCalledTimes(1);
    expect(ph.trackSignup).toHaveBeenCalledWith('google', 'new@example.com');
    expect(hc.trackHeyCatchSignupCompleted).toHaveBeenCalledTimes(1);
    expect(hc.trackHeyCatchSignupCompleted).toHaveBeenCalledWith({ user_type: 'freelancer' });
    expect(ph.trackUserTypeSelected).toHaveBeenCalledWith({ user_type: 'freelancer' });
    expect(api.markOnboardingComplete).toHaveBeenCalledWith('u1');
  });

  it('does not count a signup when the server cannot say, and onboarding still completes', async () => {
    api.hasSavedUserType.mockResolvedValue(null);
    await finishOnboarding();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/studio', { replace: true }));
    expect(ph.trackSignup).not.toHaveBeenCalled();
    expect(hc.trackHeyCatchSignupCompleted).not.toHaveBeenCalled();
    expect(api.markOnboardingComplete).toHaveBeenCalledWith('u1');
  });

  it('checks the server before saving, so the save can never make a new user look returning', async () => {
    const order: string[] = [];
    api.hasSavedUserType.mockImplementation(async () => { order.push('check'); return false; });
    api.saveUserType.mockImplementation(async () => { order.push('save'); });
    await finishOnboarding();
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(order).toEqual(['check', 'save']);
  });

  it('sends no signup when saving the role fails', async () => {
    api.saveUserType.mockRejectedValueOnce(new Error('500'));
    await finishOnboarding();
    await screen.findByText(/something went wrong/i);
    expect(ph.trackSignup).not.toHaveBeenCalled();
    expect(hc.trackHeyCatchSignupCompleted).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('RolePicker: destination after onboarding', () => {
  it('goes on to the page the user was heading to', async () => {
    routerLocation.current = { state: { from: '/image-to-cad?ref=hero' } };
    await finishOnboarding();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/image-to-cad?ref=hero', { replace: true }));
  });

  it('goes to the studio, as before, when there is no destination', async () => {
    await finishOnboarding();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/studio', { replace: true }));
  });

  it('never goes to an unsafe destination', async () => {
    routerLocation.current = { state: { from: '//evil.example' } };
    await finishOnboarding();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/studio', { replace: true }));
  });
});
