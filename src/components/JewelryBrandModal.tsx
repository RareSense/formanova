import { useState, useEffect, useRef } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { X, Plus, Lock, Check, Globe, MapPin, ShoppingBag, MessageCircle, Store, MoreHorizontal, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import { DARK_THEMES } from '@/components/ThemeLogo';
import { BrandCard, BrandCardFaceToggle, type CardFace } from '@/components/brand/BrandCard';
import { InstagramIcon, PRESET_SOCIAL_PLATFORMS, extractHandle, handleToUrl, urlMatchesHost } from '@/components/brand/social-icons';
import { isValidHttpUrl, isValidHandle, INVALID_URL_MESSAGE } from '@/lib/brand-profile-api';
import { BrandBookUpload } from '@/components/brand/BrandBookUpload';
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

const INPUT_CLASS =
  'w-full border border-border bg-background px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-foreground transition-colors';

type SalesChannel = 'website' | 'instagram' | 'facebook' | 'whatsapp' | 'store' | 'marketplace' | 'other';

const SALES_CHANNELS: {
  key: SalesChannel;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: 'website', label: 'Website', Icon: Globe },
  { key: 'instagram', label: 'Instagram', Icon: InstagramIcon },
  { key: 'facebook', label: 'Facebook', Icon: Link2 },
  { key: 'whatsapp', label: 'WhatsApp', Icon: MessageCircle },
  { key: 'store', label: 'Physical store', Icon: Store },
  { key: 'marketplace', label: 'Marketplace', Icon: ShoppingBag },
  { key: 'other', label: 'Other', Icon: MoreHorizontal },
];

const CHANNEL_DETAIL_COPY: Record<SalesChannel, { label: string; placeholder: string; helper?: string }> = {
  website: {
    label: 'Website link',
    placeholder: 'yourbrand.com',
  },
  instagram: {
    label: 'Instagram link or handle',
    placeholder: 'instagram.com/yourbrand or @yourbrand',
  },
  facebook: {
    label: 'Facebook page link',
    placeholder: 'facebook.com/yourbrand or @yourbrand',
  },
  whatsapp: {
    label: 'WhatsApp number',
    placeholder: '+1 555 123 4567',
  },
  store: {
    label: 'Store name and city',
    placeholder: 'Store name, city',
  },
  marketplace: {
    label: 'Marketplace shop link',
    placeholder: 'etsy.com/shop/yourbrand',
    helper: 'Examples: Etsy, Amazon, IndiaMART',
  },
  other: {
    label: 'Link or details',
    placeholder: 'Briefly describe how customers buy from you',
  },
};

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className="text-sm font-medium text-foreground">
      {label}{required && <span className="ml-1 text-destructive">*</span>}
    </label>
  );
}

function normalizeSalesChannelDetail(channel: SalesChannel, value: string): string {
  const raw = value.trim();
  if (!raw) return '';
  if (channel === 'instagram') {
    const handle = extractHandle(raw, 'instagram.com');
    if (isValidHandle(handle)) return `https://instagram.com/${handle}`;
  }
  if (channel === 'facebook') {
    const handle = extractHandle(raw, 'facebook.com');
    if (isValidHandle(handle)) return `https://facebook.com/${handle}`;
  }
  if (channel === 'whatsapp' && !/^https?:\/\//i.test(raw) && !/^[\w.-]+\.[A-Za-z]{2,}/.test(raw)) {
    const digits = raw.replace(/[^\d]/g, '');
    if (digits.length >= 7) return `https://wa.me/${digits}`;
  }
  if (channel === 'store' && !/^[\w.-]+\.[A-Za-z]{2,}/.test(raw) && !/^https?:\/\//i.test(raw)) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(raw)}`;
  }
  if (channel === 'other' && !/^[\w.-]+\.[A-Za-z]{2,}/.test(raw) && !/^https?:\/\//i.test(raw)) {
    return `https://www.google.com/search?q=${encodeURIComponent(raw)}`;
  }
  return normalizeUrl(raw);
}

function validateSalesChannelDetail(channel: SalesChannel, normalized: string): string | undefined {
  if (!normalized) return 'Sales channel details are required.';
  if (channel === 'other') return undefined;
  if (!isValidHttpUrl(normalized)) {
    return INVALID_URL_MESSAGE;
  }
  return undefined;
}

/** Input with a muted trailing icon, as in the bespoke mockup. */
function IconInput({
  icon: Icon,
  error,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  icon: React.ComponentType<{ className?: string }>;
  error?: boolean;
}) {
  return (
    <div className="relative">
      <input
        {...props}
        className={cn(INPUT_CLASS, 'pr-11', error && 'border-destructive focus:border-destructive', className)}
      />
      <Icon className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
    </div>
  );
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

  const [brandName, setBrandName] = useState(initial?.brand_name ?? '');
  const [basedIn, setBasedIn] = useState(initial?.based_in ?? '');
  const [targetMarkets, setTargetMarkets] = useState((initial?.target_markets ?? []).join(', '));
  const [salesChannel, setSalesChannel] = useState<SalesChannel | null>(() => {
    if (initial?.store_url) return 'marketplace';
    if (initial?.website_url) return 'website';
    return null;
  });
  const [salesChannelDetail, setSalesChannelDetail] = useState(initial?.store_url || initial?.website_url || '');
  const [handles, setHandles] = useState<Record<string, string>>(initialHandles);
  const [extraLink, setExtraLink] = useState(otherInitialLinks[0] ?? '');
  // Instagram always shows; "Add more" reveals TikTok, Pinterest, then a free URL row.
  const [revealed, setRevealed] = useState<string[]>(() => {
    const keys: string[] = [];
    if (initialHandles.tiktok) keys.push('tiktok');
    if (initialHandles.pinterest) keys.push('pinterest');
    if (otherInitialLinks.length > 0) keys.push('extra');
    return keys;
  });
  const [brandNameError, setBrandNameError] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<'salesChannel' | 'salesChannelDetail' | 'social' | 'extra', string>>>({});
  // Card face follows what the user is filling: front fields flip to front,
  // back fields flip to back; the toggle stays available for manual control.
  // On completion the card auto-shows both faces once (desktop only), but
  // the user can always switch back to one side at a time.
  const [cardFace, setCardFace] = useState<CardFace>('front');
  const [hasBrandBook, setHasBrandBook] = useState(false);
  const autoBothShown = useRef(false);

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
  const visiblePlatforms = PRESET_SOCIAL_PLATFORMS.filter(
    (p) => p.key === 'instagram' || revealed.includes(p.key),
  );
  const nextReveal = ['tiktok', 'pinterest', 'extra'].find((k) => !revealed.includes(k));
  const liveSocialLinks = PRESET_SOCIAL_PLATFORMS
    .map((p) => handleToUrl(handles[p.key] ?? '', p.urlPrefix))
    .filter(Boolean);
  // Once the card-visible fields are complete, offer (and auto-show once)
  // the Both view on desktop.
  const allDone = Boolean(
    brandName.trim() && basedIn.trim() && parsedMarkets.length &&
    salesChannelDetail.trim() && (handles.instagram ?? '').trim(),
  );
  if (allDone && !isMobile && !autoBothShown.current) {
    autoBothShown.current = true;
    setCardFace('both');
  }
  // Focus-follow only flips between single faces; it never leaves Both.
  const showFront = () => setCardFace((f) => (f === 'both' ? f : 'front'));
  const showBack = () => setCardFace((f) => (f === 'both' ? f : 'back'));

  const handleContinue = () => {
    const errors: typeof fieldErrors = {};
    const missingBrandName = !brandName.trim();
    if (missingBrandName) {
      setBrandNameError(true);
      firstInputRef.current?.focus();
    }
    if (!salesChannel) errors.salesChannel = 'Choose where customers mainly buy.';
    const channelDetail = salesChannel ? normalizeSalesChannelDetail(salesChannel, salesChannelDetail) : '';
    if (salesChannel) {
      const channelError = validateSalesChannelDetail(salesChannel, channelDetail);
      if (channelError) errors.salesChannelDetail = channelError;
    }
    const badHandle = PRESET_SOCIAL_PLATFORMS.find((p) => {
      const raw = (handles[p.key] ?? '').trim();
      return raw && !isValidHandle(extractHandle(raw, p.match));
    });
    if (badHandle) errors.social = 'Handles can only contain letters, numbers, dots, dashes and underscores.';
    const extra = normalizeUrl(extraLink);
    if (extra && !isValidHttpUrl(extra)) errors.extra = INVALID_URL_MESSAGE;
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }
    const socialLinks = [...liveSocialLinks];
    if (extra) socialLinks.push(extra);
    for (const link of otherInitialLinks) {
      if (link !== extra && !socialLinks.includes(link)) socialLinks.push(link);
    }
    trackBrandFormSubmitted({
      source,
      has_website: Boolean(channelDetail),
      has_store: salesChannel === 'store' || salesChannel === 'marketplace',
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
      store_url: '',
      social_links: socialLinks.slice(0, 10),
      based_in: basedIn.trim(),
      target_markets: parsedMarkets,
    });
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6 lg:backdrop-blur-md"
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
        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-10 sm:px-12">
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

            {/* Primary sales channel */}
            <div className="space-y-3">
              <FieldLabel label="Where do customers mainly buy your jewelry?" required />
              <div className="grid max-w-[360px] grid-cols-4 gap-2">
                {SALES_CHANNELS.map(({ key, label, Icon }) => {
                  const selected = salesChannel === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setSalesChannel(key);
                        setSalesChannelDetail('');
                        setFieldErrors((p) => ({
                          ...p,
                          salesChannel: undefined,
                          salesChannelDetail: undefined,
                        }));
                      }}
                      className={cn(
                        'flex aspect-square min-h-[76px] w-full max-w-[84px] flex-col items-center justify-center gap-1.5 border bg-background px-1.5 text-center transition-colors',
                        selected
                          ? 'border-[#7f1d3a] bg-[#7f1d3a]/[0.06] text-foreground'
                          : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground',
                        fieldErrors.salesChannel && 'border-destructive',
                      )}
                      aria-pressed={selected}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span className="text-[11px] font-medium leading-tight sm:text-xs">{label}</span>
                    </button>
                  );
                })}
              </div>
              {fieldErrors.salesChannel && <p className="text-xs text-destructive">{fieldErrors.salesChannel}</p>}
            </div>

            {salesChannel && (
              <div className="space-y-2">
                <FieldLabel label={CHANNEL_DETAIL_COPY[salesChannel].label} required />
                {salesChannel === 'marketplace' && (
                  <p className="text-xs text-muted-foreground">
                    {CHANNEL_DETAIL_COPY.marketplace.helper}
                  </p>
                )}
                <IconInput
                  icon={salesChannel === 'store' ? Store : SALES_CHANNELS.find((c) => c.key === salesChannel)?.Icon ?? Link2}
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
            )}

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
            <div className="space-y-2">
              <FieldLabel label="Social profiles" />
              <div className="space-y-2">
                {visiblePlatforms.map(({ key, label, Icon }) => (
                  <div
                    key={key}
                    className={cn(
                      'flex items-center border border-border bg-background focus-within:border-foreground transition-colors',
                      fieldErrors.social && 'border-destructive focus-within:border-destructive',
                    )}
                  >
                    <span className="flex w-32 shrink-0 items-center gap-2.5 border-r border-border px-3.5 py-3.5 text-foreground">
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="text-sm">{label}</span>
                    </span>
                    <span className="pl-3 text-sm text-muted-foreground" aria-hidden="true">@</span>
                    <input
                      type="text"
                      value={handles[key] ?? ''}
                      onChange={(e) => {
                        setHandles((prev) => ({ ...prev, [key]: e.target.value }));
                        setFieldErrors((p) => ({ ...p, social: undefined }));
                      }}
                      onFocus={showBack}
                      maxLength={40}
                      placeholder="yourbrand"
                      aria-label={`${label} handle`}
                      className="min-w-0 flex-1 bg-transparent py-3.5 pl-1 pr-3.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none"
                    />
                    {(handles[key] ?? '').trim() && (
                      <Check className="mx-3 h-4 w-4 shrink-0 text-formanova-success" aria-label="Filled" />
                    )}
                    {(key !== 'instagram' || (handles[key] ?? '').trim()) && (
                      <button
                        type="button"
                        onClick={() => {
                          if (key !== 'instagram') setRevealed((prev) => prev.filter((k) => k !== key));
                          setHandles((prev) => ({ ...prev, [key]: '' }));
                        }}
                        className="mr-2 shrink-0 p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                        aria-label={key === 'instagram' ? 'Clear Instagram' : `Remove ${label}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
                {fieldErrors.social && <p className="text-xs text-destructive">{fieldErrors.social}</p>}
                {revealed.includes('extra') && (
                  <div className="space-y-1.5">
                    <div className="flex items-center border border-border bg-background focus-within:border-foreground transition-colors">
                      <input
                        type="url"
                        value={extraLink}
                        onChange={(e) => { setExtraLink(e.target.value); setFieldErrors((p) => ({ ...p, extra: undefined })); }}
                        onFocus={showBack}
                        maxLength={200}
                        placeholder="Any other profile URL"
                        className="min-w-0 flex-1 bg-transparent px-3.5 py-3.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none"
                      />
                      {extraLink.trim() && (
                        <Check className="mx-3 h-4 w-4 shrink-0 text-formanova-success" aria-label="Filled" />
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setRevealed((prev) => prev.filter((k) => k !== 'extra'));
                          setExtraLink('');
                        }}
                        className="mr-2 shrink-0 p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                        aria-label="Remove link"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {fieldErrors.extra && <p className="text-xs text-destructive">{fieldErrors.extra}</p>}
                  </div>
                )}
                {nextReveal && (
                  <button
                    type="button"
                    onClick={() => setRevealed((prev) => [...prev, nextReveal])}
                    className="flex items-center gap-1 pt-0.5 text-sm font-medium text-foreground hover:opacity-70 transition-opacity"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add more
                  </button>
                )}
              </div>
            </div>

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
            <div className="order-1 lg:order-2 lg:border-l lg:border-border lg:pl-10">
              <div className="mx-auto max-w-md lg:sticky lg:top-0 lg:max-w-none">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <p className="font-card text-sm uppercase tracking-[0.22em] text-foreground">
                    Your Bespoke Card
                  </p>
                </div>
                <BrandCardFaceToggle
                  face={cardFace}
                  onFaceChange={setCardFace}
                  showBoth={allDone && !isMobile}
                  className="mb-5"
                />
                <BrandCard
                  brandName={brandName}
                  websiteUrl={salesChannelDetail}
                  storeUrl=""
                  basedIn={basedIn}
                  targetMarkets={parsedMarkets}
                  socialLinks={liveSocialLinks}
                  face={cardFace === 'both' && (isMobile || !allDone) ? 'front' : cardFace}
                />
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
