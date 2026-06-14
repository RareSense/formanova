import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, X, Globe, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { authenticatedFetch } from '@/lib/authenticated-fetch';

interface BrandProfile {
  brand_name: string;
  website_url: string;
  social_links: string[];
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

const EMPTY: BrandProfile = { brand_name: '', website_url: '', social_links: [] };

export default function BrandDetails() {
  const [profile, setProfile] = useState<BrandProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Edit state
  const [editName, setEditName] = useState('');
  const [editWebsite, setEditWebsite] = useState('');
  const [editLinks, setEditLinks] = useState<string[]>(['']);
  const [nameError, setNameError] = useState(false);

  useEffect(() => {
    authenticatedFetch('/api/user/profile')
      .then((r) => r.json())
      .then((data) => {
        setProfile({
          brand_name: data.brand_name ?? '',
          website_url: data.website_url ?? '',
          social_links: data.social_links ?? [],
        });
      })
      .catch(() => setProfile(EMPTY))
      .finally(() => setIsLoading(false));
  }, []);

  const startEditing = () => {
    if (!profile) return;
    setEditName(profile.brand_name);
    setEditWebsite(profile.website_url);
    setEditLinks(profile.social_links.length ? [...profile.social_links, ''] : ['']);
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
    try {
      const body: Record<string, unknown> = { brand_name: editName.trim() };
      if (editWebsite.trim()) body.website_url = editWebsite.trim();
      const links = editLinks.map((l) => l.trim()).filter(Boolean);
      if (links.length) body.social_links = links;
      const res = await authenticatedFetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to save');
      setProfile({
        brand_name: editName.trim(),
        website_url: editWebsite.trim(),
        social_links: links,
      });
      setIsEditing(false);
    } catch {
      setSaveError('Something went wrong. Please try again.');
    } finally {
      setIsSaving(false);
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
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
          Manage your jewelry brand information. This helps us personalize your AI photoshoots and product experience.
        </p>
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
              <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-foreground">
                Brand / Business name <span className="text-destructive">*</span>
              </label>
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
              <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-foreground">
                Website URL <span className="font-normal text-muted-foreground">[optional]</span>
              </label>
              <input
                type="url"
                value={editWebsite}
                onChange={(e) => setEditWebsite(e.target.value)}
                placeholder="https://yourbrand.com"
                className="w-full border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-foreground transition-colors"
              />
            </div>

            {/* Social links */}
            <div className="space-y-2">
              <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-foreground">
                Social profile links <span className="font-normal text-muted-foreground">[optional]</span>
              </label>
              <div className="space-y-2">
                {editLinks.map((link, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="url"
                      value={link}
                      onChange={(e) => updateLink(i, e.target.value)}
                      placeholder="Instagram, TikTok, Etsy, Shopify, Pinterest, or any brand page"
                      className="flex-1 border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-foreground transition-colors"
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
          </div>
        </div>
      )}
    </div>
  );
}
