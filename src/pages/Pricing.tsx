import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useCredits } from '@/contexts/CreditsContext';
import { toast } from '@/hooks/use-toast';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { useBillingLocale } from '@/hooks/use-billing-locale';
import creditCoinIcon from '@/assets/icons/credit-coin.png';

const CHECKOUT_URL = '/billing/checkout';

const PLANS = [
  {
    tier: 'basic',
    tierId: 'tier_5e6c6184',
    name: 'Basic',
    price: 9,
    credits: 100,
    photos: 10,
    perPhoto: '$0.99',
    inrPrice: 999,
    inrPerPhoto: '₹99.9',
  },
  {
    tier: 'standard',
    tierId: 'tier_6867e598',
    name: 'Standard',
    price: 39,
    credits: 500,
    photos: 50,
    perPhoto: '$0.78',
    inrPrice: 3499,
    inrPerPhoto: '₹69.9',
  },
  {
    tier: 'pro',
    tierId: 'tier_a80444ac',
    name: 'Pro',
    price: 99,
    credits: 1500,
    photos: 150,
    perPhoto: '$0.66',
    inrPrice: 8999,
    inrPerPhoto: '₹59.9',
  },
];

interface BillingTier {
  tier_id: string;
  name: string;
  type: string;
  credits: number;
}

const PLAN_BY_CREDITS = Object.fromEntries(PLANS.map(p => [p.credits, p])) as Record<number, typeof PLANS[0]>;

function isStarterTier(t: BillingTier): boolean {
  return !PLAN_BY_CREDITS[t.credits];
}

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

  const fetchTiers = useCallback(async () => {
    setTiersLoading(true);
    try {
      const res = await authenticatedFetch('/billing/tiers');
      if (!res.ok) {
        setTiers([]);
        return;
      }
      const data: BillingTier[] = await res.json();
      const sorted = [...data].sort((a, b) =>
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

  const gridTiers: BillingTier[] =
    tiers.length > 0
      ? tiers
      : PLANS.map(p => ({ tier_id: p.tierId, name: p.name, type: 'subscription', credits: p.credits }));

  const colsClass = gridTiers.length === 4 ? 'md:grid-cols-4' : 'md:grid-cols-3';

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-background py-6 px-6 md:px-12 lg:px-16">
      <div className="max-w-5xl mx-auto">

        {/* Header — matches Dashboard/Generations style */}
        <div className="mb-10 flex items-end justify-between">
          <div>
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 font-mono text-[9px] tracking-[0.3em] text-muted-foreground uppercase hover:text-foreground transition-colors mb-2"
            >
              <ArrowLeft className="h-3 w-3" />
              Dashboard
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
          <>
            <div className={`grid grid-cols-1 ${colsClass} gap-6`}>
              {gridTiers.map((tier) => {
                if (isStarterTier(tier)) {
                  return (
                    <div
                      key={tier.tier_id}
                      className="p-8 flex flex-col gap-8 border-2 border-foreground"
                    >
                      <div>
                        <span className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground uppercase italic">
                          One-time offer only
                        </span>
                      </div>

                      <div>
                        <div className="flex items-baseline gap-1">
                          <span
                            className="font-display text-2xl uppercase tracking-tight text-muted-foreground"
                            style={{ textDecoration: 'line-through', textDecorationThickness: '1.5px' }}
                          >
                            $5
                          </span>
                          <span className="font-display text-5xl uppercase tracking-tight text-foreground">
                            $2
                          </span>
                          <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                            USD
                          </span>
                        </div>
                        <p className="font-mono text-[10px] tracking-wider text-muted-foreground mt-1">
                          One per account
                        </p>
                      </div>

                      <div className="border-t border-border/30 pt-5 space-y-2">
                        <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
                          You get
                        </p>
                        <p className="font-mono text-xl text-foreground">
                          50 credits
                        </p>
                        <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
                          Generate up to 5 photos
                        </p>
                      </div>

                      <div className="mt-auto pt-2">
                        <Button
                          className="w-full font-mono text-[10px] tracking-[0.2em] uppercase"
                          size="lg"
                          variant="default"
                          disabled={loadingTier !== null}
                          onClick={() => handleCheckout(tier.tier_id)}
                        >
                          {loadingTier === tier.tier_id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            'Buy 50 credits'
                          )}
                        </Button>
                        {unavailableTier === tier.tier_id && (
                          <p className="font-mono text-[9px] tracking-wider text-destructive mt-2">
                            Offer unavailable.
                          </p>
                        )}
                        {errorTier === tier.tier_id && (
                          <p className="font-mono text-[9px] tracking-wider text-destructive mt-2">
                            Checkout failed. Please try again.
                          </p>
                        )}
                      </div>
                    </div>
                  );
                }

                const plan = PLAN_BY_CREDITS[tier.credits];
                if (!plan) return null;

                return (
                  <div
                    key={tier.tier_id}
                    className="p-8 flex flex-col gap-8 border-2 border-foreground"
                  >
                    {/* Plan name */}
                    <div>
                      <span className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground uppercase">
                        {plan.name}
                      </span>
                    </div>

                    {/* Price */}
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="font-display text-5xl uppercase tracking-tight text-foreground">
                          {isINR ? `${symbol}${plan.inrPrice.toLocaleString('en-IN')}` : `$${plan.price}`}
                        </span>
                        <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                          {currency}
                        </span>
                      </div>
                      <p className="font-mono text-[10px] tracking-wider text-muted-foreground mt-1">
                        {isINR ? plan.inrPerPhoto : plan.perPhoto} per photo
                      </p>
                    </div>

                    {/* What you get */}
                    <div className="border-t border-border/30 pt-5 space-y-2">
                      <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
                        You get
                      </p>
                      <p className="font-mono text-xl text-foreground">
                        {plan.credits.toLocaleString()} credits
                      </p>
                      <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
                        Generate up to {plan.photos} photos
                      </p>
                    </div>

                    {/* CTA */}
                    <div className="mt-auto pt-2">
                      <Button
                        className="w-full font-mono text-[10px] tracking-[0.2em] uppercase"
                        size="lg"
                        variant="default"
                        disabled={loadingTier !== null}
                        onClick={() => handleCheckout(tier.tier_id)}
                      >
                        {loadingTier === tier.tier_id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          `Buy ${plan.credits.toLocaleString()} Credits`
                        )}
                      </Button>
                      {unavailableTier === tier.tier_id && (
                        <p className="font-mono text-[9px] tracking-wider text-destructive mt-2">
                          Offer unavailable.
                        </p>
                      )}
                      {errorTier === tier.tier_id && (
                        <p className="font-mono text-[9px] tracking-wider text-destructive mt-2">
                          Checkout failed. Please try again.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="font-mono text-[9px] tracking-wider text-muted-foreground mt-4 text-center">
              1 standard photo = 10 credits.&nbsp;&nbsp;Higher-resolution photos use more credits.
            </p>
          </>
        )}

      </div>
    </div>
  );
}
