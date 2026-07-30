import { useState, useEffect, useRef } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { X, Lock, Globe, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import { DARK_THEMES } from '@/components/ThemeLogo';
import { type CardFace } from '@/components/brand/BrandCard';
import { PRESET_SOCIAL_PLATFORMS, extractHandle, handleToUrl, urlMatchesHost } from '@/components/brand/social-icons';
import { isValidHttpUrl, isValidHandle, INVALID_URL_MESSAGE } from '@/lib/brand-profile-api';
import { BrandBookUpload } from '@/components/brand/BrandBookUpload';
import { trackBrandFormOpened, trackBrandFormSubmitted } from '@/lib/posthog-events';
import {
  type SalesChannel,
  normalizeUrl,
  CASCADE_ORDER,
  CHANNEL_META,
  CHANNEL_DETAIL_COPY,
  normalizeSalesChannelDetail,
  validateSalesChannelDetail,
} from '@/components/brand/sales-channel';
import { INPUT_CLASS, FieldLabel, IconInput } from '@/components/brand/JewelryBrandFormFields';
import { WhatsAppOnlyWarning } from '@/components/brand/WhatsAppOnlyWarning';
import { BespokeCardPreview } from '@/components/brand/BespokeCardPreview';
import { SocialProfilesSection } from '@/components/brand/SocialProfilesSection';

export interface BrandDetails {
  brand_name: string;
  website_url: string;
  physical_location: string;
  social_links: string[];
  based_in: string;
  target_markets: string[];
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
  const { theme } = useTheme();
  const isDark = DARK_THEMES.has(theme);
  const isMobile = useIsMobile();
  const initialHandles: Record<string, string> = {};
  const otherInitialLinks: string[] = [];
  for (const link of initial?.social_links ?? []) {
    const platform = PRESET_SOCIAL_PLATFORMS.find((p) => urlMatchesHost(link, p.match));
    if (platform && !initialHandles[platform.key]) {
      initialHandles[platform.key] = extractHandle(link, platform.match);
    } else {
      otherInitialLinks.push(link);
    }
  }

  // Historically website_url stored whatever channel was picked (see the
  // TODO below in handleContinue), so on edit we reverse-map it back to a
  // step in the cascade rather than assuming it's always a real website.
  const initialChannel = (() => {
    if (initial?.website_url) {
      if (urlMatchesHost(initial.website_url, 'instagram.com')) return { step: 'instagram' as SalesChannel, detail: initial.website_url };
      if (urlMatchesHost(initial.website_url, 'facebook.com')) return { step: 'facebook' as SalesChannel, detail: initial.website_url };
      if (urlMatchesHost(initial.website_url, 'wa.me')) return { step: 'whatsapp' as SalesChannel, detail: initial.website_url };
      return { step: 'website' as SalesChannel, detail: initial.website_url };
    }
    if (initialHandles.instagram) return { step: 'instagram' as SalesChannel, detail: initialHandles.instagram };
    return { step: CASCADE_ORDER[0], detail: '' };
  })();

  const [brandName, setBrandName] = useState(initial?.brand_name ?? '');
  const [basedIn, setBasedIn] = useState(initial?.based_in ?? '');
  const [targetMarkets, setTargetMarkets] = useState((initial?.target_markets ?? []).join(', '));
  // Index into CASCADE_ORDER: which channel the user is currently being
  // asked about. Skipping moves this forward; once it passes the end of
  // CASCADE_ORDER, no online channel is set (physical store is the fallback).
  const [channelStepIndex, setChannelStepIndex] = useState(() => CASCADE_ORDER.indexOf(initialChannel.step));
  const [salesChannelDetail, setSalesChannelDetail] = useState(initialChannel.detail);
  const salesChannel: SalesChannel | null = CASCADE_ORDER[channelStepIndex] ?? null;
  const [handles, setHandles] = useState<Record<string, string>>(initialHandles);
  const [extraLink, setExtraLink] = useState(otherInitialLinks[0] ?? '');
  const [storeMapsLink, setStoreMapsLink] = useState(initial?.physical_location ?? '');
  // Instagram usually starts the secondary profile list; if Instagram is the
  // primary sales channel, TikTok becomes the first secondary profile instead.
  const [revealed, setRevealed] = useState<string[]>(() => {
    const keys: string[] = [];
    if (initialHandles.tiktok) keys.push('tiktok');
    if (initialHandles.pinterest) keys.push('pinterest');
    if (otherInitialLinks.length > 0) keys.push('extra');
    return keys;
  });
  const [brandNameError, setBrandNameError] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<'salesChannel' | 'salesChannelDetail' | 'social' | 'extra' | 'storeMapsLink', string>>>({});
  // Card face follows what the user is filling: front fields flip to front,
  // back fields flip to back; the toggle stays available for manual control.
  // On completion the card auto-shows both faces once (desktop only), but
  // the user can always switch back to one side at a time.
  const [cardFace, setCardFace] = useState<CardFace>('front');
  const [hasBrandBook, setHasBrandBook] = useState(false);
  const autoBothShown = useRef(false);
  // WhatsApp-only warning: shown once at submit time if that's the only
  // online channel provided; "Continue anyway" replays the same submit.
  const [showWhatsappWarning, setShowWhatsappWarning] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState<{ channelDetail: string; mapsLink: string } | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (!dismissible) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, dismissible]);

  useEffect(() => {
    if (open) setTimeout(() => firstInputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    if (open) trackBrandFormOpened({ source });
  }, [open, source]);

  if (!open) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (dismissible && e.target === overlayRef.current) onClose();
  };

  const parsedMarkets = targetMarkets.split(',').map((m) => m.trim()).filter(Boolean);
  const defaultVisibleSocialKeys = salesChannel === 'instagram' ? ['tiktok'] : [];
  const visiblePlatforms = PRESET_SOCIAL_PLATFORMS.filter((p) => {
    if (p.key === 'instagram') return salesChannel !== 'instagram';
    return defaultVisibleSocialKeys.includes(p.key) || revealed.includes(p.key);
  });
  const nextReveal = ['tiktok', 'pinterest', 'extra'].find(
    (k) => !defaultVisibleSocialKeys.includes(k) && !revealed.includes(k),
  );
  const liveSocialLinks = PRESET_SOCIAL_PLATFORMS
    .map((p) => handleToUrl(handles[p.key] ?? '', p.urlPrefix))
    .filter(Boolean);
  // Once the card-visible fields are complete, offer (and auto-show once)
  // the Both view on desktop.
  const allDone = Boolean(
    brandName.trim() && basedIn.trim() && parsedMarkets.length &&
    salesChannelDetail.trim() && (salesChannel === 'instagram' || (handles.instagram ?? '').trim()),
  );
  if (allDone && !isMobile && !autoBothShown.current) {
    autoBothShown.current = true;
    setCardFace('both');
  }
  // Focus-follow only flips between single faces; it never leaves Both.
  const showFront = () => setCardFace((f) => (f === 'both' ? f : 'front'));
  const showBack = () => setCardFace((f) => (f === 'both' ? f : 'back'));

  // Kept outside handleContinue so the "Continue anyway" button on the
  // WhatsApp-only warning can call it directly, skipping the popup the
  // second time.
  const submitForm = (channelDetail: string, mapsLink: string) => {
    const extra = normalizeUrl(extraLink);
    const socialLinks = [...liveSocialLinks];
    if (extra) socialLinks.push(extra);
    for (const link of otherInitialLinks) {
      if (link !== extra && !socialLinks.includes(link)) socialLinks.push(link);
    }
    trackBrandFormSubmitted({
      source,
      has_website: Boolean(channelDetail),
      has_store: Boolean(mapsLink),
      has_location: Boolean(basedIn.trim()),
      has_markets: parsedMarkets.length > 0,
      social_count: socialLinks.length,
      has_brand_book: hasBrandBook,
    });
    onContinue({
      brand_name: brandName.trim(),
      // TODO(backend): replace this temporary mapping once the backend has a
      // dedicated primary sales channel type + detail field.
      website_url: channelDetail,
      physical_location: mapsLink,
      social_links: socialLinks.slice(0, 10),
      based_in: basedIn.trim(),
      target_markets: parsedMarkets,
    });
  };

  const handleContinue = () => {
    const errors: typeof fieldErrors = {};
    const missingBrandName = !brandName.trim();
    setBrandNameError(missingBrandName);
    if (missingBrandName) {
      firstInputRef.current?.focus();
    }
    const channelDetail = salesChannel ? normalizeSalesChannelDetail(salesChannel, salesChannelDetail) : '';
    if (salesChannel) {
      const channelError = validateSalesChannelDetail(salesChannel, channelDetail);
      if (channelError) errors.salesChannelDetail = channelError;
    }
    // Physical location is free text or a Maps link — not URL-validated.
    const mapsLink = storeMapsLink.trim();
    if (!salesChannel && !mapsLink) {
      errors.salesChannel = "Add an online channel, or your physical store's Maps link.";
    }
    const badHandle = PRESET_SOCIAL_PLATFORMS.find((p) => {
      const raw = (handles[p.key] ?? '').trim();
      return raw && !isValidHandle(extractHandle(raw, p.match));
    });
    if (badHandle) errors.social = 'Handles can only contain letters, numbers, dots, dashes and underscores.';
    const extra = normalizeUrl(extraLink);
    if (extra && !isValidHttpUrl(extra)) errors.extra = INVALID_URL_MESSAGE;
    if (missingBrandName || Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }
    if (salesChannel === 'whatsapp') {
      setPendingSubmit({ channelDetail, mapsLink });
      setShowWhatsappWarning(true);
      return;
    }
    submitForm(channelDetail, mapsLink);
  };

  return (
    <>
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-3 py-4 sm:px-4 sm:py-6 lg:backdrop-blur-md"
      onClick={handleOverlayClick}
    >
      <div className="relative flex max-h-[92vh] w-full max-w-7xl flex-col border border-border bg-background">

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
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-12 sm:py-10">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-0">

            {/* Form */}
            <div className="order-2 lg:order-1 lg:pr-10">
              <h2 className="font-display text-3xl text-foreground sm:text-4xl">
                Tell us about your jewelry brand
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
                The more we know about your brand, the more bespoke your FormaNova experience becomes.
              </p>

              <div className="mt-8 space-y-6">

            {/* Brand name */}
            <div className="space-y-2">
              <FieldLabel label="Brand name" required />
              <input
                ref={firstInputRef}
                type="text"
                value={brandName}
                onChange={(e) => { setBrandName(e.target.value); setBrandNameError(false); }}
                onFocus={showFront}
                maxLength={120}
                placeholder="Enter your brand or business name"
                className={cn(
                  INPUT_CLASS,
                  brandNameError && 'border-destructive focus:border-destructive',
                )}
              />
              {brandNameError && (
                <p className="text-xs text-destructive">Brand name is required.</p>
              )}
            </div>

            {/* Primary sales channel — asked one at a time, in priority order
                (website first, WhatsApp second-to-last); skipping advances
                to the next channel instead of showing them all at once. */}
            <div className="space-y-3">
              {salesChannel ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <FieldLabel label={CHANNEL_DETAIL_COPY[salesChannel].label} required />
                    <div className="flex items-center gap-3">
                      {channelStepIndex > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setChannelStepIndex((i) => Math.max(0, i - 1));
                            setSalesChannelDetail('');
                            setFieldErrors((p) => ({ ...p, salesChannel: undefined, salesChannelDetail: undefined }));
                          }}
                          className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
                        >
                          Back
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setChannelStepIndex((i) => i + 1);
                          setSalesChannelDetail('');
                          setFieldErrors((p) => ({ ...p, salesChannel: undefined, salesChannelDetail: undefined }));
                        }}
                        className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
                      >
                        {CHANNEL_DETAIL_COPY[salesChannel].skipLabel}
                      </button>
                    </div>
                  </div>
                  {salesChannel === 'store' && (
                    <p className="text-xs text-muted-foreground">
                      {CHANNEL_DETAIL_COPY.store.helper}
                    </p>
                  )}
                  <IconInput
                    icon={CHANNEL_META[salesChannel].Icon}
                    type="text"
                    value={salesChannelDetail}
                    onChange={(e) => { setSalesChannelDetail(e.target.value); setFieldErrors((p) => ({ ...p, salesChannelDetail: undefined })); }}
                    onFocus={showBack}
                    maxLength={200}
                    placeholder={CHANNEL_DETAIL_COPY[salesChannel].placeholder}
                    error={Boolean(fieldErrors.salesChannelDetail)}
                  />
                  {fieldErrors.salesChannelDetail && <p className="text-xs text-destructive">{fieldErrors.salesChannelDetail}</p>}
                </div>
              ) : (
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      setChannelStepIndex(CASCADE_ORDER.length - 1);
                      setFieldErrors((p) => ({ ...p, salesChannel: undefined }));
                    }}
                    className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
                  >
                    Back to online channels
                  </button>
                  {fieldErrors.salesChannel && <p className="text-xs text-destructive">{fieldErrors.salesChannel}</p>}
                </div>
              )}
            </div>

            {/* Physical store — its own plain field, same weight as Location/Target markets */}
            <div className="space-y-2">
              <FieldLabel label="Physical store: Google Maps link" />
              <IconInput
                icon={MapPin}
                type="text"
                value={storeMapsLink}
                onChange={(e) => { setStoreMapsLink(e.target.value); setFieldErrors((p) => ({ ...p, storeMapsLink: undefined, salesChannel: undefined })); }}
                onFocus={showBack}
                maxLength={300}
                placeholder="maps.google.com/..."
                error={Boolean(fieldErrors.storeMapsLink)}
              />
              {fieldErrors.storeMapsLink && <p className="text-xs text-destructive">{fieldErrors.storeMapsLink}</p>}
            </div>

            {/* Location + Target markets */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-4">
              <div className="space-y-2">
                <FieldLabel label="Location" />
                <IconInput
                  icon={MapPin}
                  type="text"
                  value={basedIn}
                  onChange={(e) => setBasedIn(e.target.value)}
                  onFocus={showBack}
                  maxLength={80}
                  placeholder="City, country"
                />
              </div>
              <div className="space-y-2">
                <FieldLabel label="Target markets" />
                <IconInput
                  icon={Globe}
                  type="text"
                  value={targetMarkets}
                  onChange={(e) => setTargetMarkets(e.target.value)}
                  onFocus={showBack}
                  maxLength={120}
                  placeholder="US, UAE, Global"
                />
              </div>
            </div>

            {/* Social profiles */}
            <SocialProfilesSection
              visiblePlatforms={visiblePlatforms}
              handles={handles}
              error={fieldErrors.social}
              extraLink={extraLink}
              extraError={fieldErrors.extra}
              revealed={revealed}
              nextReveal={nextReveal}
              onHandleChange={(key, value) => {
                setHandles((prev) => ({ ...prev, [key]: value }));
                setFieldErrors((p) => ({ ...p, social: undefined }));
              }}
              onRemoveHandle={(key) => {
                if (key !== 'instagram') setRevealed((prev) => prev.filter((k) => k !== key));
                setHandles((prev) => ({ ...prev, [key]: '' }));
              }}
              onExtraChange={(value) => { setExtraLink(value); setFieldErrors((p) => ({ ...p, extra: undefined })); }}
              onRemoveExtra={() => {
                setRevealed((prev) => prev.filter((k) => k !== 'extra'));
                setExtraLink('');
              }}
              onReveal={(key) => setRevealed((prev) => [...prev, key])}
              onFocus={showBack}
            />

            {/* Brand book */}
            <div className="space-y-2">
              <FieldLabel label="Brand book" />
              <BrandBookUpload onHasFileChange={setHasBrandBook} />
            </div>

            {/* Privacy */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center gap-2">
                <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
                  <span className="font-semibold text-foreground">Strictly confidential.</span>{' '}
                  Your data is never sold, never used to train AI. Used solely to shape FormaNova around your brand.
                </p>
              </div>
            </div>

            {/* CTA */}
            <button
              type="button"
              onClick={handleContinue}
              className={cn(
                'w-full py-4 text-sm font-medium transition-colors',
                isDark
                  ? 'border border-foreground bg-transparent text-foreground hover:bg-foreground hover:text-background'
                  : 'bg-foreground text-background hover:opacity-90',
              )}
            >
              Save and Continue
            </button>
              </div>
            </div>

            {/* Live bespoke card stage */}
            <BespokeCardPreview
              cardFace={cardFace}
              onFaceChange={setCardFace}
              allDone={allDone}
              isMobile={isMobile}
              brandName={brandName}
              salesChannelDetail={salesChannelDetail}
              basedIn={basedIn}
              targetMarkets={parsedMarkets}
              socialLinks={liveSocialLinks}
            />

          </div>
        </div>

      </div>
    </div>

    {showWhatsappWarning && (
      <WhatsAppOnlyWarning
        isDark={isDark}
        onContinueAnyway={() => {
          if (pendingSubmit) submitForm(pendingSubmit.channelDetail, pendingSubmit.mapsLink);
          setShowWhatsappWarning(false);
        }}
        onGoBack={() => setShowWhatsappWarning(false)}
      />
    )}
    </>
  );
}
