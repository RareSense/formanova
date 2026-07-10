import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, X, Check, Loader2, Lock, FileText, Upload, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InlineField, FIELD_INPUT_CLASS, FIELD_ICON_BUTTON_CLASS } from '@/components/brand/InlineField';
import { SocialRow, EmptySocialSlot } from '@/components/brand/SocialRow';
import { PRESET_SOCIAL_PLATFORMS, urlMatchesHost } from '@/components/brand/social-icons';
import {
  type BrandProfile,
  EMPTY_BRAND_PROFILE,
  normalizeUrl,
  fetchBrandProfile,
  patchBrandProfile,
  fetchBrandBook,
  uploadBrandBook,
  deleteBrandBook,
} from '@/lib/brand-profile-api';

interface BrandBookState {
  filename: string;
  url: string;
  sizeLabel?: string;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const BRAND_BOOK_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp';
const MAX_SOCIAL_LINKS = 4;

export default function BrandDetails() {
  const [profile, setProfile] = useState<BrandProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Social add-row state
  const [addingSocial, setAddingSocial] = useState(false);
  const [addDraft, setAddDraft] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  // Brand book state
  const [brandBook, setBrandBook] = useState<BrandBookState | null>(null);
  const [bookUploading, setBookUploading] = useState(false);
  const [bookRemoving, setBookRemoving] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchBrandProfile()
      .then((data) => {
        setProfile(data);
        if (data.brand_book_asset_id) {
          fetchBrandBook()
            .then((book) => { if (book) setBrandBook(book); })
            .catch(() => {});
        }
      })
      .catch(() => setProfile(EMPTY_BRAND_PROFILE))
      .finally(() => setIsLoading(false));
  }, []);

  const saveField = useCallback(
    (key: keyof BrandProfile, transform?: (v: string) => unknown) =>
      async (raw: string): Promise<string | null> => {
        const value = transform ? transform(raw) : (raw.trim() || null);
        const message = await patchBrandProfile({ [key]: value });
        if (!message) {
          setProfile((prev) => (prev ? { ...prev, [key]: value ?? (Array.isArray(prev[key]) ? [] : '') } : prev));
        }
        return message;
      },
    [],
  );

  const saveSocialAt = useCallback(
    (index: number) =>
      async (value: string | null): Promise<string | null> => {
        const current = profile?.social_links ?? [];
        const normalized = value === null ? null : normalizeUrl(value);
        const next = normalized
          ? current.map((v, i) => (i === index ? normalized : v))
          : current.filter((_, i) => i !== index);
        const message = await patchBrandProfile({ social_links: next });
        if (!message) setProfile((prev) => (prev ? { ...prev, social_links: next } : prev));
        return message;
      },
    [profile?.social_links],
  );

  const addSocial = async () => {
    const normalized = normalizeUrl(addDraft);
    if (!normalized) { setAddError('Enter a profile URL.'); return; }
    const next = [...(profile?.social_links ?? []), normalized];
    setAddSaving(true);
    setAddError(null);
    const message = await patchBrandProfile({ social_links: next });
    setAddSaving(false);
    if (message) { setAddError(message); return; }
    setProfile((prev) => (prev ? { ...prev, social_links: next } : prev));
    setAddDraft('');
    setAddingSocial(false);
  };

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
    setBrandBook({
      filename: result.filename ?? file.name,
      url: result.url ?? '',
      sizeLabel: formatBytes(file.size),
    });
    setProfile((prev) => (prev ? { ...prev, brand_book_asset_id: result.assetId ?? 'uploaded' } : prev));
  };

  const handleBookRemove = async () => {
    setBookRemoving(true);
    setBookError(null);
    const message = await deleteBrandBook();
    setBookRemoving(false);
    if (message) { setBookError(message); return; }
    setBrandBook(null);
    setProfile((prev) => (prev ? { ...prev, brand_book_asset_id: null } : prev));
  };

  const fileExt = brandBook?.filename.split('.').pop()?.toUpperCase() ?? '';

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-12">

      {/* Back link */}
      <Link
        to="/dashboard"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Dashboard
      </Link>

      {/* Page header */}
      <div className="mb-8">
        <h1 className="font-display text-4xl text-foreground sm:text-5xl">
          Brand details
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
          The more we know about your brand, the more bespoke your photoshoots become.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-6">

          {/* Brand information */}
          <div className="border border-border bg-background px-6 py-6 sm:px-8 sm:py-7">
            <h2 className="font-display text-2xl text-foreground">Brand information</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The more complete your profile, the more bespoke your results.
            </p>

            {/* Brand basics */}
            <p className="mt-6 text-sm font-medium text-foreground">Brand basics</p>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InlineField
                label="Brand name"
                value={profile?.brand_name ?? ''}
                placeholder="Your brand name"
                required
                onSave={saveField('brand_name', (v) => v.trim())}
              />
              <InlineField
                label="Based in"
                value={profile?.based_in ?? ''}
                placeholder="City, country"
                icon={MapPin}
                onSave={saveField('based_in')}
              />
              <div className="sm:col-span-2">
                <InlineField
                  label="Target markets"
                  value={(profile?.target_markets ?? []).join(', ')}
                  displayValue={(profile?.target_markets ?? []).join(' · ')}
                  placeholder="US, UAE, Global"
                  onSave={saveField('target_markets', (v) =>
                    v.split(',').map((m) => m.trim()).filter(Boolean),
                  )}
                />
              </div>
            </div>

            <div className="my-6 border-t border-border" />

            {/* Online presence */}
            <p className="text-sm font-medium text-foreground">Online presence</p>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InlineField
                label="Website"
                value={profile?.website_url ?? ''}
                placeholder="https://yourbrand.com"
                onSave={saveField('website_url', (v) => normalizeUrl(v) || null)}
              />
              <InlineField
                label="Online store"
                value={profile?.store_url ?? ''}
                placeholder="https://shop.yourbrand.com"
                onSave={saveField('store_url', (v) => normalizeUrl(v) || null)}
              />
            </div>

            {/* Social profiles */}
            <p className="mt-5 text-sm font-medium text-foreground">Social profiles</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(profile?.social_links ?? []).map((link, i) => (
                <SocialRow key={`${link}-${i}`} url={link} onSave={saveSocialAt(i)} />
              ))}
              {/* Pre-made platform slots with example URLs, until that platform is linked */}
              {(profile?.social_links ?? []).length < MAX_SOCIAL_LINKS &&
                PRESET_SOCIAL_PLATFORMS
                  .filter((p) => !(profile?.social_links ?? []).some((l) => urlMatchesHost(l, p.match)))
                  .slice(0, MAX_SOCIAL_LINKS - (profile?.social_links ?? []).length)
                  .map((p) => (
                    <EmptySocialSlot
                      key={p.key}
                      example={p.example}
                      Icon={p.Icon}
                      onAdd={async (value) => {
                        const normalized = normalizeUrl(value);
                        if (!normalized) return 'Enter a profile URL.';
                        const next = [...(profile?.social_links ?? []), normalized];
                        const message = await patchBrandProfile({ social_links: next });
                        if (!message) setProfile((prev) => (prev ? { ...prev, social_links: next } : prev));
                        return message;
                      }}
                    />
                  ))}
            </div>

            {(profile?.social_links ?? []).length < MAX_SOCIAL_LINKS && (
              addingSocial ? (
                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      ref={addInputRef}
                      type="url"
                      value={addDraft}
                      onChange={(e) => { setAddDraft(e.target.value); setAddError(null); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void addSocial();
                        if (e.key === 'Escape') { setAddingSocial(false); setAddDraft(''); }
                      }}
                      placeholder="Instagram, TikTok, or Pinterest URL"
                      className={FIELD_INPUT_CLASS}
                    />
                    <button
                      type="button"
                      onClick={() => void addSocial()}
                      disabled={addSaving}
                      className={cn(FIELD_ICON_BUTTON_CLASS, 'text-foreground hover:border-foreground')}
                      aria-label="Save profile"
                    >
                      {addSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAddingSocial(false); setAddDraft(''); }}
                      disabled={addSaving}
                      className={cn(FIELD_ICON_BUTTON_CLASS, 'text-muted-foreground hover:text-foreground')}
                      aria-label="Cancel"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {addError && <p className="text-xs text-destructive">{addError}</p>}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setAddingSocial(true);
                    setTimeout(() => addInputRef.current?.focus(), 30);
                  }}
                  className="mt-3 flex w-full items-center gap-2 border border-border px-4 py-3 text-sm text-foreground hover:border-foreground transition-colors"
                >
                  <Plus className="h-4 w-4 text-muted-foreground" />
                  Add another profile
                </button>
              )
            )}
          </div>

          {/* Brand book */}
          <div className="border border-border bg-background px-6 py-6 sm:px-8 sm:py-7">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
              <div className="sm:max-w-xs sm:shrink-0">
                <h2 className="font-display text-2xl text-foreground">Brand book</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Upload your brand guidelines so generated photos can better match your visual identity.
                </p>
              </div>

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
                <div className="flex flex-1 items-center justify-center gap-5">
                  <div className="flex h-20 w-16 shrink-0 items-center justify-center border border-border bg-muted/30">
                    <FileText className="h-8 w-8 text-destructive" />
                  </div>
                  <div className="min-w-0">
                    <a
                      href={brandBook.url || undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        'block truncate text-sm font-medium text-foreground',
                        brandBook.url && 'hover:underline',
                      )}
                    >
                      {brandBook.filename}
                    </a>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {fileExt}{brandBook.sizeLabel ? ` · ${brandBook.sizeLabel}` : ''}
                    </p>
                    <div className="mt-2 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={bookUploading}
                        className="text-sm font-medium text-foreground hover:opacity-70 transition-opacity"
                      >
                        {bookUploading ? 'Uploading…' : 'Replace'}
                      </button>
                      <span className="text-border">|</span>
                      <button
                        type="button"
                        onClick={handleBookRemove}
                        disabled={bookRemoving}
                        className="text-sm font-medium text-foreground hover:text-destructive transition-colors"
                      >
                        {bookRemoving ? 'Removing…' : 'Remove'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
                  className="flex flex-1 cursor-pointer flex-col items-center gap-1.5 border border-dashed border-border px-6 py-6 hover:border-foreground transition-colors"
                >
                  {bookUploading
                    ? <Loader2 className="h-5 w-5 animate-spin text-foreground" />
                    : <Upload className="h-5 w-5 text-foreground" />}
                  <p className="text-sm font-medium text-foreground">
                    {bookUploading ? 'Uploading…' : 'Upload brand book'}
                  </p>
                  <p className="text-xs text-muted-foreground">PDF, PNG or JPG · Maximum 20 MB</p>
                  <span className="mt-1.5 border border-border px-4 py-1.5 text-sm text-foreground">
                    Choose file
                  </span>
                </div>
              )}
            </div>
            {bookError && <p className="mt-3 text-center text-sm text-destructive">{bookError}</p>}
          </div>

          {/* Confidentiality note */}
          <div className="flex items-center justify-center gap-2 pt-2">
            <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <p className="text-center text-sm text-muted-foreground">
              Your brand details stay confidential and are never sold or used to train AI.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
