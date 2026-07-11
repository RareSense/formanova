import { useState, useEffect, useRef } from 'react';
import { X, Plus, Lock, Loader2, Upload, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BrandCard } from '@/components/brand/BrandCard';
import { PRESET_SOCIAL_PLATFORMS, extractHandle, handleToUrl, urlMatchesHost } from '@/components/brand/social-icons';
import { uploadBrandBook, deleteBrandBook, isValidHttpUrl, isValidHandle, INVALID_URL_MESSAGE } from '@/lib/brand-profile-api';

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

const BRAND_BOOK_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp';

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

/** Split saved links into per-platform handles plus one free-form leftover URL. */
function splitInitialSocials(links: string[] | undefined): { handles: Record<string, string>; extra: string } {
  const handles: Record<string, string> = {};
  let extra = '';
  for (const link of links ?? []) {
    const platform = PRESET_SOCIAL_PLATFORMS.find((p) => urlMatchesHost(link, p.match));
    if (platform && !handles[platform.key]) {
      handles[platform.key] = extractHandle(link, platform.match);
    } else if (!extra) {
      extra = link;
    }
  }
  return { handles, extra };
}

export function JewelryBrandModal({ open, onClose, onContinue, initial }: Props) {
  const initialSocials = splitInitialSocials(initial?.social_links);
  const [brandName, setBrandName] = useState(initial?.brand_name ?? '');
  const [basedIn, setBasedIn] = useState(initial?.based_in ?? '');
  const [targetMarkets, setTargetMarkets] = useState((initial?.target_markets ?? []).join(', '));
  const [websiteUrl, setWebsiteUrl] = useState(initial?.website_url ?? '');
  const [storeUrl, setStoreUrl] = useState(initial?.store_url ?? '');
  const [handles, setHandles] = useState<Record<string, string>>(initialSocials.handles);
  const [extraLink, setExtraLink] = useState(initialSocials.extra);
  const [showExtraLink, setShowExtraLink] = useState(Boolean(initialSocials.extra));
  const [brandNameError, setBrandNameError] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<'website' | 'store' | 'social' | 'extra', string>>>({});

  // Brand book uploads immediately (the endpoint sets the profile field server-side).
  const [bookFilename, setBookFilename] = useState<string | null>(null);
  const [bookUploading, setBookUploading] = useState(false);
  const [bookRemoving, setBookRemoving] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const parsedMarkets = targetMarkets.split(',').map((m) => m.trim()).filter(Boolean);

  const handleBookUpload = async (file: File) => {
    setBookUploading(true);
    setBookError(null);
    const result = await uploadBrandBook(file);
    setBookUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!result.ok) {
      setBookError(result.error ?? 'Upload failed. Please try again.');
      return;
    }
    setBookFilename(result.filename ?? file.name);
  };

  const handleBookRemove = async () => {
    setBookRemoving(true);
    setBookError(null);
    const message = await deleteBrandBook();
    setBookRemoving(false);
    if (message) { setBookError(message); return; }
    setBookFilename(null);
  };

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
    const socialLinks = PRESET_SOCIAL_PLATFORMS
      .map((p) => handleToUrl(handles[p.key] ?? '', p.urlPrefix))
      .filter(Boolean);
    if (extra) socialLinks.push(extra);
    onContinue({
      brand_name: brandName.trim(),
      website_url: normalizeUrl(websiteUrl),
      store_url: normalizeUrl(storeUrl),
      social_links: socialLinks,
      based_in: basedIn.trim(),
      target_markets: parsedMarkets,
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

            {/* Target markets */}
            <div className="space-y-2">
              <FieldLabel label="Target markets" />
              <input
                type="text"
                value={targetMarkets}
                onChange={(e) => setTargetMarkets(e.target.value)}
                maxLength={120}
                placeholder="US, UAE, Global"
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

            {/* Social profiles — handle per platform, same order as Brand Settings */}
            <div className="space-y-2">
              <FieldLabel label="Social profiles" />
              <div className="space-y-2">
                {PRESET_SOCIAL_PLATFORMS.map(({ key, label, urlPrefix, Icon }) => (
                  <div key={key} className="flex items-center border border-border bg-background focus-within:border-foreground transition-colors">
                    <span className="flex items-center gap-2 border-r border-border px-3 py-3.5 text-muted-foreground">
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="hidden font-mono text-xs sm:inline">{urlPrefix}</span>
                    </span>
                    <input
                      type="text"
                      value={handles[key] ?? ''}
                      onChange={(e) => {
                        setHandles((prev) => ({ ...prev, [key]: e.target.value }));
                        setFieldErrors((p) => ({ ...p, social: undefined }));
                      }}
                      maxLength={40}
                      placeholder="yourbrand"
                      aria-label={`${label} handle`}
                      className="min-w-0 flex-1 bg-transparent px-3 py-3.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none"
                    />
                  </div>
                ))}
                {showExtraLink && (
                  <div className="flex items-center gap-2">
                    <input
                      type="url"
                      value={extraLink}
                      onChange={(e) => { setExtraLink(e.target.value); setFieldErrors((p) => ({ ...p, extra: undefined })); }}
                      maxLength={200}
                      placeholder="Any other profile URL"
                      className={cn(INPUT_CLASS, 'flex-1', fieldErrors.extra && 'border-destructive focus:border-destructive')}
                    />
                    <button
                      type="button"
                      onClick={() => { setShowExtraLink(false); setExtraLink(''); }}
                      className="flex h-12 w-12 shrink-0 items-center justify-center border border-border text-muted-foreground hover:border-destructive hover:text-destructive transition-colors"
                      aria-label="Remove link"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              {!showExtraLink && (
                <button
                  type="button"
                  onClick={() => setShowExtraLink(true)}
                  className="flex items-center gap-1.5 pt-1 text-sm font-medium text-foreground hover:opacity-70 transition-opacity"
                >
                  <Plus className="h-4 w-4" />
                  Add another social profile
                </button>
              )}
            </div>

            {/* Brand book */}
            <div className="space-y-2">
              <FieldLabel label="Brand book" />
              <input
                ref={fileInputRef}
                type="file"
                accept={BRAND_BOOK_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleBookUpload(file);
                }}
              />
              {bookFilename ? (
                <div className="flex items-center gap-3 border border-border px-4 py-3">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{bookFilename}</span>
                  <button
                    type="button"
                    onClick={() => void handleBookRemove()}
                    disabled={bookRemoving}
                    className="shrink-0 p-1 text-muted-foreground hover:text-destructive transition-colors"
                    aria-label="Remove brand book"
                  >
                    {bookRemoving ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                  </button>
                </div>
              ) : (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
                  className="flex cursor-pointer items-center justify-center gap-2.5 border border-dashed border-border px-4 py-4 hover:border-foreground transition-colors"
                >
                  {bookUploading
                    ? <Loader2 className="h-4 w-4 animate-spin text-foreground" />
                    : <Upload className="h-4 w-4 text-foreground" />}
                  <span className="text-sm text-foreground">
                    {bookUploading ? 'Uploading…' : 'Upload brand guidelines'}
                  </span>
                  <span className="text-xs text-muted-foreground">PDF, PNG or JPG · Max 20 MB</span>
                </div>
              )}
              {bookError && <p className="text-xs text-destructive">{bookError}</p>}
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
                  targetMarkets={parsedMarkets}
                />
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
