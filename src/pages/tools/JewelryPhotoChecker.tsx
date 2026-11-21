import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowRight, Diamond, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ListingFrame } from '@/components/photo-check/ListingFrame';
import { MarketLogo } from '@/components/photo-check/MarketLogo';
import { DownloadOptions } from '@/components/photo-check/DownloadOptions';
import { getPublicSiteUrl } from '@/lib/public-url';
import { PHOTO_PAGES, PHOTO_PAGE_LINKS } from '@/lib/seo/static-pages';
import { ACCEPTED_IMAGES, ImageError, decodeFullImage } from '@/lib/line-sheet/image';
import { analyze, canFix, runChecks, verdictOf, type Analysis, type PhotoMeta, type Verdict } from '@/lib/photo-check/analyze';
import { buildFixedPhoto, describeFix, type FixedPhoto } from '@/lib/photo-check/fix';
import { samplePixels } from '@/lib/photo-check/sample';
import { exportPhoto, exportSize, type ExportFormat } from '@/lib/photo-check/export';
import { MARKET_RULES, SOURCES, type Marketplace } from '@/lib/photo-check/rules';
import {
  trackPhotoCheckCtaClicked, trackPhotoCheckDownloaded, trackPhotoCheckFailed,
  trackPhotoCheckFixed, trackPhotoCheckResult, trackPhotoCheckStarted,
} from '@/lib/posthog-events';

const MARKETS: Marketplace[] = ['amazon', 'etsy', 'shopify'];
const OFFER_URL = '/ai-jewelry-photoshoot/?utm_source=tools&utm_medium=amazon-image-checker';
/** The proposal's plain-language result. */
const VERDICT_WORDS: Record<Verdict, string> = { good: 'Looks good', attention: 'Needs attention', unknown: "Can't tell reliably" };
const typeName = (t: string) => (t.split('/')[1] || 'image').replace('jpeg', 'jpg').toUpperCase();

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
export default function JewelryPhotoChecker({ initialMarket = 'amazon' }: { initialMarket?: Marketplace }) {
  // Each marketplace has its own page (/tools/amazon-image-checker, /tools/etsy-image-resizer,
  // /tools/shopify-image-resizer): same tool, that marketplace pre-selected, its own words.
  const content = PHOTO_PAGES[initialMarket];
  const PAGE_URL = `${getPublicSiteUrl()}${content.path}`;
  const { toast } = useToast();
  const [market, setMarket] = useState<Marketplace>(initialMarket);
  const [photo, setPhoto] = useState<Loaded | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('jpeg');
  /** Chosen width, or null for the fixed photo's own width. */
  const [exportWidth, setExportWidth] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const rules = MARKET_RULES[market];
  const ratio = rules.target.width / rules.target.height;
  const verdict = photo ? verdictOf(runChecks(photo.meta, photo.analysis, market)) : null;

  // Free the decoded photo and object URLs when they are replaced or the page closes.
  useEffect(() => () => { if (photo) { photo.close?.(); URL.revokeObjectURL(photo.url); } }, [photo]);
  useEffect(() => () => { if (result?.kind === 'fixed') URL.revokeObjectURL(result.photo.url); }, [result]);

  // Make the marketplace-ready version whenever the photo or marketplace changes.
  useEffect(() => {
    setResult(null);
    setExportWidth(null);
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

  const download = async () => {
    if (result?.kind !== 'fixed' || !photo) return;
    const fixedPhoto = result.photo;
    const size = exportSize(fixedPhoto.width, fixedPhoto.height, exportWidth ?? undefined);
    const resized = size.width !== fixedPhoto.width;
    try {
      // The fixed photo is already a JPG at full size: reuse it unless a different type or size was chosen.
      const blob = format === 'jpeg' && !resized
        ? fixedPhoto.blob
        : await exportPhoto(fixedPhoto.blob, size.width, size.height, format, rules.softMaxFileBytes);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${photo.name.replace(/\.[^.]+$/, '')}-${market}.${format === 'webp' ? 'webp' : 'jpg'}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      track(() => trackPhotoCheckDownloaded({ marketplace: market, fixed: true, format: format === 'webp' ? 'webp' : 'jpg', resized }));
    } catch {
      track(() => trackPhotoCheckFailed({ reason: 'fix_error' }));
      toast({ title: 'The photo could not be saved.', description: 'Please try again, or choose JPG.' });
    }
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
        <title>{content.title}</title>
        <meta name="description" content={content.description} />
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
              mainEntity: content.faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
            },
          ]),
        }}
      />

      <div className="mx-auto max-w-7xl px-6 py-12 md:px-12 md:py-16">
        <header className="mb-10 max-w-2xl">
          <Link to="/tools" className="font-body text-sm text-muted-foreground hover:text-foreground">Free tools</Link>
          <h1 className="mt-2 font-display text-4xl uppercase tracking-wide md:text-5xl">{content.h1}</h1>
          <p className="mt-3 font-body text-base text-muted-foreground">{content.intro}</p>
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
                    className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed border-neutral-300 p-6 text-center text-neutral-900 transition-colors hover:bg-neutral-50"
                  >
                    {busy ? <Loader2 className="h-9 w-9 animate-spin text-neutral-900" /> : <Diamond className="h-9 w-9 text-neutral-900" />}
                    <span className="font-body text-base font-medium">Drop a jewelry photo</span>
                    <span className="font-body text-sm text-neutral-600">or click to choose one</span>
                  </button>
                </ListingFrame>
              )}
              <p className="h-5 text-center font-body text-sm text-muted-foreground">
                {photo && verdict && `${VERDICT_WORDS[verdict]} · ${photo.meta.width} × ${photo.meta.height} · ${typeName(photo.meta.type)}`}
              </p>
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
                  <div className="absolute inset-0 flex items-center justify-center p-8 text-center font-body text-sm text-neutral-600">
                    {busy && photo ? <Loader2 className="h-6 w-6 animate-spin" /> : result?.kind === 'cannot-fix'
                      ? `${rules.label} needs a pure white background. This one has to be replaced, and that can't be done here without risking the jewelry.`
                      : `Your ${rules.label}-ready photo appears here`}
                  </div>
                </ListingFrame>
              )}
              <p className="h-5 text-center font-body text-sm text-muted-foreground">
                {result?.kind === 'fixed' && `${result.photo.width} × ${result.photo.height} · JPG`}
                {result?.kind === 'already-good' && photo && `${photo.meta.width} × ${photo.meta.height} · ${typeName(photo.meta.type)}`}
              </p>
            </figure>
          </div>

          {/* What changed, then the one action */}
          <div className="mt-8 flex min-h-[88px] flex-col items-center justify-start gap-4 text-center">
            {result?.kind === 'fixed' && (
              <>
                <p className="font-body text-sm text-foreground">{result.changes.join(' · ')}. Your jewelry is unchanged.</p>
                <Button type="button" size="lg" onClick={download} className="w-56 bg-foreground text-background hover:bg-foreground/90">
                  <Download className="mr-2 h-4 w-4" /> Download
                </Button>
                <DownloadOptions
                  fixedW={result.photo.width}
                  fixedH={result.photo.height}
                  format={format}
                  width={exportWidth ?? result.photo.width}
                  onChange={(f, w) => { setFormat(f); setExportWidth(w); }}
                />
                <Button type="button" variant="outline" size="lg" onClick={() => input.current?.click()} className="w-56">
                  Use another photo
                </Button>
              </>
            )}
            {result?.kind === 'already-good' && (
              <>
                <p className="font-body text-sm">Ready for your listing. Nothing to change.</p>
                {offer('on_model', 'Now show this jewelry on a model')}
              </>
            )}
            {result?.kind === 'cannot-fix' && (
              <>
                {offer('studio_photos', 'Get consistent studio product photos of this piece')}
                <Button type="button" variant="outline" size="lg" onClick={() => input.current?.click()} className="w-56">
                  Use another photo
                </Button>
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
            <h2 className="font-body text-xl font-semibold normal-case tracking-normal">{content.howTo.heading}</h2>
            <ol className="list-decimal space-y-2 pl-5 text-base text-muted-foreground">
              {content.howTo.steps.map((step) => <li key={step}>{step}</li>)}
            </ol>
          </div>
          <div className="space-y-6">
            <h2 className="font-body text-xl font-semibold normal-case tracking-normal">Questions</h2>
            {content.faqs.map((f) => (
              <div key={f.q} className="space-y-2">
                <h3 className="font-body text-base font-medium normal-case tracking-normal">{f.q}</h3>
                <p className="text-base leading-relaxed text-muted-foreground">{f.a}</p>
              </div>
            ))}
          </div>
          <nav aria-label="Same tool for other marketplaces" className="flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-6 text-sm">
            {PHOTO_PAGE_LINKS.filter((l) => l.href !== content.path).map((l) => (
              <Link key={l.href} to={l.href} className="underline underline-offset-4 hover:text-foreground">{l.label}</Link>
            ))}
          </nav>
        </section>
      </div>
    </div>
  );
}
