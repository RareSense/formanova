import { useCallback, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowRight, Diamond, Download, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { SheetPreview } from '@/components/line-sheet/SheetPreview';
import { PieceEditor } from '@/components/line-sheet/PieceEditor';
import { getPublicSiteUrl } from '@/lib/public-url';
import {
  emptyProduct, fileName, hasTerms, missingFields, paginate,
  type Brand, type LineSheet, type Paper, type Product, type Terms,
} from '@/lib/line-sheet/layout';
import { ACCEPTED_IMAGES, ImageError, describeFailures, loadImage } from '@/lib/line-sheet/image';
import { trackLineSheetCtaClicked, trackLineSheetDownloaded, trackLineSheetStarted } from '@/lib/posthog-events';

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
    q: 'Are my photos uploaded anywhere?',
    a: 'No. Your photos and product details are processed in your own browser and the PDF is created on your device. Nothing is sent to FormaNova. Keep this page open while you work: closing it clears the sheet.',
  },
];

const EMPTY_BRAND: Brand = { name: '', collection: '', email: '', phone: '', website: '' };
const EMPTY_TERMS: Terms = { minimumOrder: '', payment: '', delivery: '', notes: '' };

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export default function JewelryLineSheet() {
  const { toast } = useToast();
  const [brand, setBrand] = useState<Brand>(EMPTY_BRAND);
  const [products, setProducts] = useState<Product[]>([]);
  const [terms, setTerms] = useState<Terms>(EMPTY_TERMS);
  const [paper, setPaper] = useState<Paper>('letter');
  const [currency, setCurrency] = useState('USD');
  const [step, setStep] = useState('brand');
  const [busy, setBusy] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const started = useRef(false);
  const photoInput = useRef<HTMLInputElement>(null);

  const sheet: LineSheet = useMemo(() => ({ brand, products, terms, paper, currency }), [brand, products, terms, paper, currency]);
  const pageCount = paginate(sheet).length;

  const markStarted = (method: 'photos' | 'blank') => {
    if (started.current) return;
    started.current = true;
    trackLineSheetStarted({ method });
  };

  const addPhotos = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    setBusy(true);
    // Each photo on its own: one file that cannot be opened never stops the rest.
    const added: Product[] = [];
    const failures: ImageError[] = [];
    for (const file of list) {
      try {
        added.push(emptyProduct(newId(), await loadImage(file)));
      } catch (e) {
        failures.push(e instanceof ImageError ? e : new ImageError(file.name, 'This photo could not be opened.'));
      }
    }
    if (added.length > 0) {
      setProducts((prev) => [...prev, ...added]);
      markStarted('photos');
    }
    if (failures.length > 0) {
      toast({
        title: failures.length === 1 ? '1 photo was skipped' : `${failures.length} photos were skipped`,
        description: describeFailures(failures),
      });
    }
    setBusy(false);
  }, [toast]);

  const addBlank = () => {
    setProducts((prev) => [...prev, emptyProduct(newId())]);
    markStarted('blank');
  };

  const updateProduct = (id: string, patch: Partial<Product>) =>
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const move = (index: number, by: -1 | 1) =>
    setProducts((prev) => {
      const next = [...prev];
      const target = index + by;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const remove = (id: string) => setProducts((prev) => prev.filter((p) => p.id !== id));

  const replacePhoto = async (id: string, file?: File) => {
    if (!file) return;
    try {
      updateProduct(id, { image: await loadImage(file) });
    } catch (e) {
      toast({ title: 'That photo was not added', description: e instanceof ImageError ? e.message : undefined });
    }
  };

  const setLogo = async (file?: File) => {
    if (!file) return;
    try {
      const logo = await loadImage(file, 600);
      setBrand((b) => ({ ...b, logo }));
    } catch (e) {
      toast({ title: 'That logo was not added', description: e instanceof ImageError ? e.message : undefined });
    }
  };

  const download = async () => {
    setBusy(true);
    try {
      const { buildLineSheetPdf } = await import('@/lib/line-sheet/pdf');
      const doc = await buildLineSheetPdf(sheet);
      doc.save(fileName(brand));
      trackLineSheetDownloaded({
        products: products.length, pages: pageCount, has_terms: hasTerms(terms), has_logo: !!brand.logo, paper, currency,
      });
      setDownloaded(true);
    } catch {
      toast({ title: 'The PDF could not be created.', description: 'Please try again. If it keeps failing, try fewer or smaller photos.' });
    } finally {
      setBusy(false);
    }
  };

  const missingCount = products.filter((p) => missingFields(p).length > 0).length;

  return (
    <div className="min-h-screen bg-background text-foreground">
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

      {/* Intro */}
      <section className="border-b border-border/30">
        <div className="max-w-7xl mx-auto px-6 md:px-12 lg:px-16 py-10 md:py-14 space-y-4">
          <p className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground uppercase">Free tool</p>
          <h1 className="font-display text-4xl md:text-5xl uppercase tracking-wide leading-none">Jewelry Line Sheet Generator</h1>
          <p className="font-body text-base text-muted-foreground max-w-2xl leading-relaxed">
            Add your pieces, prices and terms, then download a clean PDF line sheet to send to boutiques and wholesale buyers.
          </p>
          <p className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase">Free · No signup · No watermark · Your photos stay on your device</p>
        </div>
      </section>

      {/* Tool */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 lg:px-16 py-10">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] items-start">
          {/* Inputs */}
          <Tabs value={step} onValueChange={setStep} className="min-w-0">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="brand">1. Brand</TabsTrigger>
              <TabsTrigger value="pieces">2. Pieces{products.length > 0 ? ` (${products.length})` : ''}</TabsTrigger>
              <TabsTrigger value="terms">3. Terms</TabsTrigger>
            </TabsList>

            <TabsContent value="brand" className="space-y-5 pt-6">
              <Field label="Brand name" id="brand-name">
                <Input id="brand-name" value={brand.name} placeholder="e.g. Lumen Jewelry" onChange={(e) => setBrand({ ...brand, name: e.target.value })} />
              </Field>
              <Field label="Collection" id="brand-collection">
                <Input id="brand-collection" value={brand.collection} placeholder="e.g. Spring 2027" onChange={(e) => setBrand({ ...brand, collection: e.target.value })} />
              </Field>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Email" id="brand-email">
                  <Input id="brand-email" type="email" value={brand.email} placeholder="wholesale@yourbrand.com" onChange={(e) => setBrand({ ...brand, email: e.target.value })} />
                </Field>
                <Field label="Phone" id="brand-phone">
                  <Input id="brand-phone" type="tel" value={brand.phone} onChange={(e) => setBrand({ ...brand, phone: e.target.value })} />
                </Field>
              </div>
              <Field label="Website" id="brand-website">
                <Input id="brand-website" value={brand.website} placeholder="yourbrand.com" onChange={(e) => setBrand({ ...brand, website: e.target.value })} />
              </Field>
              <Field label="Logo (optional)" id="brand-logo">
                <div className="flex items-center gap-4">
                  {brand.logo && <img src={brand.logo.src} alt="Your logo" className="h-10 w-auto max-w-[120px] object-contain border border-border/40" />}
                  <Input id="brand-logo" type="file" accept={ACCEPTED_IMAGES} onChange={(e) => setLogo(e.target.files?.[0])} />
                  {brand.logo && <Button type="button" variant="ghost" size="sm" onClick={() => setBrand({ ...brand, logo: undefined })}>Remove</Button>}
                </div>
              </Field>
              <StepNext onClick={() => setStep('pieces')} label="Next: add pieces" />
            </TabsContent>

            <TabsContent value="pieces" className="space-y-6 pt-6">
              <label
                htmlFor="piece-photos"
                className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-border px-6 py-10 text-center cursor-pointer hover:bg-muted/40 transition-colors"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); addPhotos(e.dataTransfer.files); }}
              >
                {busy ? <Loader2 className="h-9 w-9 text-primary animate-spin" /> : <Diamond className="h-9 w-9 text-primary" />}
                <span className="font-body text-sm font-medium">Add photos of your pieces</span>
                <span className="font-body text-xs text-muted-foreground">Drop photos here or click to choose. One photo = one piece. JPG, PNG, WebP, AVIF and iPhone HEIC photos all work.</span>
                <input ref={photoInput} id="piece-photos" type="file" accept={ACCEPTED_IMAGES} multiple className="sr-only" onChange={(e) => { if (e.target.files) addPhotos(e.target.files); e.target.value = ''; }} />
              </label>

              <div className="flex flex-wrap items-center justify-between gap-4">
                <Button type="button" variant="outline" onClick={addBlank}>
                  <Plus className="mr-2 h-4 w-4" /> Add a piece without a photo
                </Button>
                <div className="flex items-center gap-3">
                  <Label htmlFor="currency" className="text-sm">Currency</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger id="currency" className="w-[110px]"><SelectValue /></SelectTrigger>
                    <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              {missingCount > 0 && (
                <p className="font-body text-sm text-muted-foreground">{missingCount} {missingCount === 1 ? 'piece needs' : 'pieces need'} more details. They are marked below.</p>
              )}

              <ol className="space-y-4">
                {products.map((p, i) => (
                  <PieceEditor
                    key={p.id}
                    index={i}
                    total={products.length}
                    product={p}
                    onChange={(patch) => updateProduct(p.id, patch)}
                    onMove={(by) => move(i, by)}
                    onRemove={() => remove(p.id)}
                    onPhoto={(file) => replacePhoto(p.id, file)}
                  />
                ))}
              </ol>
              {products.length > 0 && <StepNext onClick={() => setStep('terms')} label="Next: order terms" />}
            </TabsContent>

            <TabsContent value="terms" className="space-y-5 pt-6">
              <p className="font-body text-sm text-muted-foreground">Optional. Filled-in terms go on the last page of your line sheet.</p>
              <Field label="Minimum order" id="terms-min">
                <Input id="terms-min" value={terms.minimumOrder} placeholder="e.g. $500 opening order, $250 reorder" onChange={(e) => setTerms({ ...terms, minimumOrder: e.target.value })} />
              </Field>
              <Field label="Payment" id="terms-payment">
                <Input id="terms-payment" value={terms.payment} placeholder="e.g. 50% deposit, balance before shipping" onChange={(e) => setTerms({ ...terms, payment: e.target.value })} />
              </Field>
              <Field label="Delivery" id="terms-delivery">
                <Input id="terms-delivery" value={terms.delivery} placeholder="e.g. Ships in 3 to 4 weeks" onChange={(e) => setTerms({ ...terms, delivery: e.target.value })} />
              </Field>
              <Field label="Other notes" id="terms-notes">
                <Textarea id="terms-notes" rows={4} value={terms.notes} placeholder="e.g. Returns, exclusivity, custom orders" onChange={(e) => setTerms({ ...terms, notes: e.target.value })} />
              </Field>
            </TabsContent>
          </Tabs>

          {/* Output */}
          <div className="min-w-0 space-y-4 lg:sticky lg:top-24">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
                Preview · {pageCount} {pageCount === 1 ? 'page' : 'pages'}
              </p>
              <div className="flex items-center gap-3">
                <Select value={paper} onValueChange={(v) => setPaper(v as Paper)}>
                  <SelectTrigger aria-label="Paper size" className="w-[120px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="letter">US Letter</SelectItem>
                    <SelectItem value="a4">A4</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="button" onClick={download} disabled={busy || products.length === 0} className="px-6">
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  Download PDF
                </Button>
              </div>
            </div>

            {downloaded && (
              <div className="border border-border p-5 space-y-3">
                <p className="font-body text-sm font-medium">Your line sheet is downloaded.</p>
                <p className="font-body text-sm text-muted-foreground text-justify">
                  Want every piece photographed in the same style? FormaNova creates matching product and on-model photos for a whole collection.
                </p>
                <Button asChild variant="outline">
                  <Link to="/ai-jewelry-photoshoot?utm_source=tools&utm_medium=jewelry-line-sheet" onClick={() => trackLineSheetCtaClicked({ cta: 'collection_photos' })}>
                    See collection photos <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            )}

            <div className="max-h-[75vh] overflow-y-auto bg-muted/40 p-4">
              <SheetPreview sheet={sheet} />
            </div>
          </div>
        </div>
      </section>

      {/* Explanation, readable without using the tool */}
      <section className="border-t border-border/30">
        <div className="max-w-3xl mx-auto px-6 md:px-12 py-16 space-y-10">
          <div className="space-y-4">
            <h2 className="font-display text-3xl uppercase tracking-wide">How to make a jewelry line sheet</h2>
            <ol className="font-body text-sm text-muted-foreground leading-relaxed space-y-2 list-decimal pl-5">
              <li>Add your brand name, collection and contact details.</li>
              <li>Add a photo of each piece, then its name, SKU, metal, stones, size and prices.</li>
              <li>Add your order terms: minimum order, payment and delivery.</li>
              <li>Check the preview and download the PDF.</li>
            </ol>
          </div>
          <div className="space-y-6">
            <h2 className="font-display text-3xl uppercase tracking-wide">Questions</h2>
            {FAQS.map((f) => (
              <div key={f.q} className="space-y-2">
                <h3 className="font-body text-base font-medium">{f.q}</h3>
                <p className="font-body text-sm text-muted-foreground leading-relaxed text-justify">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm">{label}</Label>
      {children}
    </div>
  );
}

function StepNext({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <div className="flex justify-end pt-2">
      <Button type="button" onClick={onClick} className="px-6">{label} <ArrowRight className="ml-2 h-4 w-4" /></Button>
    </div>
  );
}
