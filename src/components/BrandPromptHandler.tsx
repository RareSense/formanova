import { useState, useEffect, lazy, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthContext';
import { isOnboardingComplete, setCachedUserType } from '@/lib/onboarding-api';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { toast } from '@/hooks/use-toast';
import type { BrandDetails } from '@/components/JewelryBrandModal';
import { urlMatchesHost } from '@/components/brand/social-icons';

const JewelryBrandModal = lazy(() =>
  import('@/components/JewelryBrandModal').then((m) => ({ default: m.JewelryBrandModal })),
);

const PROMPT_SEEN_KEY_PREFIX = 'formanova_brand_prompt_v2_';

function hasInstagramProfile(socialLinks: unknown): boolean {
  return Array.isArray(socialLinks)
    && socialLinks.some((link) => typeof link === 'string' && urlMatchesHost(link, 'instagram.com'));
}

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
  const [initialDetails, setInitialDetails] = useState<BrandDetails | undefined>();

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
        setCachedUserType(user.id, data.user_type ?? null);
        const missingBrandName = !String(data.brand_name ?? '').trim();
        const hasPrimaryChannel = Boolean(
          String(data.website_url ?? '').trim()
          || String(data.storefront_url ?? '').trim()
          || String(data.physical_location ?? '').trim()
          || hasInstagramProfile(data.social_links),
        );
        const missingSalesChannel = !hasPrimaryChannel;
        if (data.user_type === 'jewelry_brand' && (missingBrandName || missingSalesChannel)) {
          setInitialDetails({
            brand_name: data.brand_name ?? '',
            website_url: data.website_url ?? '',
            physical_location: data.physical_location ?? '',
            social_links: data.social_links ?? [],
            based_in: data.based_in ?? '',
            target_markets: data.target_markets ?? [],
          });
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
    if (details.physical_location) body.physical_location = details.physical_location;
    if (details.social_links.length) body.social_links = details.social_links;
    if (details.based_in) body.based_in = details.based_in;
    if (details.target_markets.length) body.target_markets = details.target_markets;
    try {
      await authenticatedFetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      toast({
        title: 'Saved',
        description: 'You can always edit or delete these details later from your profile menu.',
      });
    } catch {
      toast({
        title: 'Could not save',
        description: 'Please try again before continuing.',
        variant: 'destructive',
      });
      return;
    }
    markSeen();
    // The CTA says "Continue to Studio" — honor it.
    navigate('/studio');
  };

  if (!open) return null;

  return (
    <Suspense fallback={null}>
      <JewelryBrandModal
        source="studio_prompt"
        open={open}
        onClose={markSeen}
        onContinue={handleContinue}
        initial={initialDetails}
        dismissible={false}
      />
    </Suspense>
  );
}
