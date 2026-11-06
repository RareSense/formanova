// Credit plan grid shared by /credits and /pricing.
//
// One card per billing tier: the one-time Starter tier (only returned by the
// backend while the user is still eligible) plus Basic / Standard / Pro. Both
// pages render this same component so the two grids cannot drift apart.

import type { ReactNode } from 'react';
import { Info, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isStarterTier, type BillingTier } from '@/lib/starter-pack';
import { PLAN_BY_CREDITS, STARTER_OFFER, resolveGridTiers } from '@/lib/credit-plans';

interface CreditPlanGridProps {
  tiers: BillingTier[];
  /** Set on the CAD shortfall view: the credits the blocked run needs. */
  cadRequiredCredits?: number;
  /** Set when a photo run was blocked on credits: hides the CAD-sized Plus package. */
  photoShortfall?: boolean;
  isINR: boolean;
  symbol: string;
  currency: string;
  loadingTier: string | null;
  unavailableTier: string | null;
  errorTier: string | null;
  onCheckout: (tierId: string) => void;
  /** The Done For You card: when set, the page shows two labelled paths, Self service and We do it for you. */
  doneForYou?: ReactNode;
}

export function CreditPlanGrid({
  tiers,
  cadRequiredCredits,
  photoShortfall = false,
  isINR,
  symbol,
  currency,
  loadingTier,
  unavailableTier,
  errorTier,
  onCheckout,
  doneForYou,
}: CreditPlanGridProps) {
  const gridTiers = resolveGridTiers(tiers, cadRequiredCredits, photoShortfall);
  const cardCount = gridTiers.length;
  // With Done For You the plans keep one card column each on xl (see the layout below); alone they keep one row.
  const colsClass = doneForYou
    ? `lg:grid-cols-3 ${XL_COLS[cardCount] ?? ''}`
    : cardCount >= 5 ? 'lg:grid-cols-3 xl:grid-cols-5'
    : cardCount === 4 ? 'xl:grid-cols-4' : 'md:grid-cols-3';
  const formatPrice = (usd: number, inr: number) =>
    isINR ? `${symbol}${inr.toLocaleString('en-IN')}` : `$${usd}`;

  const plans = (
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${colsClass} gap-6${doneForYou ? ' flex-1' : ''}`}>
        {gridTiers.map((tier) => {
          const starter = isStarterTier(tier);
          const plan = starter ? null : PLAN_BY_CREDITS[tier.credits];
          if (!starter && !plan) return null;

          const credits = starter ? STARTER_OFFER.credits : plan.credits;
          const photos = starter ? STARTER_OFFER.photos : plan.photos;
          // A CAD run costs more than these packages hold.
          const noCad = starter || plan.cads === 0;
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
                  Up to {photos} photos at 1K
                  {!noCad && (
                    <>
                      <br />
                      or {plan.cads} CAD {plan.cads === 1 ? 'generation' : 'generations'}
                    </>
                  )}
                </p>
                {noCad && (
                  <div className="mt-5 flex items-start gap-3 rounded-md bg-[hsl(var(--formanova-hero-accent))]/15 px-4 py-3 text-[hsl(var(--formanova-hero-accent))]">
                    <Info className="mt-0.5 h-5 w-5 shrink-0" />
                    <p className="text-sm leading-snug">Not suitable for CAD</p>
                  </div>
                )}
              </div>

              {/* CTA */}
              <div className="mt-auto pt-8">
                <Button
                  className="h-auto min-h-11 w-full whitespace-normal px-3 py-2.5 font-mono text-xs uppercase leading-tight tracking-[0.2em] xl:px-2 xl:text-[11px] xl:tracking-[0.06em]"
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
  );
  const creditsNote = (
    <p className="font-mono text-sm tracking-wider text-muted-foreground mt-6 text-center">
      Use your credits across Photo Studio and CAD Studio.
    </p>
  );

  if (!doneForYou) {
    return (
      <>
        {plans}
        {creditsNote}
      </>
    );
  }

  // Two ways to buy (owner, 2026-11-05): "We do it for you" first, then "Do it yourself", each under a heading in the
  // Dashboard's Photography / CAD style. One shared column grid with one gap, so the Done For You card is exactly one
  // plan card wide. On xl it all sits in one row; narrower, Done For You takes the first row and the plans wrap below.
  // The credits note sits under the whole row, never inside a column, so both columns end at the same height.
  return (
    <>
      <div className={`grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 ${XL_COLS[cardCount + 1] ?? ''}`}>
        <section aria-labelledby="path-done-for-you" className="flex flex-col">
          <PathHeading id="path-done-for-you" title="We do it for you" />
          <div className="flex-1">{doneForYou}</div>
        </section>
        <section aria-labelledby="path-do-it-yourself" className={`flex flex-col sm:col-span-2 lg:col-span-3 ${XL_SPAN[cardCount] ?? ''}`}>
          <PathHeading id="path-do-it-yourself" title="Do it yourself" />
          {plans}
        </section>
      </div>
      {creditsNote}
    </>
  );
}

// Literal class names so Tailwind keeps them.
const XL_COLS: Record<number, string> = {
  2: 'xl:grid-cols-2', 3: 'xl:grid-cols-3', 4: 'xl:grid-cols-4', 5: 'xl:grid-cols-5', 6: 'xl:grid-cols-6',
};
const XL_SPAN: Record<number, string> = {
  1: 'xl:col-span-1', 2: 'xl:col-span-2', 3: 'xl:col-span-3', 4: 'xl:col-span-4', 5: 'xl:col-span-5',
};

/** Same look as the Dashboard's Photography / CAD dividers. */
function PathHeading({ id, title }: { id: string; title: string }) {
  return (
    <div className="mb-4 flex min-h-10 items-center gap-3">
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
      <h2 id={id} className="shrink-0 text-center font-display text-xl uppercase leading-none tracking-wide text-formanova-hero-accent md:text-2xl">
        {title}
      </h2>
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
    </div>
  );
}
