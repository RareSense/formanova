import { useState, useEffect, lazy, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthContext';
import { isOnboardingComplete } from '@/lib/onboarding-api';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import type { BrandDetails } from '@/components/JewelryBrandModal';

const JewelryBrandModal = lazy(() =>
  import('@/components/JewelryBrandModal').then((m) => ({ default: m.JewelryBrandModal })),
);

const PROMPT_SEEN_KEY_PREFIX = 'formanova_brand_prompt_v1_';

/** Paths where interrupting with a brand prompt would be wrong. */
const SKIP_PATHS = [
  '/', '/login', '/oauth-callback', '/feedback', '/link',
  '/ai-jewelry-photoshoot', '/ai-jewelry-cad', '/ai-jewelry-photography-comparison',
  '/onboarding', '/onboarding-welcome', '/brand-details',
];

/**
 * One-time brand-details prompt for EXISTING jewelry_brand users who onboarded
 * before the brand fields existed (new users provide them during onboarding).
 * Shown once; dismissing it never re-prompts. They can always use the
 * Brand Details page from the profile menu later.
 */
export function BrandPromptHandler() {
  const { user, initializing } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const skip = SKIP_PATHS.includes(location.pathname) || location.pathname.startsWith('/blog/');

  useEffect(() => {
    if (initializing || !user || skip || open) return;
    if (!isOnboardingComplete(user.id)) return;
    if (localStorage.getItem(PROMPT_SEEN_KEY_PREFIX + user.id) === 'true') return;

    let cancelled = false;
    authenticatedFetch('/api/user/profile')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.user_type === 'jewelry_brand' && !data.brand_name) {
          setOpen(true);
        } else {
          // Not a brand user, or brand already set — never ask again.
          localStorage.setItem(PROMPT_SEEN_KEY_PREFIX + user.id, 'true');
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // Excluded deps: `user` (object identity changes on every auth refresh; user?.id covers the
    // meaningful change) and `open` (only read to skip re-fetching while the modal is showing;
    // re-running on open change would refetch the profile pointlessly). Safe because the effect
    // is idempotent: it re-checks localStorage and profile state on every run. Regression to
    // watch: prompt not appearing after a same-session logout/login as a different user
    // (user?.id covers this).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initializing, user?.id, skip]);

  const markSeen = () => {
    if (user) localStorage.setItem(PROMPT_SEEN_KEY_PREFIX + user.id, 'true');
    setOpen(false);
  };

  const handleContinue = async (details: BrandDetails) => {
    const body: Record<string, unknown> = { brand_name: details.brand_name };
    if (details.website_url) body.website_url = details.website_url;
    if (details.store_url) body.store_url = details.store_url;
    if (details.social_links.length) body.social_links = details.social_links;
    if (details.based_in) body.based_in = details.based_in;
    if (details.target_markets.length) body.target_markets = details.target_markets;
    try {
      await authenticatedFetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      // Non-blocking: they can finish from the Brand Details page anytime.
    }
    markSeen();
    // The CTA says "Continue to Studio" — honor it.
    navigate('/studio');
  };

  if (!open) return null;

  return (
    <Suspense fallback={null}>
      <JewelryBrandModal open={open} onClose={markSeen} onContinue={handleContinue} />
    </Suspense>
  );
}
