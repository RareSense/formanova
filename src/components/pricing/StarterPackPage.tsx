// Starter Pack page: the one-time, first-purchase page shown in place of the
// normal pricing grid while a user is still eligible (see Pricing.tsx).
//
// Pure presentation. All billing state (tier, checkout, loading) is passed in
// from the page so this file stays free of API/state concerns (AI_RULES rule 8).
//
// Layout, by hierarchy:
//   1. Headline (the promise)
//   2. Offer card (the anchor) - mirrors the existing Starter card on the normal
//      pricing page so it feels native.
//   3. One horizontal row of big output examples (scroll to see more). Labels are
//      truthful to each image: product shot, on-model, editorial, catalog set,
//      vertical 9:16 - the 3-5 style mix jewelry listings convert with.
//   4. One reassurance line.
//
// Click any card to view it large at its natural aspect.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import type { BillingTier } from '@/lib/starter-pack';
import editorialImg from '@/assets/starter-pack/editorial.webp';
import lifestyleImg from '@/assets/starter-pack/lifestyle.webp';
import ecommerceImg from '@/assets/starter-pack/ecommerce.webp';
import catalogImg from '@/assets/starter-pack/catalog.webp';
import socialImg from '@/assets/starter-pack/social-vertical.webp';

interface Props {
  tier: BillingTier;
  isINR: boolean;
  loadingTier: string | null;
  unavailableTier: string | null;
  errorTier: string | null;
  onCheckout: (tierId: string) => void;
}

interface Example {
  /** Label shown on the image - truthful to what the image actually is. */
  title: string;
  /** Optional short detail (e.g. an aspect ratio). */
  meta?: string;
  src: string;
}

// Labels are use cases, not "on-model" (most shots have a model, so that would
// not distinguish them). This is the 3-5 style mix jewelry listings convert
// with: editorial and lifestyle for desire, ecommerce and catalog for trust,
// plus a vertical social format.
const EXAMPLES: Example[] = [
  { title: 'Editorial', src: editorialImg },
  { title: 'Lifestyle', src: lifestyleImg },
  { title: 'Ecommerce', src: ecommerceImg },
  { title: 'Catalog', src: catalogImg },
  { title: 'Social', meta: '9:16', src: socialImg },
];

function ExampleLabel({ example }: { example: Example }) {
  return (
    <div className="flex items-baseline gap-1.5 rounded-full bg-background/85 px-3 py-1.5 backdrop-blur-sm">
      <span className="text-xs font-medium text-foreground">{example.title}</span>
      {example.meta && (
        <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
          {example.meta}
        </span>
      )}
    </div>
  );
}

function ExampleCard({ example, onZoom }: { example: Example; onZoom: (e: Example) => void }) {
  return (
    <button
      type="button"
      onClick={() => onZoom(example)}
      className="group relative aspect-[3/4] w-[260px] shrink-0 snap-start overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:w-[300px]"
    >
      <img
        src={example.src}
        alt={example.title}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
      />
      {/* Label kept low-left where it rarely sits over the jewelry. */}
      <div className="absolute bottom-3 left-3 z-10">
        <ExampleLabel example={example} />
      </div>
    </button>
  );
}

export function StarterPackPage({
  tier,
  isINR,
  loadingTier,
  unavailableTier,
  errorTier,
  onCheckout,
}: Props) {
  const isLoading = loadingTier === tier.tier_id;
  const [zoomed, setZoomed] = useState<Example | null>(null);

  return (
    <div className="mx-auto flex max-w-5xl flex-col items-center px-1 pb-10">

      {/* 1. Headline */}
      <h1 className="text-center font-display text-4xl uppercase leading-[0.95] tracking-wide text-foreground sm:text-5xl lg:text-6xl">
        One jewelry photo. Beautiful outputs.
      </h1>
      <p className="mt-3 text-center text-sm text-muted-foreground sm:text-base">
        Try your first FormaNova shoot for {isINR ? '₹199' : '$2'}.
      </p>

      {/* 2. Offer (the anchor) - mirrors the normal pricing Starter card */}
      <div className="mt-8 flex w-full max-w-sm flex-col gap-6 border-2 border-[hsl(var(--formanova-hero-accent))] bg-[hsl(var(--formanova-hero-accent))]/10 p-8 shadow-sm">
        <div>
          <span className="inline-block whitespace-nowrap font-mono text-[20px] font-bold uppercase italic tracking-[0.15em] text-[hsl(var(--formanova-hero-accent))]">
            One-time offer
          </span>
        </div>

        <div>
          <div className="flex items-baseline gap-1">
            <span
              className="font-display text-2xl uppercase tracking-tight text-muted-foreground"
              style={{ textDecoration: 'line-through', textDecorationThickness: '1.5px' }}
            >
              {isINR ? '₹499' : '$5'}
            </span>
            <span className="font-display text-5xl uppercase tracking-tight text-foreground">
              {isINR ? '₹199' : '$2'}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {isINR ? 'INR' : 'USD'}
            </span>
          </div>
          <p className="mt-1 font-mono text-[10px] tracking-wider text-muted-foreground">
            {isINR ? '₹3.98' : '$0.40'} per photo
          </p>
        </div>

        <p className="text-sm italic leading-relaxed text-[hsl(var(--formanova-hero-accent))]">
          Perfect for your first project. A simple way to try FormaNova before moving to a larger pack. Available once per account.
        </p>

        <div className="space-y-2 border-t border-border/30 pt-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">You get</p>
          <p className="font-mono text-xl text-foreground">50 credits</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Generate up to 6 photos
          </p>
        </div>

        <div>
          <Button
            className="w-full font-mono text-[10px] uppercase tracking-[0.2em]"
            size="lg"
            disabled={loadingTier !== null}
            onClick={() => onCheckout(tier.tier_id)}
          >
            {isLoading ? 'Starting checkout...' : 'Buy 50 Credits'}
          </Button>
          {unavailableTier === tier.tier_id && (
            <p className="mt-2 font-mono text-[9px] uppercase tracking-wider text-destructive">
              Offer unavailable.
            </p>
          )}
          {errorTier === tier.tier_id && (
            <p className="mt-2 font-mono text-[9px] uppercase tracking-wider text-destructive">
              Checkout failed. Please try again.
            </p>
          )}
        </div>
      </div>

      {/* 3. Output examples: one big-card row, scroll for more */}
      <div className="mt-12 w-full">
        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-3 [scrollbar-width:thin]">
          {EXAMPLES.map((example) => (
            <ExampleCard key={example.title} example={example} onZoom={setZoomed} />
          ))}
        </div>
      </div>

      {/* 4. Reassurance */}
      <p className="mt-6 max-w-xl text-center text-xs leading-relaxed text-muted-foreground">
        Use your own model or background, or choose from FormaNova libraries. High-res upscaling available.
      </p>

      {/* Click-to-zoom lightbox (image shown at its natural aspect) */}
      <Dialog open={zoomed !== null} onOpenChange={(open) => !open && setZoomed(null)}>
        <DialogContent className="w-auto max-w-[92vw] overflow-hidden border-border bg-card p-0 sm:max-w-3xl">
          {zoomed && (
            <div className="relative flex items-center justify-center bg-muted">
              <img
                src={zoomed.src}
                alt={zoomed.title}
                className="block max-h-[82vh] w-auto max-w-full object-contain"
              />
              <div className="absolute bottom-3 left-3">
                <ExampleLabel example={zoomed} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
