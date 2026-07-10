import { useState, useEffect, useRef } from 'react';
import { X, Plus, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BrandDetails {
  brand_name: string;
  website_url: string;
  store_url: string;
  social_links: string[];
}

/** Users often type "mybrand.com" — the backend rejects anything that isn't http(s). */
function normalizeUrl(value: string): string {
  const v = value.trim();
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

const MAX_SOCIAL_LINKS = 4;

const INPUT_CLASS =
  'w-full border border-border bg-background px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-foreground transition-colors';

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
  const [brandName, setBrandName] = useState(initial?.brand_name ?? '');
  const [websiteUrl, setWebsiteUrl] = useState(initial?.website_url ?? '');
  const [storeUrl, setStoreUrl] = useState(initial?.store_url ?? '');
  const [socialLinks, setSocialLinks] = useState<string[]>(
    initial?.social_links?.length ? initial.social_links : [''],
  );
  const [brandNameError, setBrandNameError] = useState(false);
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

  const updateSocialLink = (index: number, value: string) => {
    setSocialLinks((prev) => prev.map((v, i) => (i === index ? value : v)));
  };

  const removeSocialLink = (index: number) => {
    setSocialLinks((prev) => prev.filter((_, i) => i !== index));
  };

  const addSocialLink = () => setSocialLinks((prev) => [...prev, '']);

  const handleContinue = () => {
    if (!brandName.trim()) {
      setBrandNameError(true);
      firstInputRef.current?.focus();
      return;
    }
    onContinue({
      brand_name: brandName.trim(),
      website_url: normalizeUrl(websiteUrl),
      store_url: normalizeUrl(storeUrl),
      social_links: socialLinks.map((l) => normalizeUrl(l)).filter(Boolean),
    });
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6"
      onClick={handleOverlayClick}
    >
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col border border-border bg-background">

        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
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

          <div className="mt-8 space-y-6">

            {/* Brand name */}
            <div className="space-y-2">
              <FieldLabel label="Brand name" required />
              <input
                ref={firstInputRef}
                type="text"
                value={brandName}
                onChange={(e) => { setBrandName(e.target.value); setBrandNameError(false); }}
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

            {/* Website */}
            <div className="space-y-2">
              <FieldLabel label="Website" />
              <input
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://yourbrand.com"
                className={INPUT_CLASS}
              />
            </div>

            {/* Online store */}
            <div className="space-y-2">
              <FieldLabel label="Online store" />
              <input
                type="url"
                value={storeUrl}
                onChange={(e) => setStoreUrl(e.target.value)}
                placeholder="Shopify, Etsy, Amazon, or storefront URL"
                className={INPUT_CLASS}
              />
            </div>

            {/* Social profiles */}
            <div className="space-y-2">
              <FieldLabel label="Social profile" />
              <div className="space-y-2">
                {socialLinks.map((link, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="url"
                      value={link}
                      onChange={(e) => updateSocialLink(i, e.target.value)}
                      placeholder="Instagram, TikTok, or Pinterest URL"
                      className={cn(INPUT_CLASS, 'flex-1')}
                    />
                    {socialLinks.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeSocialLink(i)}
                        className="flex h-12 w-12 shrink-0 items-center justify-center border border-border text-muted-foreground hover:border-destructive hover:text-destructive transition-colors"
                        aria-label="Remove link"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {socialLinks.length < MAX_SOCIAL_LINKS && (
                <button
                  type="button"
                  onClick={addSocialLink}
                  className="flex items-center gap-1.5 pt-1 text-sm font-medium text-foreground hover:opacity-70 transition-opacity"
                >
                  <Plus className="h-4 w-4" />
                  Add another social profile
                </button>
              )}
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
        </div>

      </div>
    </div>
  );
}
