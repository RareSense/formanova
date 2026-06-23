// Hook for the starter-pack pricing A/B experiment.
//
// Reads the PostHog variant only once flags are ready, and only when `enabled`
// (the caller's eligibility check) is true — so the exposure ($feature_flag_called)
// fires only for the experiment's real population. `ready` stays false until
// flags load, letting the page hold a loader instead of rendering one variant
// then flipping to the other (no control->treatment flash).
//
// Default-safe: a missing/off flag (or PostHog not loaded) yields `variant`
// undefined, which callers treat as "show the Starter Pack page" — i.e. current
// behaviour, no regression.

import { useEffect, useState } from 'react';
import { getStarterPackPricingVariant, onPostHogFlagsLoaded } from '@/lib/posthog-events';

export function useStarterPackPricingVariant(enabled: boolean): {
  variant: string | undefined;
  ready: boolean;
} {
  const [variant, setVariant] = useState<string | undefined>(undefined);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const unsubscribe = onPostHogFlagsLoaded(() => {
      setVariant(getStarterPackPricingVariant());
      setReady(true);
    });
    return unsubscribe;
  }, [enabled]);

  return { variant, ready };
}
