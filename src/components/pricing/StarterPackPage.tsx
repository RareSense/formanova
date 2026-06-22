// Starter Pack page: the one-time, first-purchase page shown in place of the
// normal pricing grid while a user is still eligible (see Pricing.tsx).
//
// Pure presentation. All billing state (tier, checkout, loading) is passed in
// from the page so this file stays free of API/state concerns (AI_RULES rule 8).
//
// Deliberately simple: headline, then the $2 offer as the centered anchor, then
// a small clean grid of output examples, then a single reassurance line. No
// dashboards, no busy side panels, no tutorials.
//
// IMAGES + LABELS ARE PLACEHOLDERS. Each card art is a theme-token gradient.
// To go live, give each EXAMPLE a `.webp` `src` and it renders as an <img>;
// labels live in the EXAMPLES array and are not final copy yet.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import type { BillingTier } from '@/lib/starter-pack';
import onModelImg from '@/assets/starter-pack/on-model.webp';
import productShotImg from '@/assets/starter-pack/product-shot.webp';
import instagramStoryImg from '@/assets/starter-pack/instagram-story.webp';
import instagramPostImg from '@/assets/starter-pack/instagram-post.webp';
import editorialImg from '@/assets/starter-pack/editorial.webp';
import websiteProductImg from '@/assets/starter-pack/website-product.webp';

interface Props {
  tier: BillingTier;
  isINR: boolean;
  loadingTier: string | null;
  unavailableTier: string | null;
  errorTier: string | null;
  onCheckout: (tierId: string) => void;
}

interface Example {
  /** Main label shown on the image. */
  title: string;
  /** Optional short detail (e.g. an aspect ratio). */
  meta?: string;
  /** Real asset goes here later; until then a placeholder renders. */
  src?: string;
}

// Labels are not final copy. Edit freely once curated.
const EXAMPLES: Example[] = [
  { title: 'On-model', src: onModelImg },
  { title: 'Product shot', src: productShotImg },
  { title: 'Instagram Story', meta: '9:16', src: instagramStoryImg },
  { title: 'Instagram Post', meta: '4:5', src: instagramPostImg },
  { title: 'Editorial', src: editorialImg },
  { title: 'Website / Product Page', src: websiteProductImg },
];

function ExampleLabel({ example }: { example: Example }) {
  return (
    <div className="flex items-baseline gap-1.5 rounded-full bg-background/85 px-2.5 py-1 backdrop-blur-sm">
      <span className="truncate text-[11px] font-medium text-foreground">{example.title}</span>
      {example.meta && (
        <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
          {example.meta}
        </span>
      )}
    </div>
  );
}

function ExampleArt({ example }: { example: Example }) {
  if (example.src) {
    return (
      <img
        src={example.src}
        alt={example.title}
        className="absolute inset-0 h-full w-full object-cover"
      />
    );
  }
  return <div className="absolute inset-0 bg-gradient-to-br from-muted via-muted to-muted-foreground/20" />;
}

function ExampleCard({ example, onZoom }: { example: Example; onZoom: (e: Example) => void }) {
  return (
    <button
      type="button"
      onClick={() => onZoom(example)}
      className="group relative block aspect-[4/5] w-full overflow-hidden rounded-lg border border-border bg-card text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.04]">
        <ExampleArt example={example} />
      </div>
      {/* Label directly on the image, kept readable on any background. */}
      <div className="absolute bottom-2 left-2 z-10">
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
    <div className="mx-auto flex max-w-4xl flex-col items-center px-1 pb-10">

      {/* 1. Headline */}
      <h1 className="text-center font-display text-4xl uppercase leading-[0.95] tracking-wide text-foreground sm:text-5xl lg:text-6xl">
        One jewelry photo. Beautiful outputs.
      </h1>
      <p className="mt-3 text-center text-sm text-muted-foreground sm:text-base">
        Try your first FormaNova shoot for {isINR ? '₹199' : '$2'}.
      </p>

      {/* 2. Offer (the anchor) */}
      <div className="mt-8 w-full max-w-sm rounded-2xl border-2 border-[hsl(var(--formanova-hero-accent))] bg-[hsl(var(--formanova-hero-accent))]/10 p-7 text-center shadow-lg sm:p-8">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[hsl(var(--formanova-hero-accent))]">
          Starter Pack
        </span>

        <div className="mt-3 flex items-baseline justify-center gap-2">
          <span
            className="font-display text-2xl tracking-tight text-muted-foreground"
            style={{ textDecoration: 'line-through', textDecorationThickness: '1.5px' }}
          >
            {isINR ? '₹499' : '$5'}
          </span>
          <span className="font-display text-6xl tracking-tight text-foreground sm:text-7xl">
            {isINR ? '₹199' : '$2'}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {isINR ? 'INR' : 'USD'}
          </span>
        </div>

        <p className="mt-3 font-mono text-xs uppercase tracking-[0.16em] text-foreground">
          50 credits / up to 6 photos
        </p>

        <Button
          className="mt-6 w-full font-mono text-[11px] uppercase tracking-[0.2em]"
          size="lg"
          disabled={loadingTier !== null}
          onClick={() => onCheckout(tier.tier_id)}
        >
          {isLoading ? 'Starting checkout...' : 'Start my first shoot'}
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

      {/* 3. Output examples (click to view large) */}
      <div className="mt-12 grid w-full grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {EXAMPLES.map((example) => (
          <ExampleCard key={example.title} example={example} onZoom={setZoomed} />
        ))}
      </div>

      {/* 4. Reassurance */}
      <p className="mt-8 max-w-xl text-center text-xs leading-relaxed text-muted-foreground">
        Use your own model or background, or choose from FormaNova libraries. High-res upscaling available.
      </p>

      {/* Click-to-zoom lightbox (image shown at its natural aspect) */}
      <Dialog open={zoomed !== null} onOpenChange={(open) => !open && setZoomed(null)}>
        <DialogContent className="w-auto max-w-[92vw] overflow-hidden border-border bg-card p-0 sm:max-w-3xl">
          {zoomed && (
            <div className="relative flex items-center justify-center bg-muted">
              {zoomed.src ? (
                <img
                  src={zoomed.src}
                  alt={zoomed.title}
                  className="block max-h-[82vh] w-auto max-w-full object-contain"
                />
              ) : (
                <div className="aspect-[4/5] w-full max-w-sm bg-gradient-to-br from-muted to-muted-foreground/20" />
              )}
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
