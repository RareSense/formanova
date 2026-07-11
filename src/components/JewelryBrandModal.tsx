import { useState, useEffect, useRef } from 'react';
import { X, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BrandCard } from '@/components/brand/BrandCard';
import { PRESET_SOCIAL_PLATFORMS, extractHandle, handleToUrl, urlMatchesHost } from '@/components/brand/social-icons';
import { isValidHttpUrl, isValidHandle, INVALID_URL_MESSAGE } from '@/lib/brand-profile-api';

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

const INSTAGRAM = PRESET_SOCIAL_PLATFORMS.find((p) => p.key === 'instagram')!;

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium text-foreground">
        {label}{required && <span className="ml-1 text-destructive">*</span>}
      </label>
      {!required && (
        <span className="border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground">
          Optional
        </span>
      )}
    </div>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  onContinue: (details: BrandDetails) => void;
  initial?: BrandDetails;
}

export function JewelryBrandModal({ open, onClose, onContinue, initial }: Props) {
  const initialInstagram = (initial?.social_links ?? []).find((l) => urlMatchesHost(l, INSTAGRAM.match));
  // Non-Instagram links from a previous session are preserved untouched on continue.
  const otherLinks = (initial?.social_links ?? []).filter((l) => !urlMatchesHost(l, INSTAGRAM.match));

  const [brandName, setBrandName] = useState(initial?.brand_name ?? '');
  const [basedIn, setBasedIn] = useState(initial?.based_in ?? '');
  const [websiteUrl, setWebsiteUrl] = useState(initial?.website_url ?? '');
  const [storeUrl, setStoreUrl] = useState(initial?.store_url ?? '');
  const [instagramHandle, setInstagramHandle] = useState(
    initialInstagram ? extractHandle(initialInstagram, INSTAGRAM.match) : '',
  );
  const [brandNameError, setBrandNameError] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<'website' | 'store' | 'social', string>>>({});

  const overlayRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) setTimeout(() => firstInputRef.current?.focus(), 50);
  }, [open]);

  if (!open) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  const instagramUrl = handleToUrl(instagramHandle, INSTAGRAM.urlPrefix);

  const handleContinue = () => {
    if (!brandName.trim()) {
      setBrandNameError(true);
      firstInputRef.current?.focus();
      return;
    }
    const errors: typeof fieldErrors = {};
    const site = normalizeUrl(websiteUrl);
    if (site && !isValidHttpUrl(site)) errors.website = INVALID_URL_MESSAGE;
    const store = normalizeUrl(storeUrl);
    if (store && !isValidHttpUrl(store)) errors.store = INVALID_URL_MESSAGE;
    const rawHandle = instagramHandle.trim();
    if (rawHandle && !isValidHandle(extractHandle(rawHandle, INSTAGRAM.match))) {
      errors.social = 'Handles can only contain letters, numbers, dots, dashes and underscores.';
    }
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }
    const socialLinks = [...(instagramUrl ? [instagramUrl] : []), ...otherLinks];
    onContinue({
      brand_name: brandName.trim(),
      website_url: site,
      store_url: store,
      social_links: socialLinks,
      based_in: basedIn.trim(),
      target_markets: initial?.target_markets ?? [],
    });
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6"
      onClick={handleOverlayClick}
    >
      <div className="relative flex max-h-[90vh] w-full max-w-5xl flex-col border border-border bg-background">

        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Body — scrolls when content outgrows the viewport */}
        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-10 sm:px-12">

          {/* Header */}
          <h2 className="font-display text-3xl text-foreground sm:text-4xl">
            Tell us about your jewelry brand
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
            The more we know about your brand, the more bespoke your photoshoots become.
          </p>

          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:gap-10">

            {/* Form */}
            <div className="order-2 space-y-6 lg:order-1">

            {/* Brand name */}
            <div className="space-y-2">
              <FieldLabel label="Brand name" required />
              <input
                ref={firstInputRef}
                type="text"
                value={brandName}
                onChange={(e) => { setBrandName(e.target.value); setBrandNameError(false); }}
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

            {/* Based in */}
            <div className="space-y-2">
              <FieldLabel label="Based in" />
              <input
                type="text"
                value={basedIn}
                onChange={(e) => setBasedIn(e.target.value)}
                maxLength={80}
                placeholder="City, country"
                className={INPUT_CLASS}
              />
            </div>

            {/* Website */}
            <div className="space-y-2">
              <FieldLabel label="Website" />
              <input
                type="url"
                value={websiteUrl}
                onChange={(e) => { setWebsiteUrl(e.target.value); setFieldErrors((p) => ({ ...p, website: undefined })); }}
                maxLength={200}
                placeholder="yourbrand.com"
                className={cn(INPUT_CLASS, fieldErrors.website && 'border-destructive focus:border-destructive')}
              />
              {fieldErrors.website
                ? <p className="text-xs text-destructive">{fieldErrors.website}</p>
                : <p className="text-xs text-muted-foreground">No need for https:// or www — yourbrand.com works.</p>}
            </div>

            {/* Online store */}
            <div className="space-y-2">
              <FieldLabel label="Online store" />
              <input
                type="url"
                value={storeUrl}
                onChange={(e) => { setStoreUrl(e.target.value); setFieldErrors((p) => ({ ...p, store: undefined })); }}
                maxLength={200}
                placeholder="Shopify, Etsy, WooCommerce, Magento, or storefront URL"
                className={cn(INPUT_CLASS, fieldErrors.store && 'border-destructive focus:border-destructive')}
              />
              {fieldErrors.store && <p className="text-xs text-destructive">{fieldErrors.store}</p>}
              <p className="text-xs text-muted-foreground">
                Only if you sell somewhere other than your website.
              </p>
            </div>

            {/* Instagram */}
            <div className="space-y-2">
              <FieldLabel label="Instagram" />
              <div className={cn(
                'flex items-center border border-border bg-background focus-within:border-foreground transition-colors',
                fieldErrors.social && 'border-destructive focus-within:border-destructive',
              )}>
                <span className="flex items-center gap-2 border-r border-border px-3 py-3.5 text-muted-foreground">
                  <INSTAGRAM.Icon className="h-4 w-4 shrink-0" />
                  <span className="hidden font-mono text-xs sm:inline">{INSTAGRAM.urlPrefix}</span>
                </span>
                <input
                  type="text"
                  value={instagramHandle}
                  onChange={(e) => {
                    setInstagramHandle(e.target.value);
                    setFieldErrors((p) => ({ ...p, social: undefined }));
                  }}
                  maxLength={40}
                  placeholder="yourbrand"
                  aria-label="Instagram handle"
                  className="min-w-0 flex-1 bg-transparent px-3 py-3.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none"
                />
              </div>
              {fieldErrors.social && <p className="text-xs text-destructive">{fieldErrors.social}</p>}
            </div>

            {/* Privacy */}
            <div className="flex items-center justify-center gap-2 pt-1">
              <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <p className="text-center text-xs leading-relaxed text-muted-foreground sm:text-sm">
                <span className="font-semibold text-foreground">Strictly confidential.</span>{' '}
                Never sold, never used to train AI. Used solely to shape FormaNova around your brand.
              </p>
            </div>

            {/* CTA */}
            <button
              type="button"
              onClick={handleContinue}
              className="w-full bg-foreground py-4 text-sm font-medium text-background hover:opacity-90 transition-opacity"
            >
              Continue to Studio
            </button>
            </div>

            {/* Live brand card */}
            <div className="order-1 lg:order-2">
              <div className="mx-auto max-w-md lg:sticky lg:top-0 lg:max-w-none">
                <BrandCard
                  brandName={brandName}
                  websiteUrl={websiteUrl}
                  basedIn={basedIn}
                  targetMarkets={[]}
                  socialLinks={instagramUrl ? [instagramUrl] : []}
                />
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
