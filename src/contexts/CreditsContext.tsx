import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { fetchBalance, type CreditBalance } from '@/lib/credits-api';
import { AuthExpiredError } from '@/lib/authenticated-fetch';

interface CreditDelta {
  amount: number; // positive = gained, negative = spent
  id: number;     // unique key to trigger animations
}

interface CreditsContextType {
  credits: number | null;
  loading: boolean;
  refreshCredits: () => Promise<void>;
  /** Last balance change — use to show animated +/- badge */
  lastDelta: CreditDelta | null;
}

const CreditsContext = createContext<CreditsContextType | undefined>(undefined);
const CREDITS_REFRESH_INTERVAL_MS = 15_000;

let deltaCounter = 0;

export function CreditsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [credits, setCredits] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastDelta, setLastDelta] = useState<CreditDelta | null>(null);
  const prevCreditsRef = useRef<number | null>(null);
  const isInitialLoadRef = useRef(true);

  const refreshCredits = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const data = await fetchBalance();
      setCredits(data.balance);
    } catch (error: any) {
      if (error instanceof AuthExpiredError) {
        setCredits(null);
        return;
      }
      console.warn('[Credits] Failed to fetch balance:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Detect balance changes and emit delta
  useEffect(() => {
    if (credits === null) {
      prevCreditsRef.current = null;
      isInitialLoadRef.current = true;
      return;
    }

    const prev = prevCreditsRef.current;
    prevCreditsRef.current = credits;

    // Skip the very first load — no delta to show
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      return;
    }

    if (prev !== null && prev !== credits) {
      const amount = credits - prev;
      setLastDelta({ amount, id: ++deltaCounter });
    }
  }, [credits]);

  useEffect(() => {
    if (user?.id) {
      refreshCredits();
    } else {
      setCredits(null);
    }
  }, [user?.id, refreshCredits]);

  useEffect(() => {
    if (!user?.id) return;

    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshCredits().catch(() => {});
      }
    };

    const intervalId = window.setInterval(() => {
      refreshIfVisible();
    }, CREDITS_REFRESH_INTERVAL_MS);

    window.addEventListener('focus', refreshIfVisible);
    document.addEventListener('visibilitychange', refreshIfVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshIfVisible);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [user?.id, refreshCredits]);

  return (
    <CreditsContext.Provider value={{ credits, loading, refreshCredits, lastDelta }}>
      {children}
    </CreditsContext.Provider>
  );
}

export function useCredits() {
  const context = useContext(CreditsContext);
  if (context === undefined) {
    throw new Error('useCredits must be used within a CreditsProvider');
  }
  return context;
}
