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

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { BillingTier } from '@/lib/starter-pack';
import creditCoinIcon from '@/assets/icons/credit-coin.webp';
import editorialImg from '@/assets/starter-pack/editorial.webp';
import ecommerceImg from '@/assets/starter-pack/ecommerce.webp';
import socialImg from '@/assets/starter-pack/social-vertical.webp';
import necklaceCloseupImg from '@/assets/starter-pack/necklace-closeup.webp';
import modelGoldenHourImg from '@/assets/starter-pack/model-golden-hour.webp';
import goldHoopEarringModelImg from '@/assets/starter-pack/gold-hoop-earring-model.webp';
import goldChandelierEarringSariImg from '@/assets/starter-pack/gold-chandelier-earring-sari.webp';
import bridalFormanovaImg from '@/assets/starter-pack/bridal-formanova.webp';
import starfishSetBeachImg from '@/assets/starter-pack/starfish-set-beach.webp';
import metgalaEditorialImg from '@/assets/starter-pack/metgala-editorial.webp';
import ringGemstoneMoodyImg from '@/assets/starter-pack/ring-gemstone-moody.webp';
import heartPendantImg from '@/assets/starter-pack/heart-pendant.webp';
import heartSetFlatlayImg from '@/assets/starter-pack/heart-set-flatlay.webp';
import pinkEarringsFlatlayImg from '@/assets/starter-pack/pink-earrings-flatlay.webp';
import goldNecklaceFlatlayImg from '@/assets/starter-pack/gold-necklace-flatlay.webp';
import modelPinkEditorialImg from '@/assets/starter-pack/model-pink-editorial.webp';
import tennisBraceletWristImg from '@/assets/starter-pack/tennis-bracelet-wrist.webp';
import goldGemstoneNecklaceImg from '@/assets/starter-pack/gold-gemstone-necklace.webp';
import cascadeEarringModelImg from '@/assets/starter-pack/cascade-earring-model.webp';
import satinNecklaceModelImg from '@/assets/starter-pack/satin-necklace-model.webp';
import redCharmNecklaceModelImg from '@/assets/starter-pack/red-charm-necklace-model.webp';
import deepVNecklaceModelImg from '@/assets/starter-pack/deep-v-necklace-model.webp';
import emeraldEarringsBeachImg from '@/assets/starter-pack/emerald-earrings-beach.webp';
import magentaEarringsModelImg from '@/assets/starter-pack/magenta-earrings-model.webp';
import weddingSetRingImg from '@/assets/starter-pack/wedding-set-ring.webp';
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
  /** Optional content rendered above the top offer card (e.g. credit balance or
   *  an insufficient-credits message). The page decides what to show; this stays
   *  pure presentation. When omitted (e.g. on the public Pricing page) nothing
   *  renders here and only the offer shows. */
  aboveOffer?: ReactNode;
}

// Interleaved so the masonry mixes tall and square shapes column to column.
const GALLERY: { src: string; alt: string }[] = [
  { src: socialImg, alt: 'Vertical on-model jewelry shot' },
  { src: ecommerceImg, alt: 'Pave hoop earrings, clean product shot' },
  { src: emeraldEarringsBeachImg, alt: 'Emerald drop earrings on model at the beach' },
  { src: heroEmeraldEarringsImg, alt: 'Editorial emerald earrings shot' },
  { src: starfishSetBeachImg, alt: 'Starfish jewelry set on model at the beach' },
  { src: magentaEarringsModelImg, alt: 'Magenta drop earrings on model' },
  { src: heartSetFlatlayImg, alt: 'Sapphire heart necklace and earring set' },
  { src: goldHoopEarringModelImg, alt: 'Gold hoop earring on model' },
  { src: pinkEarringsFlatlayImg, alt: 'Pink gemstone earrings product shot' },
  { src: modelGoldenHourImg, alt: 'Golden-hour on-model jewelry portrait' },
  { src: heroVneckNecklaceImg, alt: 'Editorial diamond necklace shot' },
  { src: editorialImg, alt: 'Editorial necklace portrait' },
  { src: bridalFormanovaImg, alt: 'Bridal model with pearl drop earrings' },
  { src: goldNecklaceFlatlayImg, alt: 'Gold necklace product shot' },
  { src: cascadeEarringModelImg, alt: 'Cascade drop earrings on model' },
  { src: necklaceCloseupImg, alt: 'Necklace close-up' },
  { src: tennisBraceletWristImg, alt: 'Tennis bracelet on the wrist' },
  { src: redCharmNecklaceModelImg, alt: 'Charm necklace on model, red backdrop' },
  { src: heartPendantImg, alt: 'Heart pendant choker on model' },
  { src: modelPinkEditorialImg, alt: 'Editorial jewelry shot on model' },
  { src: satinNecklaceModelImg, alt: 'Necklace on model in satin' },
  { src: goldChandelierEarringSariImg, alt: 'Gold chandelier earrings on model in sari' },
  { src: goldGemstoneNecklaceImg, alt: 'Gold gemstone necklace product shot' },
  { src: weddingSetRingImg, alt: 'Lab-grown diamond wedding set ring' },
  { src: deepVNecklaceModelImg, alt: 'Necklace on model, deep neckline' },
  { src: metgalaEditorialImg, alt: 'Editorial gown and gold jewelry on the red carpet' },
  { src: ringGemstoneMoodyImg, alt: 'Ruby and emerald ring, moody product shot' },
];

function OfferCard({ tier, isINR, loadingTier, unavailableTier, errorTier, onCheckout }: Props) {
  const isLoading = loadingTier === tier.tier_id;
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6 border-2 border-[hsl(var(--formanova-hero-accent))] bg-[hsl(var(--formanova-hero-accent))]/10 p-8 text-center shadow-sm">
      <div>
        <span className="inline-block whitespace-nowrap font-mono text-[22px] font-bold uppercase italic tracking-[0.15em] text-[hsl(var(--formanova-hero-accent))]">
          One-time offer
        </span>
      </div>

      <div className="flex items-baseline justify-center gap-1">
        <span className="font-display text-5xl uppercase tracking-tight text-foreground">
          {isINR ? '₹199' : '$2'}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {isINR ? 'INR' : 'USD'}
        </span>
      </div>

      <p className="max-w-md text-left text-sm italic leading-relaxed text-[hsl(var(--formanova-hero-accent))]">
        Perfect for jewelry brands to try FormaNova across their key SKU needs, from on-model and product shots to ecommerce and editorial visuals.
      </p>

      <div className="w-full max-w-md space-y-2 border-t border-border/30 pt-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">You get</p>
        <p className="font-mono text-xl text-foreground">50 credits</p>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground">
          Generate up to 6 photos
        </p>
      </div>

      <div className="w-full max-w-md">
        <Button
          className="w-full gap-2 font-mono text-[10px] uppercase tracking-[0.2em]"
          size="lg"
          disabled={loadingTier !== null}
          onClick={() => onCheckout(tier.tier_id)}
        >
          <img src={creditCoinIcon} alt="" className="h-4 w-4 object-contain" width={16} height={16} />
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
  const [zoomed, setZoomed] = useState<string | null>(null);

  return (
    <div className="mx-auto flex max-w-5xl flex-col items-center px-1 pb-12">

      {/* Optional heading above the offer (credit balance / insufficient-credits message) */}
      {props.aboveOffer ? <div className="mb-2 mt-2 w-full">{props.aboveOffer}</div> : null}

      {/* Offer - top */}
      <div className="mt-4 flex w-full justify-center">
        <OfferCard {...props} />
      </div>

      {/* Headline - sits directly above the gallery */}
      <h1 className="mt-16 text-center font-display text-4xl uppercase leading-[0.95] tracking-wide text-foreground sm:text-5xl lg:text-6xl">
        Visuals created with FormaNova.
      </h1>

      {/* Pinterest-style masonry gallery (no labels) */}
      <div className="mt-8 w-full columns-2 gap-3 sm:columns-3 lg:columns-4">
        {GALLERY.map((item) => (
          <button
            key={item.src}
            type="button"
            onClick={() => setZoomed(item.src)}
            className="group mb-3 block w-full break-inside-avoid overflow-hidden border border-border bg-card shadow-sm transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
        <DialogContent className="w-auto max-w-[92vw] overflow-hidden rounded-none border-border bg-card p-0 sm:max-w-3xl sm:rounded-none [&>button]:right-3 [&>button]:top-3 [&>button]:rounded-none [&>button]:bg-black/60 [&>button]:p-1.5 [&>button]:opacity-100 [&>button]:backdrop-blur-sm [&>button]:!text-white hover:[&>button]:bg-black/80">
          <DialogTitle className="sr-only">Enlarged jewelry photo</DialogTitle>
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
