import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { BrandCard, BrandCardFaceToggle, type CardFace } from '@/components/brand/BrandCard';
import { NovaIntroPanel, type NovaOnboardingStep, type InsightFeedItem } from '@/components/brand/NovaIntroPanel';
import {
  INSIGHT_DISPLAY_ORDER,
  type InsightKey,
  type InsightFeedKey,
} from '@/components/brand/brand-insight-meta';
import {
  EMPTY_BRAND_SCAN_INSIGHTS,
  EMPTY_BRAND_SCAN_PROGRESS,
  runBrandScan,
  type BrandScanInsights,
  type BrandScanProgress,
  type BrandScanResult,
} from '@/lib/brand-scan-api';
import { INVALID_URL_MESSAGE, isValidHttpUrl, normalizeUrl } from '@/lib/brand-profile-api';
import { trackBrandFormOpened, trackBrandFormSubmitted } from '@/lib/posthog-events';

export interface BrandDetails {
  brand_name: string;
  website_url: string;
  storefront_url: string;
  physical_location: string;
  social_links: string[];
  based_in: string;
  target_markets: string[];
}

function insightValue(key: InsightFeedKey, profile: BrandScanInsights, website: string): string {
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

function insightKeys(profile: BrandScanInsights): InsightKey[] {
  return INSIGHT_DISPLAY_ORDER.filter((key) => {
    if (key === 'website') return true;
    if (key === 'palette') return profile.palette.length > 0;
    return Boolean(insightValue(key, profile, ''));
  });
}

function scanNotice(result: BrandScanResult): string | null {
  if (result.status === 'partial' || result.readinessLevel === 'non_storefront') {
    return 'Nova could only build a partial read from this URL. Review every available finding carefully before confirming.';
  }
  if (result.readinessLevel && result.readinessLevel !== 'full') {
    return `This scan has ${result.readinessLevel.replace(/_/g, ' ')} readiness. Please review every finding before confirming.`;
  }
  const hasUsableInsight = Object.entries(result.insights).some(([, value]) => (
    Array.isArray(value) ? value.length > 0 : Boolean(value)
  ));
  if (!hasUsableInsight) {
    return 'Nova finished the scan but found very little usable brand information. Add or correct the details before confirming.';
  }
  return null;
}

function conciseCardDescriptor(identity: string): string {
  const firstSentence = identity.trim().split(/(?<=[.!?])\s+/)[0] || '';
  if (firstSentence.length <= 110) return firstSentence;
  return `${firstSentence.slice(0, 107).trimEnd()}…`;
}

function conciseCardDetail(value: string): string {
  return value.split('\n').map((line) => line.trim()).find(Boolean) || '';
}

function normalizePhysicalLocation(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const looksLikeLink = /^(https?:\/\/|www\.|maps\.|goo\.gl\/maps|google\.[^/]+\/maps)/i.test(trimmed);
  return looksLikeLink ? normalizeUrl(trimmed) : trimmed;
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
  const [website, setWebsite] = useState(initial?.storefront_url || initial?.website_url || '');
  const [brandNameError, setBrandNameError] = useState(false);
  const [websiteError, setWebsiteError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState('Starting your brand scan…');
  const [resultNotice, setResultNotice] = useState<string | null>(null);
  const [cardFace, setCardFace] = useState<CardFace>('front');
  const [availableKeys, setAvailableKeys] = useState<InsightKey[]>([]);
  const [profile, setProfile] = useState<BrandScanInsights>(EMPTY_BRAND_SCAN_INSIGHTS);
  const [scanProgress, setScanProgress] = useState<BrandScanProgress>(EMPTY_BRAND_SCAN_PROGRESS);
  const [physicalLocation, setPhysicalLocation] = useState(initial?.physical_location ?? '');
  const [missingFields, setMissingFields] = useState({
    basedIn: false,
    targetMarkets: false,
    socialLinks: false,
    physicalLocation: false,
  });

  const overlayRef = useRef<HTMLDivElement>(null);
  const scanAbortRef = useRef<AbortController | null>(null);

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

  // A scan can outlive the modal unless it is explicitly cancelled.
  useEffect(() => {
    if (!open) scanAbortRef.current?.abort();
    return () => scanAbortRef.current?.abort();
  }, [open]);

  if (!open) return null;

  const revealed = (key: InsightKey) => availableKeys.includes(key)
    && (step === 'scanning' || step === 'done' || step === 'next');

  const feedItems: InsightFeedItem[] = INSIGHT_DISPLAY_ORDER.filter(revealed).map((key) => ({
    key,
    value: insightValue(key, profile, website),
  }));

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (dismissible && e.target === overlayRef.current) onClose();
  };

  const handleStartBuilding = async () => {
    const normalizedWebsite = normalizeUrl(website);
    const missingBrandName = !brandName.trim();
    const invalidWebsite = !isValidHttpUrl(normalizedWebsite);
    setBrandNameError(missingBrandName);
    setWebsiteError(invalidWebsite ? INVALID_URL_MESSAGE : null);
    setScanError(null);
    if (missingBrandName || invalidWebsite) return;

    scanAbortRef.current?.abort();
    const controller = new AbortController();
    scanAbortRef.current = controller;
    setWebsite(normalizedWebsite);
    setAvailableKeys(['website']);
    setProfile(EMPTY_BRAND_SCAN_INSIGHTS);
    setScanProgress(EMPTY_BRAND_SCAN_PROGRESS);
    setMissingFields({ basedIn: false, targetMarkets: false, socialLinks: false, physicalLocation: false });
    setResultNotice(null);
    setScanStatus('Starting your brand scan…');
    setStep('scanning');

    try {
      const result = await runBrandScan(normalizedWebsite, {
        signal: controller.signal,
        onProgress: (progress) => {
          setScanProgress(progress);
          const discoveredPalette = progress.sitePalette.length > 0
            ? progress.sitePalette
            : progress.photoPalette;
          setProfile((current) => ({
            ...current,
            palette: discoveredPalette.length > 0 ? discoveredPalette : current.palette,
            productFocus: progress.productTitles.length > 0
              ? progress.productTitles.join(', ')
              : current.productFocus,
          }));
          setAvailableKeys((keys) => {
            const next = new Set(keys);
            if (discoveredPalette.length > 0) next.add('palette');
            if (progress.productTitles.length > 0) next.add('productFocus');
            return [...next];
          });
        },
        onStatus: () => setScanStatus('Analyzing your storefront and visual identity…'),
      });
      if (!result || controller.signal.aborted) return;
      const resultStatus = result.status.toLowerCase();
      if (resultStatus === 'failed' || resultStatus === 'budget_exhausted') {
        setScanError(result.errorMessage || 'The brand scan failed. Please try again.');
        setStep('fields');
        return;
      }
      if (resultStatus === 'blocked' || resultStatus === 'unsafe_url') {
        const reason = resultStatus === 'unsafe_url' || result.errorCode === 'unsafe_url'
          ? 'This URL could not be scanned safely. Enter the public URL of your online store.'
          : result.errorCode === 'robots_denied'
          ? 'This site blocks automated scanning. Try your public storefront URL instead.'
          : 'This storefront could not be scanned. Check the URL and try again.';
        setScanError(reason);
        setStep('fields');
        return;
      }
      setProfile(result.insights);
      setMissingFields({
        basedIn: !result.insights.basedIn,
        targetMarkets: result.insights.targetMarkets.length === 0,
        socialLinks: result.insights.socialLinks.length === 0,
        physicalLocation: !physicalLocation.trim(),
      });
      setAvailableKeys(insightKeys(result.insights));
      setResultNotice(scanNotice(result));
      setStep('done');
    } catch (error) {
      if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) return;
      setScanError(error instanceof Error ? error.message : 'The brand scan failed. Please try again.');
      setStep('fields');
    } finally {
      if (scanAbortRef.current === controller) scanAbortRef.current = null;
    }
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
    const storefrontUrl = normalizeUrl(website);
    trackBrandFormSubmitted({
      source,
      has_website: Boolean(initial?.website_url),
      has_store: Boolean(storefrontUrl),
      has_location: Boolean(profile.basedIn),
      has_markets: profile.targetMarkets.length > 0,
      social_count: profile.socialLinks.length,
      has_brand_book: false,
    });
    onContinue({
      brand_name: brandName.trim(),
      website_url: initial?.website_url ?? '',
      storefront_url: storefrontUrl,
      physical_location: normalizePhysicalLocation(physicalLocation),
      social_links: profile.socialLinks.map(normalizeUrl).filter(isValidHttpUrl),
      based_in: profile.basedIn,
      target_markets: profile.targetMarkets,
    });
  };

  const summaryLine = step === 'done'
    ? `This is what I understand about ${brandName.trim() || 'your brand'}. Please correct anything that feels off.`
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
                onWebsiteChange={(value) => { setWebsite(value); setWebsiteError(null); setScanError(null); }}
                brandNameError={brandNameError}
                websiteError={websiteError}
                scanError={scanError}
                scanStatus={scanStatus}
                scanProgress={scanProgress}
                scanNotice={resultNotice}
                onSelectMessage={() => setStep('fields')}
                onStartBuilding={handleStartBuilding}
                onConfirm={() => setStep('next')}
                onAddMore={() => setAvailableKeys((keys) => keys.includes('otherInfo') ? keys : [...keys, 'otherInfo'])}
                onFinish={handleFinish}
                insights={feedItems}
                onEditInsight={handleEditInsight}
                palette={profile.palette}
                onEditPalette={(palette) => setProfile((prev) => ({ ...prev, palette }))}
                summaryLine={summaryLine}
                missingDetails={{
                  showBasedIn: missingFields.basedIn,
                  showTargetMarkets: missingFields.targetMarkets,
                  showSocialLinks: missingFields.socialLinks,
                  showPhysicalLocation: missingFields.physicalLocation,
                  basedIn: profile.basedIn,
                  targetMarkets: profile.targetMarkets,
                  socialLinks: profile.socialLinks,
                  physicalLocation,
                  onBasedInChange: (value) => {
                    setProfile((current) => ({ ...current, basedIn: value }));
                    setAvailableKeys((keys) => keys.includes('location') ? keys : [...keys, 'location']);
                  },
                  onTargetMarketsChange: (value) => {
                    setProfile((current) => ({ ...current, targetMarkets: value }));
                    setAvailableKeys((keys) => keys.includes('targetMarkets') ? keys : [...keys, 'targetMarkets']);
                  },
                  onSocialLinksChange: (value) => {
                    setProfile((current) => ({ ...current, socialLinks: value }));
                    setAvailableKeys((keys) => keys.includes('social') ? keys : [...keys, 'social']);
                  },
                  onPhysicalLocationChange: setPhysicalLocation,
                }}
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
                  websiteUrl=""
                  storeUrl={revealed('website') ? website : ''}
                  basedIn={revealed('location') ? profile.basedIn : ''}
                  targetMarkets={revealed('targetMarkets') ? profile.targetMarkets : []}
                  socialLinks={revealed('social') ? profile.socialLinks : []}
                  descriptor={revealed('identity') ? conciseCardDescriptor(profile.identity) : ''}
                  styleTags={revealed('visualStyle') ? profile.visualStyle.slice(0, 3) : []}
                  paletteSwatches={revealed('palette') ? profile.palette.slice(0, 6) : []}
                  productFocus={revealed('productFocus') ? profile.productFocus : ''}
                  audience={revealed('audience') ? profile.audience : ''}
                  otherInfo={revealed('otherInfo') ? conciseCardDetail(profile.otherInfo) : ''}
                  accentColor={revealed('palette') ? profile.palette[0] : undefined}
                  highlightField={null}
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
