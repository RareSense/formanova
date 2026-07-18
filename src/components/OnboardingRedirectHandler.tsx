import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthContext';
import { resolveOnboardingCompletion } from '@/lib/onboarding-api';

const ONBOARDING_PUBLIC_PATHS = [
  '/',
  '/login',
  '/oauth-callback',
  '/feedback',
  '/link',
  '/ai-jewelry-photoshoot',
  '/ai-jewelry-cad',
  '/ai-jewelry-photography-comparison',
];

export function OnboardingRedirectHandler() {
  const { user, initializing } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (initializing || !user) return;
    if (location.pathname === '/onboarding' || location.pathname === '/onboarding-welcome') return;

    const isPublic = ONBOARDING_PUBLIC_PATHS.includes(location.pathname)
      || location.pathname.startsWith('/blog/');
    if (isPublic) return;

    let cancelled = false;

    void resolveOnboardingCompletion(user.id)
      .then((completed) => {
        if (cancelled || completed) return;
        navigate('/onboarding', { replace: true });
      })
      .catch(() => {
        if (cancelled) return;
        navigate('/onboarding', { replace: true });
      });

    return () => {
      cancelled = true;
    };
  }, [initializing, location.pathname, navigate, user]);

  return null;
}
