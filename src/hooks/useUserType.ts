import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getCachedUserType, type UserType } from '@/lib/onboarding-api';

/**
 * The signed-in user's user_type ('jewelry_brand' etc.), session-cached.
 * Null while loading, signed out, or unknown.
 */
export function useUserType(): UserType | null {
  const { user, initializing } = useAuth();
  const userId = user?.id ?? null;
  const [userType, setUserType] = useState<UserType | null>(null);

  useEffect(() => {
    if (initializing || !userId) {
      setUserType(null);
      return;
    }
    let cancelled = false;
    void getCachedUserType(userId).then((type) => {
      if (!cancelled) setUserType(type);
    });
    return () => { cancelled = true; };
  }, [initializing, userId]);

  return userType;
}
