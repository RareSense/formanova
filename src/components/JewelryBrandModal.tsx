import { useState, useEffect, useRef } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BrandCard, BrandCardFaceToggle, type CardFace } from '@/components/brand/BrandCard';
import { NovaIntroPanel, type NovaOnboardingStep } from '@/components/brand/NovaIntroPanel';
import { CREATIVE_ZAVA_DEMO, DEMO_REVEAL_ORDER, type DemoRevealKey } from '@/components/brand/creative-zava-demo';
import { trackBrandFormOpened, trackBrandFormSubmitted } from '@/lib/posthog-events';

export interface BrandDetails {
  brand_name: string;
  website_url: string;
  store_url: string;
  social_links: string[];
  based_in: string;
  target_markets: string[];
}

/** Users often type "mybrand.com" — the backend rejects anything that isn't http(s). */
function normalizeUrl(value: string): string {
  const v = value.trim();
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

/** How long each staggered demo-field reveal is spaced apart, in ms. */
const REVEAL_STEP_MS = 550;
const REVEAL_START_DELAY_MS = 500;
const REVEAL_FINISH_PAUSE_MS = 600;

interface Props {
  open: boolean;
  onClose: () => void;
  onContinue: (details: BrandDetails) => void;
  initial?: BrandDetails;
  dismissible?: boolean;
  /** Analytics funnel source: role picker vs existing-user Studio prompt. */
  source: 'onboarding' | 'studio_prompt';
}

export function JewelryBrandModal({ open, onClose, onContinue, initial, dismissible = true, source }: Props) {
  const isMobile = useIsMobile();

  const [step, setStep] = useState<NovaOnboardingStep>('intro');
  const [brandName, setBrandName] = useState(initial?.brand_name ?? '');
  const [website, setWebsite] = useState(initial?.website_url ?? '');
  const [brandNameError, setBrandNameError] = useState(false);
  const [cardFace, setCardFace] = useState<CardFace>('front');
  const [revealedDemoKeys, setRevealedDemoKeys] = useState<DemoRevealKey[]>([]);
  const autoBothShown = useRef(false);

  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    if (!dismissible) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, dismissible]);

  useEffect(() => {
    if (open) trackBrandFormOpened({ source });
  }, [open, source]);

  // Nova "speaks" the intro line, then the fields appear.
  useEffect(() => {
    if (!open || step !== 'intro') return;
    const t = setTimeout(() => setStep('speaking'), 600);
    return () => clearTimeout(t);
  }, [open, step]);

  useEffect(() => {
    if (!open || step !== 'speaking') return;
    const t = setTimeout(() => setStep('fields'), 5200);
    return () => clearTimeout(t);
  }, [open, step]);

  // Once Continue is pressed, the demo fields fill in one at a time.
  useEffect(() => {
    if (step !== 'building') return;
    setRevealedDemoKeys([]);
    const revealTimers = DEMO_REVEAL_ORDER.map((key, i) =>
      setTimeout(() => setRevealedDemoKeys((prev) => [...prev, key]), REVEAL_START_DELAY_MS + i * REVEAL_STEP_MS),
    );
    const finishTimer = setTimeout(
      () => setStep('done'),
      REVEAL_START_DELAY_MS + DEMO_REVEAL_ORDER.length * REVEAL_STEP_MS + REVEAL_FINISH_PAUSE_MS,
    );
    return () => {
      revealTimers.forEach(clearTimeout);
      clearTimeout(finishTimer);
    };
  }, [step]);

  if (!open) return null;

  if (step === 'done' && !isMobile && !autoBothShown.current) {
    autoBothShown.current = true;
    setCardFace('both');
  }

  const hasDemo = (key: DemoRevealKey) => step === 'done' || revealedDemoKeys.includes(key);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (dismissible && e.target === overlayRef.current) onClose();
  };

  const handleStartBuilding = () => {
    if (!brandName.trim()) {
      setBrandNameError(true);
      return;
    }
    setBrandNameError(false);
    if (!isMobile) setCardFace('both');
    setStep('building');
  };

  const handleFinish = () => {
    const websiteUrl = normalizeUrl(website);
    trackBrandFormSubmitted({
      source,
      has_website: Boolean(websiteUrl),
      has_store: false,
      has_location: true,
      has_markets: true,
      social_count: CREATIVE_ZAVA_DEMO.socialLinks.length,
      has_brand_book: false,
    });
    onContinue({
      brand_name: brandName.trim(),
      website_url: websiteUrl,
      store_url: '',
      social_links: CREATIVE_ZAVA_DEMO.socialLinks,
      based_in: CREATIVE_ZAVA_DEMO.basedIn,
      target_markets: CREATIVE_ZAVA_DEMO.targetMarkets,
    });
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-3 py-4 sm:px-4 sm:py-6 lg:backdrop-blur-md"
      onClick={handleOverlayClick}
    >
      <div className="relative flex max-h-[92vh] min-h-[85vh] w-full max-w-6xl flex-col border border-border bg-background">

        {dismissible && (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* Body — scrolls when content outgrows the viewport */}
        <div className="flex min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-12 sm:py-16">
          <div className="grid w-full flex-1 grid-cols-1 gap-10 self-center lg:grid-cols-2 lg:gap-0">

            {/* Nova — orb, simulated speech, then the two fields */}
            <div className="order-2 flex flex-col lg:order-1 lg:pr-12">
              <NovaIntroPanel
                step={step}
                brandName={brandName}
                onBrandNameChange={(v) => { setBrandName(v); setBrandNameError(false); }}
                website={website}
                onWebsiteChange={setWebsite}
                brandNameError={brandNameError}
                onStartBuilding={handleStartBuilding}
                onFinish={handleFinish}
              />
            </div>

            {/* Persistent bespoke card — visible from the very first paint */}
            <div className="order-1 lg:order-2 lg:border-l lg:border-border lg:pl-12">
              <div className="mx-auto max-w-md lg:sticky lg:top-0 lg:max-w-none">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <p className="font-card text-sm uppercase tracking-[0.22em] text-foreground">
                    Your Bespoke Card
                  </p>
                </div>
                <BrandCardFaceToggle
                  face={cardFace}
                  onFaceChange={setCardFace}
                  showBoth={(step === 'building' || step === 'done') && !isMobile}
                  className="mb-5"
                />
                <BrandCard
                  brandName={brandName}
                  websiteUrl={website}
                  storeUrl=""
                  basedIn={hasDemo('basedIn') ? CREATIVE_ZAVA_DEMO.basedIn : ''}
                  targetMarkets={hasDemo('targetMarkets') ? CREATIVE_ZAVA_DEMO.targetMarkets : []}
                  socialLinks={hasDemo('social') ? CREATIVE_ZAVA_DEMO.socialLinks : []}
                  descriptor={hasDemo('descriptor') ? CREATIVE_ZAVA_DEMO.descriptor : ''}
                  styleTags={hasDemo('styleTags') ? CREATIVE_ZAVA_DEMO.styleTags : []}
                  paletteSwatches={hasDemo('palette') ? CREATIVE_ZAVA_DEMO.paletteSwatches : []}
                  showImagery={hasDemo('imagery')}
                  productFocus={hasDemo('productFocus') ? CREATIVE_ZAVA_DEMO.productFocus : ''}
                  otherInfo={hasDemo('otherInfo') ? CREATIVE_ZAVA_DEMO.otherInfo : ''}
                  face={cardFace === 'both' && isMobile ? 'front' : cardFace}
                />
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
