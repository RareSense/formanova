import { useState, useEffect, useRef } from 'react';
import { X, Plus, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={handleOverlayClick}
    >
      <div className="relative w-full max-w-md border border-border bg-background shadow-xl">

        {/* Header */}
        <div className="flex items-start justify-between border-b border-border px-6 pt-6 pb-5">
          <div>
            <h2 className="font-display text-2xl uppercase tracking-wide text-foreground leading-none">
              Tell us about your jewelry brand
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              This helps us personalize your AI photoshoots and product experience.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-4 mt-0.5 shrink-0 flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">

          {/* Brand name */}
          <div className="space-y-1.5">
            <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-foreground">
              Brand / Business name <span className="text-destructive">*</span>
            </label>
            <input
              ref={firstInputRef}
              type="text"
              value={brandName}
              onChange={(e) => { setBrandName(e.target.value); setBrandNameError(false); }}
              placeholder="Enter your brand or business name"
              className={cn(
                'w-full border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none transition-colors',
                brandNameError
                  ? 'border-destructive focus:border-destructive'
                  : 'border-border focus:border-foreground',
              )}
            />
            {brandNameError && (
              <p className="text-xs text-destructive">Brand name is required.</p>
            )}
          </div>

          {/* Website URL */}
          <div className="space-y-1.5">
            <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-foreground">
              Website URL <span className="font-normal text-muted-foreground">[optional]</span>
            </label>
            <input
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://yourbrand.com"
              className="w-full border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-foreground transition-colors"
            />
          </div>

          {/* Store URL */}
          <div className="space-y-1.5">
            <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-foreground">
              Online store URL <span className="font-normal text-muted-foreground">[optional]</span>
            </label>
            <input
              type="url"
              value={storeUrl}
              onChange={(e) => setStoreUrl(e.target.value)}
              placeholder="Shopify, Etsy, Amazon, or your own storefront"
              className="w-full border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-foreground transition-colors"
            />
          </div>

          {/* Social links */}
          <div className="space-y-2">
            <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-foreground">
              Social profile link <span className="font-normal text-muted-foreground">[optional]</span>
            </label>
            <div className="space-y-2">
              {socialLinks.map((link, i) => (
                <input
                  key={i}
                  type="url"
                  value={link}
                  onChange={(e) => updateSocialLink(i, e.target.value)}
                  placeholder="Instagram, TikTok, Etsy, Shopify, Pinterest, or any brand page"
                  className="w-full border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-foreground transition-colors"
                />
              ))}
            </div>
            <button
              type="button"
              onClick={addSocialLink}
              className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus className="h-3 w-3" />
              Add another link
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-5 space-y-4">
          <div className="flex items-start gap-3 border border-primary/40 bg-primary/5 px-4 py-3.5">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="space-y-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground">
                Confidential
              </p>
              <p className="text-sm leading-relaxed text-foreground text-justify">
                Your brand details remain strictly confidential. They are never sold and never
                used to train AI. They serve one purpose: crafting a bespoke FormaNova
                experience around your brand's signature aesthetic.
              </p>
            </div>
          </div>
          <Button
            onClick={handleContinue}
            className="h-11 w-full font-mono text-[10px] uppercase tracking-[0.2em]"
          >
            Continue
          </Button>
          <p className="text-center font-mono text-[9px] tracking-[0.1em] text-muted-foreground">
            You can edit these details anytime from Brand Details in your profile menu.
          </p>
        </div>

      </div>
    </div>
  );
}
