import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowRight, Diamond, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ListingFrame } from '@/components/photo-check/ListingFrame';
import { MarketLogo } from '@/components/photo-check/MarketLogo';
import { getPublicSiteUrl } from '@/lib/public-url';
import { PHOTO_CHECK_FAQS, PHOTO_CHECK_PAGE, PHOTO_CHECK_STEPS } from '@/lib/seo/static-pages';
import { ACCEPTED_IMAGES, ImageError, decodeFullImage } from '@/lib/line-sheet/image';
import { analyze, canFix, runChecks, verdictOf, type Analysis, type PhotoMeta, type Verdict } from '@/lib/photo-check/analyze';
import { buildFixedPhoto, describeFix, type FixedPhoto } from '@/lib/photo-check/fix';
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
    // A lost event is better than a broken tool.
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

/** What the right-hand frame shows for the current photo and marketplace. */
type Result =
  | { kind: 'fixed'; photo: FixedPhoto; changes: string[] }
  | { kind: 'already-good' }
  | { kind: 'cannot-fix' };

/**
 * Free jewelry photo tool (proposal tool 1), as simple as a before/after:
 * pick a marketplace, drop a photo, and the marketplace-ready version appears
 * beside it, with one line saying what changed and one Download button.
 * Everything runs in the browser.
 */
export default function JewelryPhotoChecker() {
  const { toast } = useToast();
  const [market, setMarket] = useState<Marketplace>('amazon');
  const [photo, setPhoto] = useState<Loaded | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const rules = MARKET_RULES[market];
  const ratio = rules.target.width / rules.target.height;

  // Free the decoded photo and object URLs when they are replaced or the page closes.
  useEffect(() => () => { if (photo) { photo.close?.(); URL.revokeObjectURL(photo.url); } }, [photo]);
  useEffect(() => () => { if (result?.kind === 'fixed') URL.revokeObjectURL(result.photo.url); }, [result]);

  // Make the marketplace-ready version whenever the photo or marketplace changes.
  useEffect(() => {
    setResult(null);
    if (!photo) { setBusy(false); return; }
    let cancelled = false;
    const checks = runChecks(photo.meta, photo.analysis, market);
    const verdict: Verdict = verdictOf(checks);
    track(() => trackPhotoCheckResult({
      marketplace: market,
      verdict,
      issues: checks.filter((c) => c.status !== 'pass').map((c) => c.id),
      background: photo.analysis.background.kind,
      long_side: Math.max(photo.meta.width, photo.meta.height),
    }));
    if (!canFix(photo.analysis, market)) { setResult({ kind: 'cannot-fix' }); setBusy(false); return; }
    if (verdict === 'good') { setResult({ kind: 'already-good' }); setBusy(false); return; }
    setBusy(true);
    buildFixedPhoto(photo.source, photo.meta.width, photo.meta.height, photo.analysis, market)
      .then((out) => {
        if (cancelled) { URL.revokeObjectURL(out.url); return; }
        setResult({ kind: 'fixed', photo: out, changes: describeFix(photo.meta, photo.analysis, market, out) });
        track(() => trackPhotoCheckFixed({ marketplace: market }));
      })
      .catch(() => {
        if (cancelled) return;
        setResult(null);
        track(() => trackPhotoCheckFailed({ reason: 'fix_error' }));
        toast({ title: 'The photo could not be prepared.', description: 'Please try again, or try a smaller photo.' });
      })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [photo, market, toast]);

  const addPhoto = async (file?: File) => {
    if (!file) return;
    setBusy(true);
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
      toast({ title: 'That photo could not be opened', description: err.message });
      setBusy(false);
    }
  };

  const download = () => {
    if (result?.kind !== 'fixed' || !photo) return;
    const a = document.createElement('a');
    a.href = result.photo.url;
    a.download = `${photo.name.replace(/\.[^.]+$/, '')}-${market}.jpg`;
    a.click();
    track(() => trackPhotoCheckDownloaded({ marketplace: market, fixed: true }));
  };

  const offer = (cta: 'on_model' | 'studio_photos', label: string) => (
    <Link
      to={OFFER_URL}
      reloadDocument
      onClick={() => track(() => trackPhotoCheckCtaClicked({ cta, verdict: cta === 'on_model' ? 'good' : 'attention' }))}
      className="inline-flex items-center font-body text-sm font-medium underline underline-offset-4"
    >
      {label} <ArrowRight className="ml-1 h-4 w-4" />
    </Link>
  );

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

        <div className="border border-border bg-background p-6 shadow-sm md:p-10">
          {/* One sentence sets the context */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3 text-center">
            <span className="whitespace-nowrap font-body text-lg" id="market-label">Prepare your photo for</span>
            <div role="group" aria-labelledby="market-label" className="inline-flex border border-border">
              {MARKETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={market === m}
                  onClick={() => setMarket(m)}
                  className={`inline-flex h-10 items-center gap-2 px-4 font-body text-sm transition-colors ${market === m ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <MarketLogo market={m} className="h-3.5 w-3.5" />
                  {MARKET_RULES[m].label}
                </button>
              ))}
            </div>
          </div>

          {/* Two identical frames: your photo, and the marketplace-ready version */}
          <div
            className="mt-10 grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); addPhoto(e.dataTransfer.files?.[0]); }}
          >
            <figure className="m-0 space-y-3">
              <figcaption className="text-center font-body text-sm text-muted-foreground">Your photo</figcaption>
              {photo ? (
                <ListingFrame ratio={ratio} src={photo.url} alt="Your photo" />
              ) : (
                <ListingFrame ratio={ratio}>
                  <button
                    type="button"
                    onClick={() => input.current?.click()}
                    className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed border-border p-6 text-center transition-colors hover:bg-muted/40"
                  >
                    {busy ? <Loader2 className="h-9 w-9 animate-spin text-primary" /> : <Diamond className="h-9 w-9 text-primary" />}
                    <span className="font-body text-base font-medium">Drop a jewelry photo</span>
                    <span className="font-body text-sm text-muted-foreground">or click to choose one</span>
                  </button>
                </ListingFrame>
              )}
            </figure>

            <div className="flex justify-center text-muted-foreground" aria-hidden="true">
              <ArrowRight className="hidden h-5 w-5 md:block" strokeWidth={1.5} />
              <ArrowDown className="h-5 w-5 md:hidden" strokeWidth={1.5} />
            </div>

            <figure className="m-0 space-y-3">
              <figcaption className="text-center font-body text-sm text-muted-foreground">Ready for {rules.label}</figcaption>
              {result?.kind === 'fixed' ? (
                <ListingFrame ratio={ratio} src={result.photo.url} alt={`Your photo, ready for ${rules.label}`} />
              ) : result?.kind === 'already-good' && photo ? (
                <ListingFrame ratio={ratio} src={photo.url} alt="Your photo" />
              ) : (
                <ListingFrame ratio={ratio}>
                  <div className="absolute inset-0 flex items-center justify-center p-8 text-center font-body text-sm text-muted-foreground">
                    {busy && photo ? <Loader2 className="h-6 w-6 animate-spin" /> : result?.kind === 'cannot-fix'
                      ? `This background can't be made white automatically. ${rules.label} needs pure white for the main photo.`
                      : `Your ${rules.label}-ready photo appears here`}
                  </div>
                </ListingFrame>
              )}
            </figure>
          </div>

          {/* What changed, then the one action */}
          <div className="mt-8 flex min-h-[88px] flex-col items-center justify-start gap-4 text-center">
            {result?.kind === 'fixed' && (
              <>
                <p className="font-body text-sm text-muted-foreground">{result.changes.join(' · ')}. Your jewelry is unchanged.</p>
                <Button type="button" size="lg" onClick={download} className="w-56">
                  <Download className="mr-2 h-4 w-4" /> Download
                </Button>
                <button type="button" onClick={() => input.current?.click()} className="font-body text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
                  Use another photo
                </button>
              </>
            )}
            {result?.kind === 'already-good' && (
              <>
                <p className="font-body text-sm">Already right for {rules.label}. Nothing to change.</p>
                {offer('on_model', 'Now show it on a model')}
              </>
            )}
            {result?.kind === 'cannot-fix' && (
              <>
                {offer('studio_photos', 'Get studio photos of this piece')}
                <button type="button" onClick={() => input.current?.click()} className="font-body text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
                  Use another photo
                </button>
              </>
            )}
          </div>
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
