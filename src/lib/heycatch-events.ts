import { analytics } from '@heycatch/sdk';
import type { UserType } from '@/lib/onboarding-api';

// HeyCatch product events (PostHog events live in posthog-events.ts).
// The SDK is a no-op until init(), which runs on the live site only (main.tsx),
// so dev and staging send nothing. Each call is wrapped so analytics can never
// break the flow it reports on.

/** A new user finished onboarding: their HeyCatch signup success event. */
export function trackHeyCatchSignupCompleted(props: { user_type: UserType }) {
  try {
    analytics.trackEvent('signup_completed', props);
  } catch {
    // Analytics must never block onboarding.
  }
}
