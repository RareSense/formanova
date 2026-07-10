import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Plus, X, Check, Pencil, ExternalLink, Loader2, Lock, Trash2,
  FileText, Instagram, Link2, Upload,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { authenticatedFetch } from '@/lib/authenticated-fetch';

interface BrandProfile {
  brand_name: string;
  website_url: string;
  store_url: string;
  social_links: string[];
  based_in: string;
  target_markets: string[];
  brand_book_asset_id: string | null;
}

interface BrandBook {
  filename: string;
  url: string;
  sizeLabel?: string;
}

const EMPTY: BrandProfile = {
  brand_name: '',
  website_url: '',
  store_url: '',
  social_links: [],
  based_in: '',
  target_markets: [],
  brand_book_asset_id: null,
};

/** Users often type "mybrand.com" — the backend rejects anything that isn't http(s). */
function normalizeUrl(value: string): string {
  const v = value.trim();
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

function socialIcon(url: string) {
  try {
    const host = new URL(url).hostname;
    if (host.includes('instagram.com')) return Instagram;
  } catch { /* fall through */ }
  return Link2;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const GENERIC_ERROR = 'Something went wrong. Please try again.';

/** PATCH one or more profile fields; returns an error message or null on success. */
async function patchProfile(body: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await authenticatedFetch('/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return null;
    if (res.status === 422) {
      const data = await res.json().catch(() => null);
      const detail = data?.detail;
      if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
        return Object.entries(detail)
          .map(([field, msg]) => `${field.replace(/_/g, ' ')}: ${msg}`)
          .join('. ');
      }
    }
    return GENERIC_ERROR;
  } catch {
    return GENERIC_ERROR;
  }
}

const FIELD_BOX_CLASS =
  'flex w-full items-center gap-2 rounded-lg border border-border bg-background px-4 py-3';

interface InlineFieldProps {
  label: string;
  value: string;
  /** Optional read-mode rendering of the value (e.g. "US · UAE" while editing "US, UAE"). */
  displayValue?: string;
  placeholder: string;
  required?: boolean;
  onSave: (value: string) => Promise<string | null>;
}

/**
 * Read-only value box with a pencil that flips it into an input with explicit
 * save/cancel (Enter/Escape) and a brief saved confirmation.
 */
function InlineField({ label, value, displayValue, placeholder, required, onSave }: InlineFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);

  const startEdit = () => {
    setDraft(value);
    setError(null);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  const save = async () => {
    if (required && !draft.trim()) {
      setError(`${label} is required.`);
      return;
    }
    setSaving(true);
    setError(null);
    const message = await onSave(draft);
    setSaving(false);
    if (message) {
      setError(message);
      return;
    }
    setEditing(false);
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="space-y-1.5">
      <p className="text-sm text-foreground/90">{label}</p>
      {editing ? (
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setError(null); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save();
              if (e.key === 'Escape') cancel();
            }}
            placeholder={placeholder}
            className="min-w-0 flex-1 rounded-lg border border-foreground bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none"
          />
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border text-foreground hover:border-foreground transition-colors"
            aria-label="Save"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={saving}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className={FIELD_BOX_CLASS}>
          <span className={cn('min-w-0 flex-1 truncate text-sm', value ? 'text-foreground' : 'text-muted-foreground/60')}>
            {(value && (displayValue ?? value)) || placeholder}
          </span>
          {saved && (
            <span className="flex shrink-0 items-center gap-1 text-xs text-formanova-success">
              <Check className="h-3.5 w-3.5" />
              Saved
            </span>
          )}
          <button
            type="button"
            onClick={startEdit}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label={`Edit ${label}`}
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

interface SocialRowProps {
  url: string;
  onSave: (value: string | null) => Promise<string | null>;
}

/** One social profile chip: icon + link + external open + pencil; editable with save/cancel/remove. */
function SocialRow({ url, onSave }: SocialRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(url);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const Icon = socialIcon(url);

  const startEdit = () => {
    setDraft(url);
    setError(null);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const act = async (value: string | null) => {
    setSaving(true);
    setError(null);
    const message = await onSave(value);
    setSaving(false);
    if (message) {
      setError(message);
      return;
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="space-y-1.5 col-span-full">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="url"
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setError(null); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void act(draft);
              if (e.key === 'Escape') setEditing(false);
            }}
            placeholder="instagram.com/yourbrand"
            className="min-w-0 flex-1 rounded-lg border border-foreground bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none"
          />
          <button
            type="button"
            onClick={() => void act(draft)}
            disabled={saving}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border text-foreground hover:border-foreground transition-colors"
            aria-label="Save"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={saving}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void act(null)}
            disabled={saving}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:border-destructive hover:text-destructive transition-colors"
            aria-label="Remove"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className={FIELD_BOX_CLASS}>
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{displayUrl(url)}</span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        aria-label="Open link"
      >
        <ExternalLink className="h-4 w-4" />
      </a>
      <button
        type="button"
        onClick={startEdit}
        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        aria-label="Edit link"
      >
        <Pencil className="h-4 w-4" />
      </button>
    </div>
  );
}

const BRAND_BOOK_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp';
const BRAND_BOOK_MAX_BYTES = 20 * 1024 * 1024;
const MAX_SOCIAL_LINKS = 10;

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

  const saveField = useCallback(
    (key: keyof BrandProfile, transform?: (v: string) => unknown) =>
      async (raw: string): Promise<string | null> => {
        const value = transform ? transform(raw) : (raw.trim() || null);
        const message = await patchProfile({ [key]: value });
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
        const message = await patchProfile({ social_links: next });
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
    const message = await patchProfile({ social_links: next });
    setAddSaving(false);
    if (message) { setAddError(message); return; }
    setProfile((prev) => (prev ? { ...prev, social_links: next } : prev));
    setAddDraft('');
    setAddingSocial(false);
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
      if (res.status === 413) { setBookError('File is too large. Maximum size is 20 MB.'); return; }
      if (res.status === 400) { setBookError('Unsupported file type. Use a PDF, PNG, JPG, or WEBP.'); return; }
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      setBrandBook({
        filename: data.filename ?? file.name,
        url: data.url ?? '',
        sizeLabel: formatBytes(file.size),
      });
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

  const fileExt = brandBook?.filename.split('.').pop()?.toUpperCase() ?? '';

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-12">

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
          Manage the information FormaNova uses to craft your studio and photoshoots around your brand.
        </p>
        <div className="mt-2.5 flex items-start gap-2">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-sm leading-relaxed text-muted-foreground">
            Strictly confidential. Never sold, never used to train AI. Used solely to craft a
            bespoke FormaNova experience around your brand.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-6">

          {/* Brand information */}
          <div className="rounded-xl border border-border bg-background px-6 py-6 sm:px-8 sm:py-7">
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
                      className="min-w-0 flex-1 rounded-lg border border-foreground bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void addSocial()}
                      disabled={addSaving}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border text-foreground hover:border-foreground transition-colors"
                      aria-label="Save profile"
                    >
                      {addSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAddingSocial(false); setAddDraft(''); }}
                      disabled={addSaving}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
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
                  className="mt-3 flex w-full items-center gap-2 rounded-lg border border-border px-4 py-3 text-sm text-foreground hover:border-foreground transition-colors"
                >
                  <Plus className="h-4 w-4 text-muted-foreground" />
                  Add another profile
                </button>
              )
            )}
          </div>

          {/* Brand book */}
          <div className="rounded-xl border border-border bg-background px-6 py-6 sm:px-8 sm:py-7">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="sm:max-w-xs">
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
                <div className="flex items-center gap-5">
                  <div className="flex h-20 w-16 shrink-0 items-center justify-center rounded border border-border bg-muted/30">
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
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={bookUploading}
                  className="flex items-center justify-center gap-2 rounded-lg bg-foreground px-6 py-3.5 text-sm font-medium text-background hover:opacity-90 transition-opacity"
                >
                  {bookUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {bookUploading ? 'Uploading' : 'Upload brand book'}
                </button>
              )}
            </div>
            {bookError && <p className="mt-3 text-sm text-destructive">{bookError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
