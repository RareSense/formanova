import React, { createContext, useContext, useEffect, useState } from 'react';

import { trackLogin, trackLogout, identifyUser, trackButtonLabelExperimentExposure } from '@/lib/posthog-events';
import { 
  authApi, 
  getStoredToken, 
  getStoredUser, 
  AUTH_STATE_CHANGE_EVENT,
  type AuthUser 
} from '@/lib/auth-api';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  initializing: boolean;
  signInWithGoogle: () => void;
  signOut: () => Promise<void>;
  getAuthHeader: () => Record<string, string>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Initialize from localStorage synchronously (instant load)
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
  const [loading, setLoading] = useState(false);
  // If we already have a stored user + token, skip the loading spinner entirely
  // and validate in the background. Only block rendering when there's nothing cached.
  const [initializing, setInitializing] = useState(() => !(getStoredUser() && getStoredToken()));

  useEffect(() => {
    // Listen for auth state changes from AuthCallback (fixes race condition)
    const handleAuthChange = (event: CustomEvent<{ user: AuthUser | null }>) => {
      console.log('[AuthContext] Auth state change event received:', event.detail.user?.email);
      const u = event.detail.user;
      setUser(u);
      if (u) {
        identifyUser(u.id, { email: u.email, name: u.full_name });
        trackButtonLabelExperimentExposure();
        trackLogin('google', u.email);
      }
    };

    window.addEventListener(AUTH_STATE_CHANGE_EVENT, handleAuthChange as EventListener);

    // Also listen for storage events (cross-tab sync)
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'formanova_auth_user' || event.key === 'formanova_auth_token') {
        console.log('[AuthContext] Storage change detected');
        const updatedUser = getStoredUser();
        setUser(updatedUser);
      }
    };

    window.addEventListener('storage', handleStorageChange);

    // Background validation - non-destructive
    // Never auto-logout on token expiry; only explicit signOut clears session
    const validateSession = async () => {
      const token = getStoredToken();
      
      if (token) {
        try {
          const currentUser = await authApi.getCurrentUser();
          if (currentUser) {
            setUser(currentUser);
            // Identify returning users so PostHog links them to their email
            identifyUser(currentUser.id, { email: currentUser.email, name: currentUser.full_name });
          } else {
            // Keep existing local session; token-only auth is handled by guards + API 401s.
            const cachedUser = getStoredUser();
            if (cachedUser) setUser(cachedUser);
          }
        } catch (error) {
          // Network error / timeout — keep existing session
          console.warn('[AuthContext] Background validation failed (network), keeping session:', error);
        }
      } else if (!getStoredUser()) {
        // No token AND no stored user — clean state
        setUser(null);
      }
      setInitializing(false);
    };

    validateSession();

    return () => {
      window.removeEventListener(AUTH_STATE_CHANGE_EVENT, handleAuthChange as EventListener);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const signInWithGoogle = async () => {
    try {
      await authApi.initiateGoogleLogin();
    } catch (error) {
      console.error('[AuthContext] Google sign-in failed:', error);
      // Error already logged to console above
    }
  };

  const signOut = async () => {
    trackLogout();
    await authApi.logout();
    setUser(null);
  };

  const getAuthHeader = () => {
    return authApi.getAuthHeader();
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading,
      initializing,
      signInWithGoogle, 
      signOut,
      getAuthHeader 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
