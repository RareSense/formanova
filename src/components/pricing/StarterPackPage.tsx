// Starter Pack page: the one-time, first-purchase page shown in place of the
// normal pricing grid while a user is still eligible (see Pricing.tsx).
//
// Pure presentation. All billing state (tier, checkout, loading) is passed in
// from the page so this file stays free of API/state concerns (AI_RULES rule 8).
//
// Layout: a vertical, Pinterest-style masonry of jewelry outputs with the $2
// offer card repeated at the top and the bottom (so the call to action is in
// view whether the user buys immediately or after scrolling the gallery). The
// images carry no labels - they are meant to be felt, not read. Click any image
// to view it large.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import type { BillingTier } from '@/lib/starter-pack';
import editorialImg from '@/assets/starter-pack/editorial.webp';
import lifestyleImg from '@/assets/starter-pack/lifestyle.webp';
import ecommerceImg from '@/assets/starter-pack/ecommerce.webp';
import catalogImg from '@/assets/starter-pack/catalog.webp';
import socialImg from '@/assets/starter-pack/social-vertical.webp';
import necklaceCloseupImg from '@/assets/starter-pack/necklace-closeup.webp';
import necklacePortraitImg from '@/assets/starter-pack/necklace-portrait.webp';
import earringStudioImg from '@/assets/starter-pack/earring-studio.webp';
import pendantImg from '@/assets/starter-pack/pendant.webp';
import bridalImg from '@/assets/starter-pack/bridal.webp';
import earringModelImg from '@/assets/starter-pack/earring-model.webp';
import ringDetailImg from '@/assets/starter-pack/ring-detail.webp';
// Landscape editorial shots reused from the hero set for masonry variety.
import heroEmeraldEarringsImg from '@/assets/jewelry/hero-emerald-earrings.webp';
import heroVneckNecklaceImg from '@/assets/jewelry/hero-vneck-necklace.webp';

interface Props {
  tier: BillingTier;
  isINR: boolean;
  loadingTier: string | null;
  unavailableTier: string | null;
  errorTier: string | null;
  onCheckout: (tierId: string) => void;
}

// Interleaved so the masonry mixes tall and square shapes column to column.
const GALLERY: { src: string; alt: string }[] = [
  { src: socialImg, alt: 'Vertical on-model jewelry shot' },
  { src: ecommerceImg, alt: 'Clean ecommerce earring shot' },
  { src: heroEmeraldEarringsImg, alt: 'Editorial emerald earrings shot' },
  { src: editorialImg, alt: 'Editorial necklace portrait' },
  { src: necklaceCloseupImg, alt: 'Necklace close-up' },
  { src: catalogImg, alt: 'Styled jewelry set' },
  { src: earringModelImg, alt: 'On-model earring shot' },
  { src: heroVneckNecklaceImg, alt: 'Editorial diamond necklace shot' },
  { src: pendantImg, alt: 'Pendant detail' },
  { src: lifestyleImg, alt: 'Lifestyle jewelry shot' },
  { src: necklacePortraitImg, alt: 'Necklace portrait' },
  { src: bridalImg, alt: 'Bridal jewelry set' },
  { src: ringDetailImg, alt: 'Ring detail' },
  { src: earringStudioImg, alt: 'Studio earring shot' },
];

function OfferCard({ tier, isINR, loadingTier, unavailableTier, errorTier, onCheckout }: Props) {
  const isLoading = loadingTier === tier.tier_id;
  return (
    <div className="flex w-full max-w-sm flex-col gap-6 border-2 border-[hsl(var(--formanova-hero-accent))] bg-[hsl(var(--formanova-hero-accent))]/10 p-8 shadow-sm">
      <div>
        <span className="inline-block whitespace-nowrap font-mono text-[20px] font-bold uppercase italic tracking-[0.15em] text-[hsl(var(--formanova-hero-accent))]">
          One-time offer
        </span>
      </div>

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

      <p className="text-sm italic leading-relaxed text-[hsl(var(--formanova-hero-accent))]">
        Use it on a real jewelry SKU: model shots, product shots, styled sets, and vertical portraits. Available once per account.
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
  );
}

export function StarterPackPage(props: Props) {
  const { isINR } = props;
  const [zoomed, setZoomed] = useState<string | null>(null);

  return (
    <div className="mx-auto flex max-w-5xl flex-col items-center px-1 pb-12">

      {/* Headline */}
      <h1 className="text-center font-display text-4xl uppercase leading-[0.95] tracking-wide text-foreground sm:text-5xl lg:text-6xl">
        One jewelry photo. Beautiful outputs.
      </h1>
      <p className="mt-3 text-center text-sm text-muted-foreground sm:text-base">
        Try your first FormaNova shoot for {isINR ? '₹199' : '$2'}.
      </p>

      {/* Offer - top */}
      <div className="mt-8 flex w-full justify-center">
        <OfferCard {...props} />
      </div>

      {/* Pinterest-style masonry gallery (no labels) */}
      <div className="mt-12 w-full columns-2 gap-3 sm:columns-3 lg:columns-4">
        {GALLERY.map((item) => (
          <button
            key={item.src}
            type="button"
            onClick={() => setZoomed(item.src)}
            className="group mb-3 block w-full break-inside-avoid overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <img
              src={item.src}
              alt={item.alt}
              loading="lazy"
              className="w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
          </button>
        ))}
      </div>

      {/* Offer - bottom */}
      <div className="mt-12 flex w-full justify-center">
        <OfferCard {...props} />
      </div>

      {/* Reassurance */}
      <p className="mt-6 max-w-xl text-center text-xs leading-relaxed text-muted-foreground">
        Use your own model or background, or choose from FormaNova libraries. High-res upscaling available.
      </p>

      {/* Click-to-zoom lightbox (image shown at its natural aspect) */}
      <Dialog open={zoomed !== null} onOpenChange={(open) => !open && setZoomed(null)}>
        <DialogContent className="w-auto max-w-[92vw] overflow-hidden border-border bg-card p-0 sm:max-w-3xl">
          {zoomed && (
            <div className="flex items-center justify-center bg-muted">
              <img src={zoomed} alt="" className="block max-h-[82vh] w-auto max-w-full object-contain" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
