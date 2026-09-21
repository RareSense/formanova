import { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useCredits } from '@/contexts/CreditsContext';
import { toast } from '@/hooks/use-toast';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { useBillingLocale } from '@/hooks/use-billing-locale';
import { isStarterTier, type BillingTier } from '@/lib/starter-pack';
import { CreditPlanGrid } from '@/components/pricing/CreditPlanGrid';
import creditCoinIcon from '@/assets/icons/credit-coin.png';

const CHECKOUT_URL = '/billing/checkout';

export default function Pricing() {
  const { user } = useAuth();
  const { credits } = useCredits();
  const [searchParams] = useSearchParams();
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [errorTier, setErrorTier] = useState<string | null>(null);
  const [tiers, setTiers] = useState<BillingTier[]>([]);
  const [tiersLoading, setTiersLoading] = useState(true);
  const [unavailableTier, setUnavailableTier] = useState<string | null>(null);
  const { currency, symbol, country } = useBillingLocale();
  const isINR = currency === 'INR';

  const returnTo = searchParams.get('redirect') || '/studio';
  // Back affordance returns the user to wherever the credit gate interrupted them
  // (the studio / history page), not a generic Dashboard, so in-progress work is
  // never a dead-end. Falls back to Dashboard for direct visits with no redirect.
  const redirectParam = searchParams.get('redirect');
  const backTo = redirectParam && redirectParam.startsWith('/') ? redirectParam : '/dashboard';
  const backLabel = redirectParam ? 'Back' : 'Dashboard';

  const fetchTiers = useCallback(async () => {
    setTiersLoading(true);
    try {
      const res = await authenticatedFetch('/billing/tiers');
      if (!res.ok) {
        setTiers([]);
        return;
      }
      const data: BillingTier[] = await res.json();
      const filtered = data.filter(t => t.tier_id !== 'tier_3519ba8c');
      const sorted = [...filtered].sort((a, b) =>
        isStarterTier(a) ? -1 : isStarterTier(b) ? 1 : 0
      );
      setTiers(sorted);
      setUnavailableTier(null);
    } catch {
      setTiers([]);
    } finally {
      setTiersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchTiers();
  }, [user, fetchTiers]);

  const handleCheckout = async (tierId: string) => {
    if (!user?.id) {
      toast({ title: 'Please sign in first', variant: 'destructive' });
      return;
    }
    if (loadingTier) return;

    setLoadingTier(tierId);
    setErrorTier(null);
    setUnavailableTier(null);

    try {
      const response = await authenticatedFetch(CHECKOUT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier_id: tierId, redirect: returnTo.startsWith('/') ? returnTo : '/studio', ...(country ? { country } : {}) }),
      });

      if (response.status === 404) {
        setUnavailableTier(tierId);
        setLoadingTier(null);
        fetchTiers();
        return;
      }
      if (!response.ok) {
        const errorBody = await response.text();
        console.error('[Checkout] Response error:', response.status, errorBody);
        throw new Error('Checkout failed');
      }

      const data = await response.json();
      const url = data.url;
      if (!url) throw new Error('No checkout URL in response');
      window.location.href = url;
    } catch (error) {
      console.error('Checkout failed:', error);
      setErrorTier(tierId);
      setLoadingTier(null);
    }
  };

  // 4 cards when the backend still returns the one-time Starter tier (user never
  // bought it), otherwise the 3 standard plans.
  const maxWidthClass = tiers.length === 4 ? 'max-w-7xl' : 'max-w-5xl';

  return (
    <>
      <Helmet>
        <title>Pricing | FormaNova AI Jewelry Studio</title>
        <meta name="description" content="Choose a credit plan for AI jewelry photoshoots and CAD generation. Plans from $9. Upgrade or cancel anytime." />
        <link rel="canonical" href="/pricing" />
      </Helmet>
    <div className="min-h-[calc(100vh-5rem)] bg-background py-6 px-6 md:px-12 lg:px-16">
      <div className={`${maxWidthClass} mx-auto`}>

        {/* Header — matches Dashboard/Generations style */}
        <div className="mb-10 flex items-end justify-between">
          <div>
            <Link
              to={backTo}
              className="inline-flex items-center gap-1.5 font-mono text-[9px] tracking-[0.3em] text-muted-foreground uppercase hover:text-foreground transition-colors mb-2"
            >
              <ArrowLeft className="h-3 w-3" />
              {backLabel}
            </Link>
            <div className="flex items-center gap-4 mt-1">
              <img src={creditCoinIcon} alt="" className="h-10 w-10 object-contain" />
              <h1 className="font-display text-4xl md:text-5xl lg:text-6xl uppercase tracking-wide text-foreground leading-none">
                Get Credits
              </h1>
            </div>
          </div>
          {credits !== null && (
            <p className="hidden md:block font-mono text-[9px] tracking-[0.2em] text-muted-foreground uppercase">
              Balance: {credits} credits
            </p>
          )}
        </div>

        {/* Plans */}
        {tiersLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <CreditPlanGrid
            tiers={tiers}
            isINR={isINR}
            symbol={symbol}
            currency={currency}
            loadingTier={loadingTier}
            unavailableTier={unavailableTier}
            errorTier={errorTier}
            onCheckout={handleCheckout}
          />
        )}

      </div>
    </div>
    </>
  );
}
