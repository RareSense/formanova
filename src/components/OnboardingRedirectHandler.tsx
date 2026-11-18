import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { isOnboardingComplete } from '@/lib/onboarding-api';

const ONBOARDING_PUBLIC_PATHS = [
  '/', '/login', '/oauth-callback', '/feedback', '/link',
  '/ai-jewelry-photoshoot', '/ai-jewelry-cad', '/ai-jewelry-photography-comparison',
];

/**
 * Redirects gated users to /onboarding before their first protected-page visit.
 * Passes the page they were heading to as `state.from`, so onboarding can send
 * them on there afterwards (see onboardingReturnPath).
 */
export function OnboardingRedirectHandler() {
  const { user, initializing } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const userId = user?.id;

  useEffect(() => {
    if (initializing) return;
    if (!userId) return;
    if (location.pathname === '/onboarding' || location.pathname === '/onboarding-welcome') return;
    if (isOnboardingComplete(userId)) return;
    const isPublic = ONBOARDING_PUBLIC_PATHS.includes(location.pathname)
      || location.pathname.startsWith('/blog/');
    if (isPublic) return;
    navigate('/onboarding', { replace: true, state: { from: location.pathname + location.search } });
  }, [initializing, userId, location.pathname, location.search, navigate]);

  return null;
}
