import { useAuth } from '@/contexts/AuthContext';
import { isRubyCallConfigured, isRubyCallEnabled } from '@/lib/feature-flags';

/**
 * Whether the Done For You card shows on /pricing.
 * Signed-in: only allowlisted emails. Signed-out: email unknown, so show the
 * card only while the feature is configured; login decides who keeps it.
 */
export function useDoneForYouVisible(): boolean {
  const { user } = useAuth();
  return user ? isRubyCallEnabled(user.email) : isRubyCallConfigured();
}
