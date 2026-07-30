import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { BrandCard, BrandCardFaceToggle, type CardFace } from '@/components/brand/BrandCard';
import { NovaIntroPanel, type NovaOnboardingStep, type InsightFeedItem } from '@/components/brand/NovaIntroPanel';
import {
  CREATIVE_ZAVA_DEMO,
  INSIGHT_REVEAL_ORDER,
  BACK_SIDE_KEYS,
  type InsightKey,
  type InsightFeedKey,
  type CreativeZavaProfile,
} from '@/components/brand/creative-zava-demo';
import { trackBrandFormOpened, trackBrandFormSubmitted } from '@/lib/posthog-events';

export interface BrandDetails {
  brand_name: string;
  website_url: string;
  physical_location: string;
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

/** How long each staggered scan-reveal is spaced apart, in ms. */
const REVEAL_STEP_MS = 700;
const REVEAL_START_DELAY_MS = 600;
const REVEAL_FINISH_PAUSE_MS = 700;
/** How long a back-side discovery holds the card flipped before returning. */
const FLIP_HOLD_MS = 1400;

/** Maps a feed key to the matching BrandCard back-face row for the auto-flip highlight. */
const HIGHLIGHT_FIELD_MAP: Partial<Record<InsightFeedKey, NonNullable<Parameters<typeof BrandCard>[0]['highlightField']>>> = {
  productFocus: 'productFocus',
  targetMarkets: 'targetMarkets',
  audience: 'audience',
  location: 'basedIn',
  website: 'website',
  social: 'social',
  otherInfo: 'otherInfo',
};

function insightValue(key: InsightFeedKey, profile: CreativeZavaProfile, website: string): string {
  switch (key) {
    case 'identity': return profile.identity;
    case 'productFocus': return profile.productFocus;
    case 'visualStyle': return profile.visualStyle.join(', ');
    case 'targetMarkets': return profile.targetMarkets.join(', ');
    case 'audience': return profile.audience;
    case 'location': return profile.basedIn;
    case 'website': return normalizeUrl(website) || website;
    case 'social': return profile.socialLinks.join(', ');
    case 'otherInfo': return profile.otherInfo;
    default: return '';
  }
}

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
  const [step, setStep] = useState<NovaOnboardingStep>('intro');
  const [brandName, setBrandName] = useState(initial?.brand_name ?? '');
  const [website, setWebsite] = useState(initial?.website_url ?? '');
  const [brandNameError, setBrandNameError] = useState(false);
  const [cardFace, setCardFace] = useState<CardFace>('front');
  const [revealedKeys, setRevealedKeys] = useState<InsightKey[]>([]);
  const [profile, setProfile] = useState<CreativeZavaProfile>(() => ({
    ...CREATIVE_ZAVA_DEMO,
    palette: [...CREATIVE_ZAVA_DEMO.palette],
    visualStyle: [...CREATIVE_ZAVA_DEMO.visualStyle],
    targetMarkets: [...CREATIVE_ZAVA_DEMO.targetMarkets],
    socialLinks: [...CREATIVE_ZAVA_DEMO.socialLinks],
  }));
  const [callSeconds, setCallSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [highlightKey, setHighlightKey] = useState<InsightFeedKey | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const cardFaceRef = useRef<CardFace>('front');
  const previousFaceRef = useRef<CardFace>('front');
  const flipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { cardFaceRef.current = cardFace; }, [cardFace]);

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

  // Call timer — ticks while the scan is live, freezes once done.
  useEffect(() => {
    if (step !== 'scanning') return;
    const id = setInterval(() => setCallSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [step]);

  // Briefly flips the card to Back and pulses the newly-discovered field, then
  // returns to whichever face the user was already on. A new flip mid-hold
  // extends the same hold window instead of stacking a second flip.
  const triggerBackFlip = (key: InsightFeedKey) => {
    if (!flipTimeoutRef.current) {
      previousFaceRef.current = cardFaceRef.current;
    } else {
      clearTimeout(flipTimeoutRef.current);
    }
    setCardFace('back');
    setHighlightKey(key);
    flipTimeoutRef.current = setTimeout(() => {
      setCardFace(previousFaceRef.current);
      setHighlightKey(null);
      flipTimeoutRef.current = null;
    }, FLIP_HOLD_MS);
  };

  // Once the scan starts, findings reveal one at a time.
  useEffect(() => {
    if (step !== 'scanning') return;
    setRevealedKeys([]);
    setCallSeconds(0);
    const timers = INSIGHT_REVEAL_ORDER.map((key, i) =>
      setTimeout(() => {
        setRevealedKeys((prev) => [...prev, key]);
        if (BACK_SIDE_KEYS.has(key)) triggerBackFlip(key);
      }, REVEAL_START_DELAY_MS + i * REVEAL_STEP_MS),
    );
    const finishTimer = setTimeout(
      () => setStep('done'),
      REVEAL_START_DELAY_MS + INSIGHT_REVEAL_ORDER.length * REVEAL_STEP_MS + REVEAL_FINISH_PAUSE_MS,
    );
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(finishTimer);
    };
  }, [step]);

  if (!open) return null;

  const revealed = (key: InsightKey) => step === 'done' || revealedKeys.includes(key);

  const feedItems: InsightFeedItem[] = INSIGHT_REVEAL_ORDER.filter(revealed).map((key) => ({
    key,
    value: insightValue(key, profile, website),
  }));

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (dismissible && e.target === overlayRef.current) onClose();
  };

  const handleStartBuilding = () => {
    if (!brandName.trim()) {
      setBrandNameError(true);
      return;
    }
    setBrandNameError(false);
    setStep('scanning');
  };

  const handleEditInsight = (key: InsightFeedKey, value: string) => {
    setProfile((prev) => {
      switch (key) {
        case 'identity': return { ...prev, identity: value };
        case 'productFocus': return { ...prev, productFocus: value };
        case 'visualStyle': return { ...prev, visualStyle: value.split(',').map((s) => s.trim()).filter(Boolean) };
        case 'targetMarkets': return { ...prev, targetMarkets: value.split(',').map((s) => s.trim()).filter(Boolean) };
        case 'audience': return { ...prev, audience: value };
        case 'location': return { ...prev, basedIn: value };
        case 'website': setWebsite(value); return prev;
        case 'social': return { ...prev, socialLinks: value.split(',').map((s) => s.trim()).filter(Boolean) };
        case 'otherInfo': return { ...prev, otherInfo: value };
        default: return prev;
      }
    });
  };

  const handleFinish = () => {
    const websiteUrl = normalizeUrl(website);
    trackBrandFormSubmitted({
      source,
      has_website: Boolean(websiteUrl),
      has_store: false,
      has_location: true,
      has_markets: true,
      social_count: profile.socialLinks.length,
      has_brand_book: false,
    });
    onContinue({
      brand_name: brandName.trim(),
      website_url: websiteUrl,
      physical_location: '',
      social_links: profile.socialLinks,
      based_in: profile.basedIn,
      target_markets: profile.targetMarkets,
    });
  };

  const summaryLine = step === 'done'
    ? `Here's what I understand about your brand so far: ${brandName.trim() || 'your brand'} is ${profile.identity.toLowerCase()} If anything feels off, you can edit it here or tell me what to change.`
    : undefined;

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

            {/* Nova — orb, simulated speech, fields, then the live scanning feed */}
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
                callSeconds={callSeconds}
                muted={muted}
                onToggleMute={() => setMuted((m) => !m)}
                onEndCall={() => setStep('done')}
                insights={feedItems}
                onEditInsight={handleEditInsight}
                palette={profile.palette}
                onEditPalette={(palette) => setProfile((prev) => ({ ...prev, palette }))}
                summaryLine={summaryLine}
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
                  className="mb-5"
                />
                <BrandCard
                  brandName={brandName}
                  websiteUrl={revealed('website') ? website : ''}
                  storeUrl=""
                  basedIn={revealed('location') ? profile.basedIn : ''}
                  targetMarkets={revealed('targetMarkets') ? profile.targetMarkets : []}
                  socialLinks={revealed('social') ? profile.socialLinks : []}
                  descriptor={revealed('identity') ? profile.identity : ''}
                  styleTags={revealed('visualStyle') ? profile.visualStyle : []}
                  paletteSwatches={revealed('palette') ? profile.palette : []}
                  productFocus={revealed('productFocus') ? profile.productFocus : ''}
                  audience={revealed('audience') ? profile.audience : ''}
                  otherInfo={revealed('otherInfo') ? profile.otherInfo : ''}
                  accentColor={revealed('palette') ? profile.palette[0] : undefined}
                  highlightField={highlightKey ? HIGHLIGHT_FIELD_MAP[highlightKey] : null}
                  face={cardFace}
                />
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
