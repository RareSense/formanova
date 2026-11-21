import { useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowRight, Diamond, Download, Loader2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ListingFrame } from '@/components/photo-check/ListingFrame';
import { StatusRow } from '@/components/photo-check/StatusRow';
import { MarketLogo } from '@/components/photo-check/MarketLogo';
import { getPublicSiteUrl } from '@/lib/public-url';
import { PHOTO_CHECK_FAQS, PHOTO_CHECK_PAGE, PHOTO_CHECK_STEPS } from '@/lib/seo/static-pages';
import { ACCEPTED_IMAGES, ImageError, decodeFullImage } from '@/lib/line-sheet/image';
import { analyze, canFix, runChecks, verdictOf, type Analysis, type Check, type PhotoMeta } from '@/lib/photo-check/analyze';
import { buildFixedPhoto, type FixedPhoto } from '@/lib/photo-check/fix';
import { samplePixels } from '@/lib/photo-check/sample';
import { MARKET_RULES, SOURCES, type Marketplace } from '@/lib/photo-check/rules';
import {
  trackPhotoCheckCtaClicked, trackPhotoCheckDownloaded, trackPhotoCheckFailed,
  trackPhotoCheckFixed, trackPhotoCheckResult, trackPhotoCheckStarted,
} from '@/lib/posthog-events';

const PAGE_URL = `${getPublicSiteUrl()}${PHOTO_CHECK_PAGE.path}`;
const MARKETS: Marketplace[] = ['amazon', 'etsy', 'shopify'];
const OFFER_URL = '/ai-jewelry-photoshoot/?utm_source=tools&utm_medium=amazon-image-checker';

/** Analytics must never break the tool. */
function track(send: () => void) {
  try {
    send();
  } catch {
    // A lost event is better than a broken check.
  }
}

interface Loaded {
  name: string;
  url: string;
  meta: PhotoMeta;
  analysis: Analysis;
  source: CanvasImageSource;
  close?: () => void;
}

interface Fixed extends FixedPhoto {
  checks: Check[];
}

/**
 * Free jewelry photo checker (proposal tool 1). The passport-photo pattern:
 * pick a marketplace, add a photo, see guide lines and a plain checklist,
 * click Fix it, compare before and after, download. Everything runs in the
 * browser.
 */
export default function JewelryPhotoChecker() {
  const { toast } = useToast();
  const [market, setMarket] = useState<Marketplace>('amazon');
  const [photo, setPhoto] = useState<Loaded | null>(null);
  const [fixed, setFixed] = useState<Fixed | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAfter, setShowAfter] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  const rules = MARKET_RULES[market];

  const checks = useMemo(() => (photo ? runChecks(photo.meta, photo.analysis, market) : []), [photo, market]);
  const verdict = verdictOf(checks);
  const fixable = photo ? canFix(photo.analysis, market) : false;

  // Free the decoded photo and object URLs when they are replaced or the page closes.
  useEffect(() => () => { if (photo) { photo.close?.(); URL.revokeObjectURL(photo.url); } }, [photo]);
  useEffect(() => () => { if (fixed) URL.revokeObjectURL(fixed.url); }, [fixed]);

  // A new marketplace means a new checklist; the old fix no longer applies.
  useEffect(() => { setFixed(null); }, [market]);

  // Report each checklist once, when it changes.
  const reported = useRef('');
  useEffect(() => {
    if (!photo) return;
    const key = `${photo.url}|${market}`;
    if (reported.current === key) return;
    reported.current = key;
    track(() => trackPhotoCheckResult({
      marketplace: market,
      verdict,
      issues: checks.filter((c) => c.status !== 'pass').map((c) => c.id),
      background: photo.analysis.background.kind,
      long_side: Math.max(photo.meta.width, photo.meta.height),
    }));
  }, [photo, market, verdict, checks]);

  const addPhoto = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setFixed(null);
    try {
      const d = await decodeFullImage(file);
      const analysis = analyze(samplePixels(d.source, d.width, d.height));
      setPhoto({
        name: file.name,
        url: URL.createObjectURL(file),
        meta: { width: d.width, height: d.height, bytes: file.size, type: file.type },
        analysis,
        source: d.source,
        close: d.close,
      });
      track(() => trackPhotoCheckStarted({ marketplace: market }));
    } catch (e) {
      const err = e instanceof ImageError ? e : new ImageError(file.name, 'This photo could not be opened.');
      track(() => trackPhotoCheckFailed({ reason: err.kind }));
      toast({ title: 'That photo could not be checked', description: err.message });
    } finally {
      setBusy(false);
    }
  };

  const fix = async () => {
    if (!photo) return;
    setBusy(true);
    try {
      const out = await buildFixedPhoto(photo.source, photo.meta.width, photo.meta.height, photo.analysis, market);
      // Check the fixed photo the same way, so the list shows what changed.
      const img = await createImageBitmap(out.blob);
      const after = analyze(samplePixels(img, img.width, img.height));
      img.close();
      setFixed({
        ...out,
        checks: runChecks({ width: out.width, height: out.height, bytes: out.blob.size, type: 'image/jpeg' }, after, market),
      });
      setShowAfter(true);
      track(() => trackPhotoCheckFixed({ marketplace: market }));
    } catch {
      track(() => trackPhotoCheckFailed({ reason: 'fix_error' }));
      toast({ title: 'The photo could not be fixed.', description: 'Please try again, or try a smaller photo.' });
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!fixed || !photo) return;
    const a = document.createElement('a');
    a.href = fixed.url;
    a.download = `${photo.name.replace(/\.[^.]+$/, '')}-${market}.jpg`;
    a.click();
    track(() => trackPhotoCheckDownloaded({ marketplace: market, fixed: true }));
  };

  const reset = () => {
    setPhoto(null);
    setFixed(null);
    input.current?.click();
  };

  const shownChecks = fixed ? fixed.checks : checks;
  const shownVerdict = fixed ? verdictOf(fixed.checks) : verdict;
  const needsNewBackground = photo && !fixable;
  const firstIssue = shownChecks.find((c) => c.status === 'fail' || c.status === 'warn' || c.status === 'unknown');
  const nextStep = !photo
    ? { text: '', tone: '' }
    : shownVerdict === 'good'
      ? { text: fixed ? `Ready for ${rules.label}. Your jewelry is unchanged.` : `Ready for ${rules.label}.`, tone: 'font-medium' }
      : fixed && fixed.width < rules.target.width
        ? { text: 'Small original, so the fixed photo is small too. Shoot closer for zoom.', tone: 'text-muted-foreground' }
        : { text: firstIssue?.text ?? '', tone: firstIssue?.status === 'fail' ? 'text-destructive' : 'text-foreground' };

  return (
    <div className="min-h-screen bg-muted/30 text-foreground">
      <Helmet>
        <title>{PHOTO_CHECK_PAGE.title}</title>
        <meta name="description" content={PHOTO_CHECK_PAGE.description} />
        <link rel="canonical" href={PAGE_URL} />
      </Helmet>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'Jewelry Photo Checker',
              applicationCategory: 'BusinessApplication',
              operatingSystem: 'Web browser',
              url: PAGE_URL,
              offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            },
            {
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: PHOTO_CHECK_FAQS.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
            },
          ]),
        }}
      />

      <div className="mx-auto max-w-5xl px-6 py-12 md:py-16">
        <header className="mb-8 max-w-2xl">
          <Link to="/tools" className="font-body text-sm text-muted-foreground hover:text-foreground">Free tools</Link>
          <h1 className="mt-2 font-display text-4xl uppercase tracking-wide md:text-5xl">{PHOTO_CHECK_PAGE.h1}</h1>
          <p className="mt-3 font-body text-base text-muted-foreground">{PHOTO_CHECK_PAGE.intro}</p>
        </header>

        <input
          ref={input}
          type="file"
          accept={ACCEPTED_IMAGES}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => { addPhoto(e.target.files?.[0]); e.target.value = ''; }}
        />

        {/* One editor: top bar, the photo in the marketplace's frame, the status strip. */}
        <div className="border border-border bg-background shadow-sm">
          {/* Top bar: presets on the left, the one next step on the right */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
            <div role="group" aria-label="Where do you sell?" className="inline-flex border border-border">
              {MARKETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={market === m}
                  onClick={() => setMarket(m)}
                  className={`inline-flex h-10 items-center gap-2 px-4 font-body text-sm transition-colors ${market === m ? 'bg-foreground text-background' : 'text-foreground hover:bg-muted'}`}
                >
                  <MarketLogo market={m} />
                  {MARKET_RULES[m].label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              {photo && (
                <Button type="button" variant="ghost" onClick={reset} className="h-10 px-4">New photo</Button>
              )}
              {!photo ? (
                <Button type="button" onClick={() => input.current?.click()} disabled={busy} className="h-10 w-48 px-4">
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Choose a photo
                </Button>
              ) : fixed ? (
                <Button type="button" onClick={download} className="h-10 w-48 px-4">
                  <Download className="mr-2 h-4 w-4" /> Download
                </Button>
              ) : fixable && verdict !== 'good' ? (
                <Button type="button" onClick={fix} disabled={busy} className="h-10 w-48 px-4">
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />} Fix for {rules.label}
                </Button>
              ) : null}
            </div>
          </div>

          {/* Canvas: always the marketplace's frame, so nothing moves */}
          <div
            className="bg-muted/50 px-5 py-8"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); addPhoto(e.dataTransfer.files?.[0]); }}
          >
            {!photo ? (
              <ListingFrame ratio={rules.target.width / rules.target.height}>
                <button
                  type="button"
                  onClick={() => input.current?.click()}
                  className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-3 p-6 text-center"
                >
                  <Diamond className="h-9 w-9 text-primary" />
                  <span className="font-body text-base font-medium">Drop a jewelry photo</span>
                  <span className="font-body text-sm text-muted-foreground">See it as {rules.label} will show it</span>
                </button>
              </ListingFrame>
            ) : (
              <ListingFrame
                ratio={rules.target.width / rules.target.height}
                src={fixed && showAfter ? fixed.url : photo.url}
                alt={fixed && showAfter ? 'Your photo, fixed' : 'Your photo'}
              />
            )}
            {fixed && (
              <div className="mt-5 flex justify-center">
                <div role="group" aria-label="Compare" className="inline-flex border border-border bg-background">
                  {[false, true].map((after) => (
                    <button
                      key={String(after)}
                      type="button"
                      aria-pressed={showAfter === after}
                      onClick={() => setShowAfter(after)}
                      className={`h-9 w-24 font-body text-sm transition-colors ${showAfter === after ? 'bg-foreground text-background' : 'hover:bg-muted'}`}
                    >
                      {after ? 'After' : 'Before'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {photo && <StatusRow checks={shownChecks} />}

          {/* One line that says what to do next */}
          {photo && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 font-body text-sm">
              <p className={nextStep.tone}>{nextStep.text}</p>
              {(shownVerdict === 'good' || needsNewBackground) && (
                <Link
                  to={OFFER_URL}
                  reloadDocument
                  onClick={() => track(() => trackPhotoCheckCtaClicked({ cta: needsNewBackground ? 'studio_photos' : 'on_model', verdict: shownVerdict }))}
                  className="inline-flex items-center font-medium underline underline-offset-4"
                >
                  {needsNewBackground ? 'Get studio photos of this piece' : 'Now show it on a model'} <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              )}
            </div>
          )}
        </div>

        <p className="mt-4 font-body text-xs text-muted-foreground">
          {rules.label} rules checked {rules.checkedOn} (
          <a href={SOURCES[market]} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">source</a>
          ). A pre-check, not {rules.label}&rsquo;s approval.
        </p>

        <section className="mt-20 max-w-2xl space-y-12 font-body">
          <div className="space-y-4">
            <h2 className="font-body text-xl font-semibold normal-case tracking-normal">{PHOTO_CHECK_PAGE.howTo?.heading}</h2>
            <ol className="list-decimal space-y-2 pl-5 text-base text-muted-foreground">
              {PHOTO_CHECK_STEPS.map((step) => <li key={step}>{step}</li>)}
            </ol>
          </div>
          <div className="space-y-6">
            <h2 className="font-body text-xl font-semibold normal-case tracking-normal">Questions</h2>
            {PHOTO_CHECK_FAQS.map((f) => (
              <div key={f.q} className="space-y-2">
                <h3 className="font-body text-base font-medium normal-case tracking-normal">{f.q}</h3>
                <p className="text-base leading-relaxed text-muted-foreground">{f.a}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
