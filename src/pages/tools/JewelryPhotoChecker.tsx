import { useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowRight, Diamond, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { CheckList } from '@/components/photo-check/CheckList';
import { PhotoStage } from '@/components/photo-check/PhotoStage';
import { BeforeAfter } from '@/components/photo-check/BeforeAfter';
import { getPublicSiteUrl } from '@/lib/public-url';
import { PHOTO_CHECK_FAQS, PHOTO_CHECK_PAGE, PHOTO_CHECK_STEPS } from '@/lib/seo/static-pages';
import { ACCEPTED_IMAGES, ImageError, decodeFullImage } from '@/lib/line-sheet/image';
import { analyze, canFix, runChecks, verdictOf, type Analysis, type Check, type PhotoMeta } from '@/lib/photo-check/analyze';
import { buildFixedPhoto, computeLayout, type FixLayout, type FixedPhoto } from '@/lib/photo-check/fix';
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
  layout: FixLayout;
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
        layout: computeLayout(photo.meta.width, photo.meta.height, photo.analysis.box, market),
        checks: runChecks({ width: out.width, height: out.height, bytes: out.blob.size, type: 'image/jpeg' }, after, market),
      });
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

        {/* Where you sell */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <span className="font-body text-sm text-muted-foreground" id="market-label">Where do you sell?</span>
          <div role="group" aria-labelledby="market-label" className="inline-flex border border-border bg-background">
            {MARKETS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={market === m}
                onClick={() => setMarket(m)}
                className={`px-5 py-2 font-body text-sm transition-colors ${market === m ? 'bg-foreground text-background' : 'text-foreground hover:bg-muted'}`}
              >
                {MARKET_RULES[m].label}
              </button>
            ))}
          </div>
        </div>

        <input
          ref={input}
          type="file"
          accept={ACCEPTED_IMAGES}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => { addPhoto(e.target.files?.[0]); e.target.value = ''; }}
        />

        <div className="border border-border bg-background p-6 shadow-sm md:p-10">
          {!photo ? (
            <button
              type="button"
              onClick={() => input.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); addPhoto(e.dataTransfer.files?.[0]); }}
              className="flex w-full cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed border-border px-6 py-16 text-center transition-colors hover:bg-muted/40"
            >
              {busy ? <Loader2 className="h-9 w-9 animate-spin text-primary" /> : <Diamond className="h-9 w-9 text-primary" />}
              <span className="font-body text-base font-medium">Drop a photo of your jewelry, or click to choose one</span>
              <span className="font-body text-sm text-muted-foreground">JPG, PNG, WebP, AVIF and iPhone HEIC. One photo at a time.</span>
            </button>
          ) : (
            <div className="grid gap-10 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:items-start">
              {fixed
                ? <BeforeAfter beforeSrc={photo.url} afterSrc={fixed.url} layout={fixed.layout} />
                : <PhotoStage src={photo.url} width={photo.meta.width} height={photo.meta.height} box={photo.analysis.box} minFill={photo.analysis.box ? rules.minFill : undefined} />}

              <div className="space-y-6">
                <CheckList verdict={shownVerdict} checks={shownChecks} market={rules.label} />

                <div className="flex flex-wrap gap-3">
                  {fixed ? (
                    <Button type="button" size="lg" onClick={download} className="px-6">
                      <Download className="mr-2 h-4 w-4" /> Download fixed photo
                    </Button>
                  ) : fixable && verdict !== 'good' ? (
                    <Button type="button" size="lg" onClick={fix} disabled={busy} className="px-6">
                      {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Fix it for {rules.label}
                    </Button>
                  ) : null}
                  <Button type="button" size="lg" variant="outline" onClick={reset} className="px-6">Check another photo</Button>
                </div>

                {fixed && (
                  <p className="font-body text-sm text-muted-foreground">
                    {fixed.width} × {fixed.height} px JPEG. Your jewelry is unchanged; only the framing and background were adjusted.
                    {fixed.width < rules.target.width && ' The jewelry is small in your original photo, so the fixed photo is smaller too: we never enlarge photos, because that blurs the detail. For a larger photo, shoot closer or at a higher resolution.'}
                  </p>
                )}

                {/* One contextual offer, as in the proposal */}
                {(shownVerdict === 'good' || needsNewBackground) && (
                  <div className="space-y-2 border-t border-border pt-5">
                    <p className="font-body text-sm text-muted-foreground">
                      {needsNewBackground ? 'Get consistent studio product photos of this piece.' : 'Ready for your listing. Now show this jewelry on a model.'}
                    </p>
                    <Link
                      to={OFFER_URL}
                      reloadDocument
                      onClick={() => track(() => trackPhotoCheckCtaClicked({ cta: needsNewBackground ? 'studio_photos' : 'on_model', verdict: shownVerdict }))}
                      className="inline-flex items-center font-body text-sm font-medium underline underline-offset-4"
                    >
                      {needsNewBackground ? 'See FormaNova product photos' : 'See FormaNova on-model photos'} <ArrowRight className="ml-1 h-4 w-4" />
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <p className="mt-4 font-body text-xs text-muted-foreground">
          {rules.label} rules from{' '}
          <a href={SOURCES[market]} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{rules.source}</a>
          , checked {rules.checkedOn}. These are pre-checks, not {rules.label}&rsquo;s approval.
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
