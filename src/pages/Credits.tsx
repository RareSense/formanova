import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2, Check, AlertCircle, Gift } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCredits } from '@/contexts/CreditsContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/hooks/use-toast';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { useBillingLocale } from '@/hooks/use-billing-locale';
import creditCoinIcon from '@/assets/icons/credit-coin.png';

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

const CHECKOUT_URL = '/billing/checkout';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4 },
  },
};

export default function Credits() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { credits, loading: creditsLoading, refreshCredits } = useCredits();

  const { currency, symbol, country } = useBillingLocale();
  const isINR = currency === 'INR';

  const [promoCode, setPromoCode] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoResult, setPromoResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [errorTier, setErrorTier] = useState<string | null>(null);
  const [tiers, setTiers] = useState<BillingTier[]>([]);
  const [tiersLoading, setTiersLoading] = useState(true);
  const [unavailableTier, setUnavailableTier] = useState<string | null>(null);

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
    if (!authLoading && !user) {
      navigate('/login');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    refreshCredits();
  }, [refreshCredits]);

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
        body: JSON.stringify({ tier_id: tierId, redirect: '/credits', ...(country ? { country } : {}) }),
      });

      if (response.status === 404) {
        setUnavailableTier(tierId);
        setLoadingTier(null);
        fetchTiers();
        return;
      }
      if (!response.ok) throw new Error('Checkout failed');
      const data = await response.json();
      if (!data.url) throw new Error('No checkout URL');
      window.location.href = data.url;
    } catch {
      setErrorTier(tierId);
      setLoadingTier(null);
    }
  };

  const handleRedeemPromo = async () => {
    if (!promoCode.trim() || promoLoading) return;
    setPromoLoading(true);
    setPromoResult(null);

    try {
      const response = await authenticatedFetch('/api/credits/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: promoCode.trim().toUpperCase() }),
      });

      const data = await response.json();

      if (response.ok && data.status === 'success') {
        setPromoResult({ type: 'success', message: `${data.credits_added} credits added to your account.` });
        setPromoCode('');
        await refreshCredits();
      } else if (response.ok && data.status === 'already_redeemed') {
        setPromoResult({ type: 'error', message: 'You have already used this promo code.' });
      } else {
        // API returns { detail: "..." } for error cases
        const msg = data.detail || 'This promo code is not valid.';
        setPromoResult({ type: 'error', message: msg });
      }
    } catch {
      setPromoResult({ type: 'error', message: 'Something went wrong. Please try again.' });
    } finally {
      setPromoLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const gridTiers: BillingTier[] =
    tiers.length > 0
      ? tiers
      : PLANS.map(p => ({ tier_id: p.tierId, name: p.name, type: 'subscription', credits: p.credits }));

  const colsClass = gridTiers.length === 4 ? 'md:grid-cols-4' : 'md:grid-cols-3';

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-background py-6 px-6 md:px-12 lg:px-16">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-7xl mx-auto"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="mb-10 flex items-end justify-between">
          <div>
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 font-mono text-[9px] tracking-[0.3em] text-muted-foreground uppercase hover:text-foreground transition-colors mb-2"
            >
              <ArrowLeft className="h-3 w-3" />
              Dashboard
            </Link>
            <div className="flex items-center gap-4 mt-1">
              <img src={creditCoinIcon} alt="" className="h-16 w-16 object-contain" />
              <h1 className="font-display text-4xl md:text-5xl lg:text-6xl uppercase tracking-wide text-foreground leading-none">
                My Credits
              </h1>
            </div>
          </div>
        </motion.div>

        {/* Plan + Balance row */}
        <motion.div variants={itemVariants} className="border border-border/30 p-6 mb-12">
          <span className="font-mono text-[9px] tracking-[0.25em] text-muted-foreground uppercase block mb-2">
            Credit Balance
          </span>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-5xl uppercase tracking-tight text-foreground">
              {creditsLoading ? '...' : (credits !== null ? credits.toLocaleString() : '—')}
            </span>
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground">
              credits remaining
            </span>
          </div>
          <p className="font-mono text-[9px] tracking-wider text-muted-foreground mt-3">
            Each photo generation costs ~10 credits
          </p>
        </motion.div>

        {/* Plans */}
        <motion.div variants={itemVariants} className="mb-12">
          <span className="font-mono text-[9px] tracking-[0.3em] text-muted-foreground uppercase block mb-6">
            Get More Credits
          </span>
          {tiersLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className={`grid grid-cols-1 sm:grid-cols-2 ${colsClass} gap-4`}>
                {gridTiers.map((tier) => {
                  if (isStarterTier(tier)) {
                    return (
                      <div
                        key={tier.tier_id}
                        className="p-8 flex flex-col gap-6 border-2 border-foreground"
                      >
                        <div>
                          <motion.span
                            className="inline-block font-mono text-[10px] tracking-[0.25em] text-primary uppercase italic font-bold"
                            animate={{ scale: [1, 1.06, 1], opacity: [1, 0.7, 1] }}
                            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                          >
                            One-time offer only
                          </motion.span>
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
                            $2 per account
                          </p>
                        </div>

                        <div className="border-t border-border/30 pt-5 space-y-2">
                          <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
                            You get
                          </p>
                          <p className="font-mono text-xl text-foreground">
                            {tier.credits} credits
                          </p>
                          <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
                            Generate up to {Math.floor(tier.credits / 10)} photos
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
                              `Buy ${tier.credits} credits`
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
                      className="p-8 flex flex-col gap-6 border-2 border-foreground"
                    >
                      <div>
                        <span className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground uppercase">
                          {plan.name}
                        </span>
                      </div>

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
              <p className="font-mono text-sm tracking-wider text-muted-foreground mt-4 text-center">
                1 standard photo = 10 credits.&nbsp;&nbsp;Higher-resolution photos use more credits.
              </p>
            </>
          )}
        </motion.div>

        {/* Promo Code Section */}
        <motion.div variants={itemVariants} className="border border-border/30 p-8 mb-12">
          <div className="flex items-center gap-3 mb-6">
            <Gift className="h-5 w-5 text-muted-foreground" />
            <span className="font-mono text-[9px] tracking-[0.3em] text-muted-foreground uppercase">
              Redeem Promo Code
            </span>
          </div>

          <div className="flex gap-3 max-w-md">
            <Input
              placeholder="Enter promo code"
              value={promoCode}
              onChange={(e) => {
                setPromoCode(e.target.value);
                setPromoResult(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleRedeemPromo()}
              className="font-mono text-sm tracking-wider uppercase bg-background border-border/50"
            />
            <Button
              onClick={handleRedeemPromo}
              disabled={promoLoading || !promoCode.trim()}
              variant="default"
              className="font-mono text-[10px] tracking-[0.2em] uppercase px-6"
            >
              {promoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Redeem'}
            </Button>
          </div>

          {promoResult && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex items-start gap-2 mt-4 ${
                promoResult.type === 'success' ? 'text-[hsl(var(--formanova-success))]' : 'text-destructive'
              }`}
            >
              {promoResult.type === 'success' ? (
                <Check className="h-4 w-4 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              )}
              <p className="font-mono text-[11px] tracking-wider">
                {promoResult.message}
              </p>
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}
