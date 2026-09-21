// Credit plan grid shared by /credits and /pricing.
//
// One card per billing tier: the one-time Starter tier (only returned by the
// backend while the user is still eligible) plus Basic / Standard / Pro. Both
// pages render this same component so the two grids cannot drift apart.

import { Info, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isStarterTier, type BillingTier } from '@/lib/starter-pack';

const CREDIT_PLANS = [
  { tierId: 'tier_5e6c6184', name: 'Basic', price: 9, inrPrice: 999, credits: 100, photos: 12, cads: 1 },
  { tierId: 'tier_6867e598', name: 'Standard', price: 39, inrPrice: 3499, credits: 500, photos: 62, cads: 5 },
  { tierId: 'tier_a80444ac', name: 'Pro', price: 99, inrPrice: 8999, credits: 1500, photos: 187, cads: 15 },
];

const STARTER_OFFER = { price: 2, inrPrice: 199, credits: 50, photos: 6 };

const PLAN_BY_CREDITS = Object.fromEntries(CREDIT_PLANS.map(p => [p.credits, p])) as Record<
  number,
  (typeof CREDIT_PLANS)[number]
>;

/** Tiers to render: the backend list, or the three standard plans if it failed. */
function resolveGridTiers(tiers: BillingTier[]): BillingTier[] {
  return tiers.length > 0
    ? tiers
    : CREDIT_PLANS.map(p => ({ tier_id: p.tierId, name: p.name, type: 'subscription', credits: p.credits }));
}

interface CreditPlanGridProps {
  tiers: BillingTier[];
  isINR: boolean;
  symbol: string;
  currency: string;
  loadingTier: string | null;
  unavailableTier: string | null;
  errorTier: string | null;
  onCheckout: (tierId: string) => void;
}

export function CreditPlanGrid({
  tiers,
  isINR,
  symbol,
  currency,
  loadingTier,
  unavailableTier,
  errorTier,
  onCheckout,
}: CreditPlanGridProps) {
  const gridTiers = resolveGridTiers(tiers);
  const colsClass = gridTiers.length === 4 ? 'xl:grid-cols-4' : 'md:grid-cols-3';
  const formatPrice = (usd: number, inr: number) =>
    isINR ? `${symbol}${inr.toLocaleString('en-IN')}` : `$${usd}`;

  return (
    <>
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${colsClass} gap-6`}>
        {gridTiers.map((tier) => {
          const starter = isStarterTier(tier);
          const plan = starter ? null : PLAN_BY_CREDITS[tier.credits];
          if (!starter && !plan) return null;

          const credits = starter ? STARTER_OFFER.credits : plan.credits;
          const photos = starter ? STARTER_OFFER.photos : plan.photos;
          const price = starter
            ? formatPrice(STARTER_OFFER.price, STARTER_OFFER.inrPrice)
            : formatPrice(plan.price, plan.inrPrice);

          return (
            <div
              key={tier.tier_id}
              className={
                starter
                  ? 'flex flex-col p-6 xl:p-8 border-2 border-[hsl(var(--formanova-hero-accent))] bg-[hsl(var(--formanova-hero-accent))]/10'
                  : 'flex flex-col p-6 xl:p-8 border-2 border-foreground'
              }
            >
              {/* Label - fixed line box so every card's price and divider line up */}
              <div className="flex h-7 items-center">
                {starter ? (
                  <span className="font-mono text-lg tracking-[0.15em] uppercase font-bold italic text-[hsl(var(--formanova-hero-accent))]">
                    One-time offer
                  </span>
                ) : (
                  <span className="font-mono text-xs tracking-[0.25em] uppercase text-muted-foreground">
                    {plan.name}
                  </span>
                )}
              </div>

              {/* Price */}
              <div className="mt-6 flex items-baseline gap-1.5">
                <span className="font-display text-5xl uppercase tracking-tight text-foreground">
                  {price}
                </span>
                <span className="font-mono text-xs tracking-wider uppercase text-muted-foreground">
                  {currency}
                </span>
              </div>

              {/* What you get */}
              <div className="mt-6 border-t border-border/40 pt-6">
                <p className="font-mono text-2xl text-foreground">
                  {credits.toLocaleString()} credits
                </p>
                <p className="mt-2 font-mono text-sm leading-relaxed text-muted-foreground">
                  Up to {photos} standard photos
                  {!starter && (
                    <>
                      <br />
                      or {plan.cads} CAD {plan.cads === 1 ? 'generation' : 'generations'}
                    </>
                  )}
                </p>
                {starter && (
                  <div className="mt-5 flex items-start gap-3 rounded-md bg-[hsl(var(--formanova-hero-accent))]/15 px-4 py-3 text-[hsl(var(--formanova-hero-accent))]">
                    <Info className="mt-0.5 h-5 w-5 shrink-0" />
                    <p className="text-sm leading-snug">Not enough for 1 CAD generation</p>
                  </div>
                )}
              </div>

              {/* CTA */}
              <div className="mt-auto pt-8">
                <Button
                  className="w-full px-4 font-mono text-xs tracking-[0.2em] uppercase"
                  size="lg"
                  variant="default"
                  disabled={loadingTier !== null}
                  onClick={() => onCheckout(tier.tier_id)}
                >
                  {loadingTier === tier.tier_id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    `Buy ${credits.toLocaleString()} Credits`
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
      <p className="font-mono text-sm tracking-wider text-muted-foreground mt-6 text-center">
        Use your credits across Photo Studio and CAD Studio.
      </p>
    </>
  );
}
