import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, X, Globe, ExternalLink, Loader2, Store, FileText, Upload, Trash2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { authenticatedFetch } from '@/lib/authenticated-fetch';

interface BrandProfile {
  brand_name: string;
  website_url: string;
  store_url: string;
  store_platform: string | null;
  social_links: string[];
  based_in: string;
  target_markets: string[];
  brand_book_asset_id: string | null;
}

/** Users often type "mybrand.com" — the backend rejects anything that isn't http(s). */
function normalizeUrl(value: string): string {
  const v = value.trim();
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

const PLATFORM_LABELS: Record<string, string> = {
  shopify: 'Shopify',
  etsy: 'Etsy',
  woocommerce: 'WooCommerce',
  bigcommerce: 'BigCommerce',
  wix: 'Wix',
  squarespace: 'Squarespace',
  magento: 'Magento',
  webflow: 'Webflow',
};

interface BrandBook {
  filename: string;
  url: string;
}

function detectPlatform(url: string): string {
  try {
    const host = new URL(url).hostname.replace('www.', '');
    if (host.includes('instagram.com')) return 'Instagram';
    if (host.includes('tiktok.com')) return 'TikTok';
    if (host.includes('etsy.com')) return 'Etsy';
    if (host.includes('pinterest.com')) return 'Pinterest';
    if (host.includes('shopify.com')) return 'Shopify';
    if (host.includes('facebook.com')) return 'Facebook';
    if (host.includes('twitter.com') || host.includes('x.com')) return 'X / Twitter';
    if (host.includes('youtube.com')) return 'YouTube';
    if (host.includes('linkedin.com')) return 'LinkedIn';
    return host;
  } catch {
    return url;
  }
}

const EMPTY: BrandProfile = {
  brand_name: '',
  website_url: '',
  store_url: '',
  store_platform: null,
  social_links: [],
  based_in: '',
  target_markets: [],
  brand_book_asset_id: null,
};

const BRAND_BOOK_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp';
const BRAND_BOOK_MAX_BYTES = 20 * 1024 * 1024;

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-foreground">
      {children}
    </label>
  );
}

function Optional() {
  return <span className="font-normal text-muted-foreground">[optional]</span>;
}

const INPUT_CLASS =
  'w-full border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-foreground transition-colors';

export default function BrandDetails() {
  const [profile, setProfile] = useState<BrandProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Edit state
  const [editName, setEditName] = useState('');
  const [editWebsite, setEditWebsite] = useState('');
  const [editStore, setEditStore] = useState('');
  const [editLinks, setEditLinks] = useState<string[]>(['']);
  const [editBasedIn, setEditBasedIn] = useState('');
  const [editMarkets, setEditMarkets] = useState('');
  const [nameError, setNameError] = useState(false);

  // Brand book state (managed outside the edit form; uploads apply immediately)
  const [brandBook, setBrandBook] = useState<BrandBook | null>(null);
  const [bookUploading, setBookUploading] = useState(false);
  const [bookRemoving, setBookRemoving] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    authenticatedFetch('/api/user/profile')
      .then((r) => r.json())
      .then((data) => {
        setProfile({
          brand_name: data.brand_name ?? '',
          website_url: data.website_url ?? '',
          store_url: data.store_url ?? '',
          store_platform: data.store_platform ?? null,
          social_links: data.social_links ?? [],
          based_in: data.based_in ?? '',
          target_markets: data.target_markets ?? [],
          brand_book_asset_id: data.brand_book_asset_id ?? null,
        });
        if (data.brand_book_asset_id) {
          authenticatedFetch('/api/user/brand-book')
            .then((r) => (r.ok ? r.json() : null))
            .then((book) => {
              if (book?.url) setBrandBook({ filename: book.filename ?? 'Brand book', url: book.url });
            })
            .catch(() => {});
        }
      })
      .catch(() => setProfile(EMPTY))
      .finally(() => setIsLoading(false));
  }, []);

  const startEditing = () => {
    if (!profile) return;
    setEditName(profile.brand_name);
    setEditWebsite(profile.website_url);
    setEditStore(profile.store_url);
    setEditLinks(profile.social_links.length ? [...profile.social_links, ''] : ['']);
    setEditBasedIn(profile.based_in);
    setEditMarkets(profile.target_markets.join(', '));
    setNameError(false);
    setSaveError(null);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setSaveError(null);
  };

  const updateLink = (i: number, value: string) =>
    setEditLinks((prev) => prev.map((v, j) => (j === i ? value : v)));

  const removeLink = (i: number) =>
    setEditLinks((prev) => prev.filter((_, j) => j !== i));

  const addLink = () => setEditLinks((prev) => [...prev, '']);

  const handleSave = async () => {
    if (!editName.trim()) { setNameError(true); return; }
    setIsSaving(true);
    setSaveError(null);
    const website = normalizeUrl(editWebsite);
    const store = normalizeUrl(editStore);
    const links = editLinks.map((l) => normalizeUrl(l)).filter(Boolean);
    const markets = editMarkets.split(',').map((m) => m.trim()).filter(Boolean);
    try {
      // Cleared optional fields are sent as explicit null / empty array per the API spec.
      const body = {
        brand_name: editName.trim(),
        website_url: website || null,
        store_url: store || null,
        social_links: links,
        based_in: editBasedIn.trim() || null,
        target_markets: markets,
      };
      const res = await authenticatedFetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        if (res.status === 422) {
          const data = await res.json().catch(() => null);
          const detail = data?.detail;
          if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
            setSaveError(
              Object.entries(detail)
                .map(([field, msg]) => `${field.replace(/_/g, ' ')}: ${msg}`)
                .join('. '),
            );
            return;
          }
        }
        throw new Error('Failed to save');
      }
      setProfile((prev) => ({
        brand_name: editName.trim(),
        website_url: website,
        store_url: store,
        // Platform re-detects asynchronously on URL change; don't show a stale one.
        store_platform: store === prev?.store_url ? prev?.store_platform ?? null : null,
        social_links: links,
        based_in: editBasedIn.trim(),
        target_markets: markets,
        brand_book_asset_id: prev?.brand_book_asset_id ?? null,
      }));
      setIsEditing(false);
    } catch {
      setSaveError('Something went wrong. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBookUpload = async (file: File) => {
    if (file.size > BRAND_BOOK_MAX_BYTES) {
      setBookError('File is too large. Maximum size is 20 MB.');
      return;
    }
    setBookUploading(true);
    setBookError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await authenticatedFetch('/api/user/brand-book', { method: 'POST', body: form });
      if (res.status === 413) {
        setBookError('File is too large. Maximum size is 20 MB.');
        return;
      }
      if (res.status === 400) {
        setBookError('Unsupported file type. Use a PDF, PNG, JPG, or WEBP.');
        return;
      }
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      setBrandBook({ filename: data.filename ?? file.name, url: data.url ?? '' });
      setProfile((prev) => (prev ? { ...prev, brand_book_asset_id: data.asset_id ?? 'uploaded' } : prev));
    } catch {
      setBookError('Upload failed. Please try again.');
    } finally {
      setBookUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleBookRemove = async () => {
    setBookRemoving(true);
    setBookError(null);
    try {
      const res = await authenticatedFetch('/api/user/brand-book', { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setBrandBook(null);
      setProfile((prev) => (prev ? { ...prev, brand_book_asset_id: null } : prev));
    } catch {
      setBookError('Could not remove the file. Please try again.');
    } finally {
      setBookRemoving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-14">

      {/* Back link */}
      <Link
        to="/dashboard"
        className="mb-8 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3 w-3" />
        Dashboard
      </Link>

      {/* Page header */}
      <div className="mb-8">
        <h1 className="font-display text-4xl uppercase tracking-wide text-foreground leading-none sm:text-5xl">
          Brand Details
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base text-justify">
          Manage your jewelry brand information. This helps us personalize your AI photoshoots and product experience.
        </p>
        <div className="mt-4 flex items-start gap-3 border border-primary/40 bg-primary/5 px-4 py-3.5">
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
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isEditing ? (
        /* ── Edit mode ── */
        <div className="border border-border">
          <div className="border-b border-border px-6 py-5">
            <h2 className="font-display text-xl uppercase tracking-wide text-foreground leading-none">
              Brand Information
            </h2>
          </div>

          <div className="px-6 py-6 space-y-5">

            {/* Brand name */}
            <div className="space-y-1.5">
              <FieldLabel>
                Brand / Business name <span className="text-destructive">*</span>
              </FieldLabel>
              <input
                type="text"
                value={editName}
                onChange={(e) => { setEditName(e.target.value); setNameError(false); }}
                placeholder="Enter your brand or business name"
                className={cn(
                  'w-full border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none transition-colors',
                  nameError ? 'border-destructive' : 'border-border focus:border-foreground',
                )}
              />
              {nameError && <p className="text-xs text-destructive">Brand name is required.</p>}
            </div>

            {/* Website URL */}
            <div className="space-y-1.5">
              <FieldLabel>Website URL <Optional /></FieldLabel>
              <input
                type="url"
                value={editWebsite}
                onChange={(e) => setEditWebsite(e.target.value)}
                placeholder="https://yourbrand.com"
                className={INPUT_CLASS}
              />
            </div>

            {/* Store URL */}
            <div className="space-y-1.5">
              <FieldLabel>Online store URL <Optional /></FieldLabel>
              <input
                type="url"
                value={editStore}
                onChange={(e) => setEditStore(e.target.value)}
                placeholder="Shopify, Etsy, Amazon, or your own storefront"
                className={INPUT_CLASS}
              />
            </div>

            {/* Social links */}
            <div className="space-y-2">
              <FieldLabel>Social profile links <Optional /></FieldLabel>
              <div className="space-y-2">
                {editLinks.map((link, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="url"
                      value={link}
                      onChange={(e) => updateLink(i, e.target.value)}
                      placeholder="Instagram, TikTok, Pinterest, or any brand page"
                      className={cn(INPUT_CLASS, 'flex-1')}
                    />
                    {editLinks.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLink(i)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center border border-border text-muted-foreground hover:border-destructive hover:text-destructive transition-colors"
                        aria-label="Remove link"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addLink}
                className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="h-3 w-3" />
                Add another link
              </button>
            </div>

            {/* Based in */}
            <div className="space-y-1.5">
              <FieldLabel>Based in <Optional /></FieldLabel>
              <input
                type="text"
                value={editBasedIn}
                onChange={(e) => setEditBasedIn(e.target.value)}
                placeholder="City, country — e.g. New York, US"
                className={INPUT_CLASS}
              />
            </div>

            {/* Target markets */}
            <div className="space-y-1.5">
              <FieldLabel>Target markets <Optional /></FieldLabel>
              <input
                type="text"
                value={editMarkets}
                onChange={(e) => setEditMarkets(e.target.value)}
                placeholder="Comma-separated — e.g. US, UAE, Global"
                className={INPUT_CLASS}
              />
              <p className="text-xs text-muted-foreground">Separate multiple markets with commas.</p>
            </div>

            {saveError && <p className="text-sm text-destructive">{saveError}</p>}
          </div>

          <div className="flex items-center gap-3 border-t border-border px-6 py-5">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="h-11 gap-2 font-mono text-[10px] uppercase tracking-[0.2em]"
            >
              {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save changes
            </Button>
            <Button
              variant="outline"
              onClick={cancelEditing}
              disabled={isSaving}
              className="h-11 font-mono text-[10px] uppercase tracking-[0.2em]"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        /* ── View mode ── */
        <div className="border border-border">
          <div className="flex items-center justify-between border-b border-border px-6 py-5">
            <h2 className="font-display text-xl uppercase tracking-wide text-foreground leading-none">
              Brand Information
            </h2>
            <Button
              variant="outline"
              onClick={startEditing}
              className="h-9 px-4 font-mono text-[10px] uppercase tracking-[0.2em]"
            >
              Edit
            </Button>
          </div>

          <div className="divide-y divide-border">

            {/* Brand name */}
            <div className="px-6 py-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                Brand / Business name
              </p>
              <p className="mt-2 text-base text-foreground">
                {profile?.brand_name || <span className="text-muted-foreground italic">Not set</span>}
              </p>
            </div>

            {/* Website URL */}
            <div className="px-6 py-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                Website URL
              </p>
              {profile?.website_url ? (
                <a
                  href={profile.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:opacity-80 transition-opacity"
                >
                  <Globe className="h-3.5 w-3.5 shrink-0" />
                  {profile.website_url}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground italic">Not set</p>
              )}
            </div>

            {/* Store URL */}
            <div className="px-6 py-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                Online store
              </p>
              {profile?.store_url ? (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <a
                    href={profile.store_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:opacity-80 transition-opacity"
                  >
                    <Store className="h-3.5 w-3.5 shrink-0" />
                    {profile.store_url}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                  {profile.store_platform && PLATFORM_LABELS[profile.store_platform] && (
                    <span className="border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                      {PLATFORM_LABELS[profile.store_platform]}
                    </span>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground italic">Not set</p>
              )}
            </div>

            {/* Social links */}
            <div className="px-6 py-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                Social profile links
              </p>
              {profile?.social_links?.length ? (
                <ul className="mt-2 space-y-2">
                  {profile.social_links.map((link, i) => (
                    <li key={i}>
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-primary hover:opacity-80 transition-opacity"
                      >
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        <span>{detectPlatform(link)}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground italic">Not set</p>
              )}
            </div>

            {/* Based in */}
            <div className="px-6 py-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                Based in
              </p>
              <p className="mt-2 text-base text-foreground">
                {profile?.based_in || <span className="text-muted-foreground italic">Not set</span>}
              </p>
            </div>

            {/* Target markets */}
            <div className="px-6 py-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                Target markets
              </p>
              {profile?.target_markets?.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {profile.target_markets.map((m, i) => (
                    <span
                      key={i}
                      className="border border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-foreground"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground italic">Not set</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Brand book ── */}
      {!isLoading && (
        <div className="mt-8 border border-border">
          <div className="border-b border-border px-6 py-5">
            <h2 className="font-display text-xl uppercase tracking-wide text-foreground leading-none">
              Brand Book
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Upload your brand guidelines (PDF or image, max 20 MB) so generated photos can match your brand identity.
            </p>
          </div>

          <div className="px-6 py-6">
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

            {brandBook ? (
              <div className="flex items-center justify-between gap-3 border border-border px-4 py-3.5">
                <a
                  href={brandBook.url || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'flex min-w-0 items-center gap-2.5 text-sm text-primary transition-opacity',
                    brandBook.url ? 'hover:opacity-80' : 'pointer-events-none text-foreground',
                  )}
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  <span className="truncate">{brandBook.filename}</span>
                  {brandBook.url && <ExternalLink className="h-3 w-3 shrink-0" />}
                </a>
                <Button
                  variant="outline"
                  onClick={handleBookRemove}
                  disabled={bookRemoving}
                  className="h-9 shrink-0 gap-2 px-4 font-mono text-[10px] uppercase tracking-[0.2em] hover:border-destructive hover:text-destructive"
                >
                  {bookRemoving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  Remove
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={bookUploading}
                className="h-11 gap-2 px-6 font-mono text-[10px] uppercase tracking-[0.2em]"
              >
                {bookUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {bookUploading ? 'Uploading' : 'Upload brand book'}
              </Button>
            )}

            {bookError && <p className="mt-3 text-sm text-destructive">{bookError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
