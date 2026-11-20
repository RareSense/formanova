import { useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowRight, Download, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { SheetPreview } from '@/components/line-sheet/SheetPreview';
import { SheetGrid } from '@/components/line-sheet/SheetGrid';
import { DocInput, DocTextarea, LogoBox } from '@/components/line-sheet/DocFields';
import { getPublicSiteUrl } from '@/lib/public-url';
import {
  emptyProduct, fileName, hasTerms, missingFields, paginate,
  type Brand, type LineSheet, type Paper, type Product, type Terms,
} from '@/lib/line-sheet/layout';
import { ACCEPTED_IMAGES, ImageError, describeFailures, loadImage } from '@/lib/line-sheet/image';
import { trackLineSheetCtaClicked, trackLineSheetDownloaded, trackLineSheetFailed, trackLineSheetStarted } from '@/lib/posthog-events';

const PAGE_URL = `${getPublicSiteUrl()}/tools/jewelry-line-sheet-generator`;
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'AED', 'INR'];

const FAQS = [
  {
    q: 'What is a jewelry line sheet?',
    a: 'A line sheet is the document a jewelry brand sends to boutiques and wholesale buyers. It shows each piece with a photo, style number (SKU), materials and prices, plus the brand’s contact details and order terms, so a buyer can choose and order.',
  },
  {
    q: 'What should a jewelry line sheet include?',
    a: 'A clear photo of each piece, its name and SKU, the metal, stones and size, the wholesale price and the suggested retail price. Add your brand name, collection, contact details and order terms such as minimum order, payment and delivery time.',
  },
  {
    q: 'Is this line sheet generator really free?',
    a: 'Yes. There is no signup, no watermark and no page limit. You can download the full PDF for as many pieces as you add.',
  },
  {
    q: 'Is my line sheet saved?',
    a: 'No. The PDF is made in your browser and is not saved anywhere. Closing this page clears it, so download your PDF before you leave. Like most websites, we record how people use this page so we can improve it.',
  },
];

const EMPTY_BRAND: Brand = { name: '', collection: '', email: '', phone: '', website: '' };
const EMPTY_TERMS: Terms = { minimumOrder: '', payment: '', delivery: '', notes: '' };

/**
 * Analytics must never break the tool: if PostHog throws (blocked, not loaded,
 * a future SDK change), the jeweler still gets their sheet and PDF.
 */
function track(send: () => void) {
  try {
    send();
  } catch {
    // Ignored on purpose; a lost event is better than a broken download.
  }
}

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

/**
 * Free jewelry line sheet generator. The editor is laid out like the printed
 * sheet (the invoice-generator pattern): brand on top, the pieces in a
 * Sheets-style grid, terms at the bottom, one Download button beside it, and
 * the real pages previewed underneath.
 */
export default function JewelryLineSheet() {
  const { toast } = useToast();
  const [brand, setBrand] = useState<Brand>(EMPTY_BRAND);
  const [products, setProducts] = useState<Product[]>([]);
  const [terms, setTerms] = useState<Terms>(EMPTY_TERMS);
  const [paper, setPaper] = useState<Paper>('letter');
  const [currency, setCurrency] = useState('USD');
  const [busy, setBusy] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const started = useRef(false);
  const addPhotosInput = useRef<HTMLInputElement>(null);

  const sheet: LineSheet = useMemo(() => ({ brand, products, terms, paper, currency }), [brand, products, terms, paper, currency]);
  const pageCount = paginate(sheet).length;
  const incomplete = products.filter((p) => missingFields(p).length > 0).length;

  const markStarted = (method: 'photos' | 'typed' | 'paste') => {
    if (started.current) return;
    started.current = true;
    track(() => trackLineSheetStarted({ method }));
  };

  const setBrandField = (key: keyof Brand) => (e: { target: { value: string } }) => setBrand((b) => ({ ...b, [key]: e.target.value }));
  const setTermField = (key: keyof Terms) => (e: { target: { value: string } }) => setTerms((t) => ({ ...t, [key]: e.target.value }));

  const updateProduct = (id: string, patch: Partial<Product>) =>
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  /** Writes patches from row `index` down, creating rows past the end (typing in the blank row, pasting). */
  const fillRows = (index: number, patches: Partial<Product>[]) => {
    if (patches.length === 0) return;
    setProducts((prev) => {
      const next = [...prev];
      patches.forEach((patch, j) => {
        const at = index + j;
        next[at] = at < next.length ? { ...next[at], ...patch } : { ...emptyProduct(newId()), ...patch };
      });
      return next;
    });
    markStarted(patches.length > 1 ? 'paste' : 'typed');
  };

  /** Photos become new rows; a photo chosen on an existing row replaces that row's photo. */
  const addPhotos = async (files: File[], rowIndex?: number) => {
    if (files.length === 0) return;
    setBusy(true);
    const loaded: Product['image'][] = [];
    const failures: ImageError[] = [];
    for (const file of files) {
      try {
        loaded.push(await loadImage(file));
      } catch (e) {
        failures.push(e instanceof ImageError ? e : new ImageError(file.name, 'This photo could not be opened.'));
      }
    }
    if (loaded.length > 0) {
      setProducts((prev) => {
        if (rowIndex !== undefined && rowIndex < prev.length) {
          return prev.map((p, i) => (i === rowIndex ? { ...p, image: loaded[0] } : p));
        }
        return [...prev, ...loaded.map((image) => emptyProduct(newId(), image))];
      });
      markStarted('photos');
    }
    if (failures.length > 0) {
      track(() => trackLineSheetFailed({ reason: 'photo_skipped', count: failures.length, kinds: failures.map((f) => f.kind) }));
      toast({
        title: failures.length === 1 ? '1 photo was skipped' : `${failures.length} photos were skipped`,
        description: describeFailures(failures),
      });
    }
    setBusy(false);
  };

  const move = (index: number, by: -1 | 1) =>
    setProducts((prev) => {
      const target = index + by;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const setLogo = async (file?: File) => {
    if (!file) return;
    try {
      const logo = await loadImage(file, 600);
      setBrand((b) => ({ ...b, logo }));
    } catch (e) {
      if (e instanceof ImageError) track(() => trackLineSheetFailed({ reason: 'photo_skipped', count: 1, kinds: [e.kind] }));
      toast({ title: 'That logo was not added', description: e instanceof ImageError ? e.message : undefined });
    }
  };

  const download = async () => {
    setBusy(true);
    let saved = false;
    try {
      const { buildLineSheetPdf } = await import('@/lib/line-sheet/pdf');
      const doc = await buildLineSheetPdf(sheet);
      doc.save(fileName(brand));
      saved = true;
      setDownloaded(true);
    } catch {
      toast({ title: 'The PDF could not be created.', description: 'Please try again. If it keeps failing, try fewer or smaller photos.' });
    } finally {
      setBusy(false);
    }
    // Tracked after the download, outside the try, so analytics can never turn a good download into an error.
    track(() => (saved
      ? trackLineSheetDownloaded({ products: products.length, pages: pageCount, has_terms: hasTerms(terms), has_logo: !!brand.logo, paper, currency })
      : trackLineSheetFailed({ reason: 'pdf_error', count: 1 })));
  };

  return (
    <div className="min-h-screen bg-muted/30 text-foreground">
      <Helmet>
        <title>Free Jewelry Line Sheet Generator (PDF) | FormaNova</title>
        <meta name="description" content="Make a professional jewelry line sheet for wholesale buyers in minutes. Add photos, SKUs and prices, then download a clean PDF. Free, no signup, no watermark." />
        <link rel="canonical" href={PAGE_URL} />
      </Helmet>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'Jewelry Line Sheet Generator',
              applicationCategory: 'BusinessApplication',
              operatingSystem: 'Web browser',
              url: PAGE_URL,
              offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            },
            {
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: FAQS.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
            },
          ]),
        }}
      />

      <div className="mx-auto max-w-7xl px-6 py-12 md:px-12 md:py-16">
        {/* Title */}
        <header className="mb-10 max-w-2xl">
          <h1 className="font-display text-4xl uppercase tracking-wide md:text-5xl">Jewelry Line Sheet Generator</h1>
          <p className="mt-3 font-body text-base text-muted-foreground">
            Make a professional line sheet for wholesale buyers. Free, no signup, no watermark.
          </p>
        </header>

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_220px]">
          {/* The sheet: laid out like the printed line sheet */}
          {/* Visible in PostHog session recordings on purpose (owner, 2026-11-21), so the page makes no "never leaves your device" promise. */}
          <div className="min-w-0 border border-border bg-background p-6 shadow-sm md:p-10">
            {/* Brand */}
            <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
              <div className="flex min-w-0 flex-1 flex-col items-start gap-6 sm:flex-row">
                <LogoBox logo={brand.logo} onFile={setLogo} onRemove={() => setBrand((b) => ({ ...b, logo: undefined }))} />
                <div className="min-w-0 flex-1">
                  <DocInput aria-label="Brand name" placeholder="Your brand name" value={brand.name} onChange={setBrandField('name')} className="h-11 font-body text-2xl font-semibold" />
                  <DocInput aria-label="Collection" placeholder="Collection, e.g. Spring 2027" value={brand.collection} onChange={setBrandField('collection')} className="font-body text-base text-muted-foreground" />
                </div>
              </div>
              <div className="w-full font-body text-sm md:w-64 md:text-right">
                <DocInput aria-label="Email" type="email" placeholder="Email" value={brand.email} onChange={setBrandField('email')} className="h-7 md:text-right" />
                <DocInput aria-label="Phone" type="tel" placeholder="Phone" value={brand.phone} onChange={setBrandField('phone')} className="h-7 md:text-right" />
                <DocInput aria-label="Website" placeholder="Website" value={brand.website} onChange={setBrandField('website')} className="h-7 md:text-right" />
              </div>
            </div>

            <hr className="my-8 border-border" />

            {/* Pieces */}
            <SheetGrid
              products={products}
              onChange={updateProduct}
              onFillRows={fillRows}
              onPhotos={addPhotos}
              onMove={move}
              onRemove={(id) => setProducts((prev) => prev.filter((p) => p.id !== id))}
            />
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Button type="button" variant="outline" onClick={() => addPhotosInput.current?.click()} disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Add photos
              </Button>
              <p className="font-body text-sm text-muted-foreground">
                One row per photo. You can also drop photos on the table or paste rows from Excel or Google Sheets.
              </p>
              <input
                ref={addPhotosInput}
                type="file"
                accept={ACCEPTED_IMAGES}
                multiple
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => { if (e.target.files) addPhotos(Array.from(e.target.files)); e.target.value = ''; }}
              />
            </div>

            <hr className="my-8 border-border" />

            {/* Terms */}
            <div>
              <h2 className="font-body text-sm font-medium normal-case tracking-normal">Order terms <span className="font-normal text-muted-foreground">(optional, printed on the last page)</span></h2>
              <div className="mt-3 grid gap-x-8 font-body text-sm sm:grid-cols-2">
                <DocInput aria-label="Minimum order" placeholder="Minimum order, e.g. $500 opening order" value={terms.minimumOrder} onChange={setTermField('minimumOrder')} />
                <DocInput aria-label="Payment" placeholder="Payment, e.g. 50% deposit" value={terms.payment} onChange={setTermField('payment')} />
                <DocInput aria-label="Delivery" placeholder="Delivery, e.g. ships in 3 to 4 weeks" value={terms.delivery} onChange={setTermField('delivery')} />
                <DocTextarea aria-label="Other notes" rows={1} placeholder="Other notes, e.g. returns, custom orders" value={terms.notes} onChange={setTermField('notes')} />
              </div>
            </div>
          </div>

          {/* The one action */}
          <aside className="space-y-4 lg:sticky lg:top-24">
            <Button type="button" size="lg" onClick={download} disabled={busy || products.length === 0} className="w-full">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Download PDF
            </Button>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              <Select value={paper} onValueChange={(v) => setPaper(v as Paper)}>
                <SelectTrigger aria-label="Paper size"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="letter">US Letter</SelectItem>
                  <SelectItem value="a4">A4</SelectItem>
                </SelectContent>
              </Select>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger aria-label="Currency"><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <p className="font-body text-sm text-muted-foreground">
              {products.length === 0
                ? 'Add your first piece to start.'
                : `${products.length} ${products.length === 1 ? 'piece' : 'pieces'} · ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}`}
              {incomplete > 0 && <><br />{incomplete} {incomplete === 1 ? 'piece is' : 'pieces are'} missing a photo, name or price.</>}
            </p>

            {downloaded && (
              <div className="space-y-3 border-t border-border pt-4">
                <p className="font-body text-sm">Downloaded.</p>
                <p className="font-body text-sm text-muted-foreground">
                  Want consistent photos across the whole collection? FormaNova can produce product and on-model images in bulk.
                </p>
                {/* Bulk / managed photography = the dashboard's Large Projects card (owner, 2026-11-21). Signed-out visitors go through login and come back. */}
                <Link
                  to="/dashboard?utm_source=tools&utm_medium=jewelry-line-sheet"
                  onClick={() => track(() => trackLineSheetCtaClicked({ cta: 'collection_photos' }))}
                  className="inline-flex items-center font-body text-sm font-medium underline underline-offset-4"
                >
                  Talk to us about your collection <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </div>
            )}
          </aside>
        </div>

        {/* The real pages */}
        {products.length > 0 && (
          <section className="mt-16" aria-labelledby="preview-heading">
            <h2 id="preview-heading" className="mb-6 font-body text-sm font-medium normal-case tracking-normal text-muted-foreground">Preview of your PDF</h2>
            <div className="lg:max-w-[calc(100%-252px)]">
              <SheetPreview sheet={sheet} />
            </div>
          </section>
        )}

        {/* How-to and questions, readable without using the tool */}
        <section className="mt-24 max-w-2xl space-y-12 font-body">
          <div className="space-y-4">
            <h2 className="font-body text-xl font-semibold normal-case tracking-normal">How to make a jewelry line sheet</h2>
            <ol className="list-decimal space-y-2 pl-5 text-base text-muted-foreground">
              <li>Add your logo, brand name, collection and contact details.</li>
              <li>Add a photo of each piece, then its name, SKU, metal, stone, size and prices.</li>
              <li>Add your order terms: minimum order, payment and delivery.</li>
              <li>Check the preview and download the PDF.</li>
            </ol>
          </div>
          <div className="space-y-6">
            <h2 className="font-body text-xl font-semibold normal-case tracking-normal">Questions</h2>
            {FAQS.map((f) => (
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
