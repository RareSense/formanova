import { useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowRight, Diamond, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { DocInput, DocTextarea } from '@/components/line-sheet/DocFields';
import { getPublicSiteUrl } from '@/lib/public-url';
import { CAD_SHEET_FAQS, CAD_SHEET_PAGE, CAD_SHEET_STEPS } from '@/lib/seo/static-pages';
import {
  EMPTY_ENTERED, ENTERED_LABELS, SOURCE_LABEL, UNIT_CHOICES, readRows, sheetFileName,
  type CadReading, type EnteredFields, type Source, type UnitKey,
} from '@/lib/cad-sheet/model';
import { VIEW_LABEL, type ViewName } from '@/lib/cad-sheet/views';
import { CAD_ACCEPT, CadFileError } from '@/lib/cad-sheet/files';
import type { Paper } from '@/lib/cad-sheet/pdf';
import { trackCadSheetCtaClicked, trackCadSheetDownloaded, trackCadSheetFailed, trackCadSheetStarted } from '@/lib/posthog-events';

const PAGE_URL = `${getPublicSiteUrl()}${CAD_SHEET_PAGE.path}`;
const UTM = 'utm_source=tools&utm_medium=jewelry-cad-tech-sheet';

/** Analytics must never break the tool. */
function track(send: () => void) {
  try {
    send();
  } catch {
    // A lost event is better than a broken sheet.
  }
}

const today = () => new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

/** The small source tag beside every fact. Estimated is the one that asks for attention. */
function Tag({ source }: { source: Source | 'none' }) {
  if (source === 'none') return <span className="font-body text-xs text-muted-foreground">Not given</span>;
  return (
    <span className={`font-body text-xs ${source === 'estimated' ? 'font-medium text-foreground underline decoration-dotted underline-offset-4' : 'text-muted-foreground'}`}>
      {SOURCE_LABEL[source]}
    </span>
  );
}

/**
 * Free jewelry CAD tech sheet (proposal tool 3). Same pattern as the line
 * sheet: the editor is the sheet itself, one Download beside it. The CAD file
 * opens in the browser; every fact is labelled From CAD, Estimated or Entered
 * by you.
 */
export default function JewelryCadTechSheet() {
  const { toast } = useToast();
  const [reading, setReading] = useState<CadReading | null>(null);
  const [views, setViews] = useState<Record<ViewName, string> | null>(null);
  const [entered, setEntered] = useState<EnteredFields>(EMPTY_ENTERED);
  const [units, setUnits] = useState<UnitKey | null>(null);
  const [paper, setPaper] = useState<Paper>('letter');
  const [busy, setBusy] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const date = today();

  const set = (key: keyof EnteredFields) => (e: { target: { value: string } }) => setEntered((f) => ({ ...f, [key]: e.target.value }));

  const open = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      // The CAD reader and three.js load only when a file is chosen.
      const [{ readCad }, { renderViews }] = await Promise.all([import('@/lib/cad-sheet/read'), import('@/lib/cad-sheet/views')]);
      const { reading: r, root } = await readCad(file);
      setReading(r);
      setViews(renderViews(root, r.upAxis));
      setUnits(null);
      setDownloaded(false);
      track(() => trackCadSheetStarted({ format: r.format, no_mesh: r.partsWithoutMesh > 0 }));
    } catch (e) {
      const err = e instanceof CadFileError ? e : new CadFileError('This file could not be opened.', 'unreadable');
      track(() => trackCadSheetFailed({ reason: err.kind }));
      toast({ title: 'That file could not be opened', description: err.message });
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!reading) return;
    setBusy(true);
    let ok = false;
    try {
      const { buildTechSheetPdf } = await import('@/lib/cad-sheet/pdf');
      const doc = await buildTechSheetPdf({ reading, units, entered, views, paper, date });
      doc.save(sheetFileName(entered, reading.fileName));
      ok = true;
      setDownloaded(true);
    } catch {
      toast({ title: 'The PDF could not be created.', description: 'Please try again.' });
    } finally {
      setBusy(false);
    }
    track(() => (ok
      ? trackCadSheetDownloaded({
        format: reading.format,
        has_views: !!views,
        units_confirmed: !!reading.fileUnits || !!units,
        fields_filled: ENTERED_LABELS.filter((f) => entered[f.key].trim()).length,
      })
      : trackCadSheetFailed({ reason: 'pdf_error' })));
  };

  const rows = reading ? readRows(reading, units) : [];

  return (
    <div className="min-h-screen bg-muted/30 text-foreground">
      <Helmet>
        <title>{CAD_SHEET_PAGE.title}</title>
        <meta name="description" content={CAD_SHEET_PAGE.description} />
        <link rel="canonical" href={PAGE_URL} />
      </Helmet>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'Jewelry CAD Tech Sheet',
              applicationCategory: 'DesignApplication',
              operatingSystem: 'Web browser',
              url: PAGE_URL,
              offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            },
            {
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: CAD_SHEET_FAQS.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
            },
          ]),
        }}
      />

      <div className="mx-auto max-w-7xl px-6 py-12 md:px-12 md:py-16">
        <header className="mb-10 max-w-2xl">
          <Link to="/tools" className="font-body text-sm text-muted-foreground hover:text-foreground">Free tools</Link>
          <h1 className="mt-2 font-display text-4xl uppercase tracking-wide md:text-5xl">{CAD_SHEET_PAGE.h1}</h1>
          <p className="mt-3 font-body text-base text-muted-foreground">{CAD_SHEET_PAGE.intro}</p>
        </header>

        <input
          ref={input}
          type="file"
          accept={CAD_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => { open(e.target.files?.[0]); e.target.value = ''; }}
        />

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_220px]">
          {/* The sheet itself */}
          <div
            className="min-w-0 border border-border bg-background p-6 shadow-sm md:p-10"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); open(e.dataTransfer.files?.[0]); }}
          >
            {!reading ? (
              <button
                type="button"
                onClick={() => input.current?.click()}
                className="flex min-h-[420px] w-full cursor-pointer flex-col items-center justify-center gap-3 border-2 border-dashed border-border p-8 text-center transition-colors hover:bg-muted/40"
              >
                {busy ? <Loader2 className="h-9 w-9 animate-spin text-primary" /> : <Diamond className="h-9 w-9 text-primary" />}
                <span className="font-body text-base font-medium">{busy ? 'Opening your file…' : 'Drop a CAD file'}</span>
                <span className="font-body text-sm text-muted-foreground">.3dm, .stl, .obj, .step, .glb or .ply. Opens in your browser.</span>
              </button>
            ) : (
              <>
                {/* Header: piece, reference, revision | date and file */}
                <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <DocInput aria-label="Piece name" placeholder="Piece name" value={entered.pieceName} onChange={set('pieceName')} className="h-11 font-body text-2xl font-semibold" />
                    <div className="flex gap-6 font-body text-sm">
                      <DocInput aria-label="Reference" placeholder="Reference, e.g. R-104" value={entered.reference} onChange={set('reference')} className="h-8 w-48" />
                      <DocInput aria-label="Revision" placeholder="Revision" value={entered.revision} onChange={set('revision')} className="h-8 w-28" />
                    </div>
                  </div>
                  <div className="font-body text-sm md:text-right">
                    <p className="font-medium">Manufacturing tech sheet</p>
                    <p className="text-muted-foreground">{date}</p>
                    <p className="max-w-64 truncate text-muted-foreground" title={reading.fileName}>{reading.fileName}</p>
                  </div>
                </div>

                <hr className="my-8 border-border" />

                {/* Views */}
                {views ? (
                  <div className="grid grid-cols-3 gap-4">
                    {(['front', 'side', 'top'] as ViewName[]).map((v) => (
                      <figure key={v} className="m-0 space-y-2">
                        <img src={views[v]} alt={`${VIEW_LABEL[v]} view of the piece`} className="aspect-square w-full border border-border bg-white object-contain" />
                        <figcaption className="font-body text-sm text-muted-foreground">{VIEW_LABEL[v]}</figcaption>
                      </figure>
                    ))}
                  </div>
                ) : (
                  <div className="border border-border p-5 font-body text-sm">
                    <p className="font-medium">No views for this file.</p>
                    <p className="mt-1 text-muted-foreground">
                      It was saved in Rhino with Save small, which keeps the exact surfaces but not the display meshes a browser draws. The size below is still read from the surfaces. To add views, open it in Rhino, choose Save As and turn Save small off.
                    </p>
                  </div>
                )}

                <hr className="my-8 border-border" />

                {/* From the file | entered by you */}
                <div className="grid gap-10 md:grid-cols-2">
                  <section>
                    <h2 className="font-body text-base font-semibold normal-case tracking-normal">From the CAD file</h2>
                    <dl className="mt-4 space-y-4">
                      {rows.map((r) => (
                        <div key={r.label}>
                          <div className="flex items-baseline justify-between gap-4">
                            <dt className="font-body text-sm text-muted-foreground">{r.label}</dt>
                            <Tag source={r.source} />
                          </div>
                          <dd className="mt-1 break-words font-body text-base">{r.value}</dd>
                        </div>
                      ))}
                    </dl>
                    {!reading.fileUnits && (
                      <div className="mt-5 flex items-center gap-3">
                        <label htmlFor="cad-units" className="font-body text-sm">Units of this file</label>
                        <Select value={units ?? ''} onValueChange={(v) => setUnits(v as UnitKey)}>
                          <SelectTrigger id="cad-units" className="w-40"><SelectValue placeholder="Choose…" /></SelectTrigger>
                          <SelectContent>{UNIT_CHOICES.map((u) => <SelectItem key={u.key} value={u.key}>{u.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    )}
                  </section>

                  <section>
                    <h2 className="font-body text-base font-semibold normal-case tracking-normal">Entered by you</h2>
                    <div className="mt-4 space-y-4">
                      {ENTERED_LABELS.filter((f) => !f.wide).map((f) => (
                        <div key={f.key}>
                          <div className="flex items-baseline justify-between gap-4">
                            <label htmlFor={`cad-${f.key}`} className="font-body text-sm text-muted-foreground">{f.label}</label>
                            <Tag source={entered[f.key].trim() ? 'you' : 'none'} />
                          </div>
                          <DocInput id={`cad-${f.key}`} aria-label={f.label} placeholder={f.placeholder} value={entered[f.key]} onChange={set(f.key)} className="font-body text-base" />
                        </div>
                      ))}
                    </div>
                  </section>
                </div>

                <hr className="my-8 border-border" />

                <label htmlFor="cad-notes" className="font-body text-base font-semibold">Production notes</label>
                <DocTextarea id="cad-notes" aria-label="Production notes" rows={3} placeholder={ENTERED_LABELS.find((f) => f.key === 'notes')?.placeholder} value={entered.notes} onChange={set('notes')} className="mt-2 font-body text-base" />
              </>
            )}
          </div>

          {/* The one action */}
          <aside className="space-y-4 lg:sticky lg:top-24">
            <Button type="button" size="lg" onClick={download} disabled={busy || !reading} className="w-full bg-foreground text-background hover:bg-foreground/90">
              {busy && reading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Download PDF
            </Button>
            <Select value={paper} onValueChange={(v) => setPaper(v as Paper)}>
              <SelectTrigger aria-label="Paper size"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="letter">US Letter</SelectItem>
                <SelectItem value="a4">A4</SelectItem>
              </SelectContent>
            </Select>
            {reading && (
              <Button type="button" variant="outline" size="lg" onClick={() => input.current?.click()} className="w-full">Use another file</Button>
            )}
            <p className="font-body text-sm text-muted-foreground">
              {reading ? 'Fields left empty print as “Not given”.' : 'Add a CAD file to start.'}
            </p>

            {downloaded && (
              <div className="space-y-3 border-t border-border pt-4 font-body text-sm">
                <p>Downloaded. Turn this CAD into professional product photos.</p>
                <Link to={`/dashboard?${UTM}`} onClick={() => track(() => trackCadSheetCtaClicked({ cta: 'cad_photos' }))} className="inline-flex items-center font-medium underline underline-offset-4">
                  Product photos from CAD <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
                <p className="text-muted-foreground">
                  Starting from a sketch instead?{' '}
                  <Link to={`/ai-jewelry-cad/?${UTM}`} reloadDocument onClick={() => track(() => trackCadSheetCtaClicked({ cta: 'sketch_to_cad' }))} className="underline underline-offset-4">
                    Generate editable NURBS CAD
                  </Link>
                </p>
              </div>
            )}
          </aside>
        </div>

        <section className="mt-24 max-w-2xl space-y-12 font-body">
          <div className="space-y-4">
            <h2 className="font-body text-xl font-semibold normal-case tracking-normal">{CAD_SHEET_PAGE.howTo?.heading}</h2>
            <ol className="list-decimal space-y-2 pl-5 text-base text-muted-foreground">
              {CAD_SHEET_STEPS.map((step) => <li key={step}>{step}</li>)}
            </ol>
          </div>
          <div className="space-y-6">
            <h2 className="font-body text-xl font-semibold normal-case tracking-normal">Questions</h2>
            {CAD_SHEET_FAQS.map((f) => (
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
