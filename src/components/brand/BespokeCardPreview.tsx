import { BrandCard, BrandCardFaceToggle, type CardFace } from '@/components/brand/BrandCard';

interface Props {
  cardFace: CardFace;
  onFaceChange: (face: CardFace) => void;
  allDone: boolean;
  isMobile: boolean;
  brandName: string;
  salesChannelDetail: string;
  basedIn: string;
  targetMarkets: string[];
  socialLinks: string[];
}

/** Live-updating brand card shown alongside the form on desktop. */
export function BespokeCardPreview({
  cardFace,
  onFaceChange,
  allDone,
  isMobile,
  brandName,
  salesChannelDetail,
  basedIn,
  targetMarkets,
  socialLinks,
}: Props) {
  return (
    <div className="hidden lg:order-2 lg:block lg:border-l lg:border-border lg:pl-10">
      <div className="mx-auto max-w-md lg:sticky lg:top-0 lg:max-w-none">
        <div className="mb-4 flex items-center justify-between gap-4">
          <p className="font-card text-sm uppercase tracking-[0.22em] text-foreground">
            Your Bespoke Card
          </p>
        </div>
        <BrandCardFaceToggle
          face={cardFace}
          onFaceChange={onFaceChange}
          showBoth={allDone && !isMobile}
          className="mb-5"
        />
        <BrandCard
          brandName={brandName}
          websiteUrl={salesChannelDetail}
          storeUrl=""
          basedIn={basedIn}
          targetMarkets={targetMarkets}
          socialLinks={socialLinks}
          face={cardFace === 'both' && (isMobile || !allDone) ? 'front' : cardFace}
        />
      </div>
    </div>
  );
}
