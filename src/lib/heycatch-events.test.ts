import { describe, it, expect, vi, beforeEach } from 'vitest';

const sdk = vi.hoisted(() => ({ analytics: { trackEvent: vi.fn() as (...args: unknown[]) => void } }));
vi.mock('@heycatch/sdk', () => sdk);

import { trackHeyCatchSignupCompleted } from './heycatch-events';

describe('trackHeyCatchSignupCompleted', () => {
  beforeEach(() => {
    sdk.analytics.trackEvent = vi.fn();
  });

  it('sends signup_completed with the chosen user type', () => {
    trackHeyCatchSignupCompleted({ user_type: 'jewelry_brand' });
    expect(sdk.analytics.trackEvent).toHaveBeenCalledTimes(1);
    expect(sdk.analytics.trackEvent).toHaveBeenCalledWith('signup_completed', { user_type: 'jewelry_brand' });
  });

  it('never throws, so analytics can never block onboarding', () => {
    // A plain function: Vitest fails a test when a vi.fn throws, even if the error is caught.
    let calls = 0;
    sdk.analytics.trackEvent = () => {
      calls += 1;
      throw new Error('sdk down');
    };
    expect(() => trackHeyCatchSignupCompleted({ user_type: 'freelancer' })).not.toThrow();
    expect(calls).toBe(1);
  });
});
