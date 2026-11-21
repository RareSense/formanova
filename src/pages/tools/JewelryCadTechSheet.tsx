import { useMemo, useRef, useState } from 'react';
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
  EMPTY_ENTERED, ENTERED_LABELS, MEASURED_FIELDS, SOURCE_LABEL, UNIT_CHOICES, readRows, sheetFileName,
  type CadReading, type EnteredFields, type Source, type UnitKey,
} from '@/lib/cad-sheet/model';
import { VIEW_LABEL, VIEW_NAMES, type ViewName } from '@/lib/cad-sheet/views';
import { CAD_ACCEPT, CadFileError } from '@/lib/cad-sheet/files';
import type { Paper, SheetRow } from '@/lib/cad-sheet/pdf';
import { NO_RING, formatAuto, type RawMeasure } from '@/lib/cad-sheet/auto';
import { scheduleRows } from '@/lib/cad-sheet/stones';
import type { PartBox } from '@/lib/cad-sheet/stones';
import { METALS } from '@/lib/cad-sheet/metals';
import { SIZE_SYSTEMS, defaultSizeSystem, type LengthUnit, type SizeSystem } from '@/lib/cad-sheet/sizes';
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

type MeasuredKey = (typeof MEASURED_FIELDS)[number]['key'];

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
  const [views, setViews] = useState<Partial<Record<ViewName, string>> | null>(null);
  /** Layer the jeweler says holds the stones; '' means layers named as stones. */
  const [stoneLayer, setStoneLayer] = useState('');
  const pictures = useRef<HTMLInputElement>(null);
  const [ownPictures, setOwnPictures] = useState(false);
  const [entered, setEntered] = useState<EnteredFields>(EMPTY_ENTERED);
  const [units, setUnits] = useState<UnitKey | null>(null);
  const [paper, setPaper] = useState<Paper>('letter');
  const [busy, setBusy] = useState(false);
  const [raw, setRaw] = useState<RawMeasure | null>(null);
  const [partBoxes, setPartBoxes] = useState<PartBox[]>([]);
  const [system, setSystem] = useState<SizeSystem>(() => defaultSizeSystem(typeof navigator === 'undefined' ? 'en-US' : navigator.language));
  const [length, setLength] = useState<LengthUnit>('mm');
  const [metalKey, setMetalKey] = useState('');
  const [density, setDensity] = useState('');
  /** Measured values the jeweler typed over; a missing key means "use the measurement". */
  const [overrides, setOverrides] = useState<Partial<Record<MeasuredKey, string>>>({});
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
      const [{ reading: r, root, metal, partBoxes: boxes }, { measureRaw }] = await Promise.all([readCad(file), import('@/lib/cad-sheet/auto')]);
      setReading(r);
      setRaw(measureRaw(r, metal));
      setPartBoxes(boxes);
      setOverrides({});
      setStoneLayer('');
      setOwnPictures(false);
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
      const metalLine = [entered.metal.trim(), densityNum > 0 ? `${densityNum} g/cm³` : ''].filter(Boolean).join(' · ');
      const doc = await buildTechSheetPdf({
        reading, units, entered: { ...entered, metal: metalLine }, views, paper, date,
        stoneRows: auto?.groups?.length ? scheduleRows(auto.groups) : null,
        density: densityNum > 0 ? densityNum : null,
        ownPictures,
        notRing: !!raw && !raw.ring && raw.ringWhy === NO_RING,
        measured: measured.map(({ label, value, source }) => ({ label, value, source })),
      });
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
        fields_filled: ENTERED_LABELS.filter((f) => entered[f.key].trim()).length + (entered.metal.trim() ? 1 : 0),
        measured: measured.filter((m) => m.auto).length,
        typed_over: measured.filter((m) => m.source === 'you').length,
      })
      : trackCadSheetFailed({ reason: 'pdf_error' })));
  };

  const rows = reading ? readRows(reading, units) : [];
  const densityNum = Number.parseFloat(density);
  const auto = useMemo(
    () => (reading && raw ? formatAuto(reading, raw, partBoxes, { units, density: densityNum > 0 ? densityNum : 1, system, length, stoneLayers: stoneLayer ? [stoneLayer] : null }) : null),
    [reading, raw, partBoxes, units, densityNum, system, length, stoneLayer],
  );
  /** Each measured line as shown and printed: the jeweler's text wins, then the measurement. */
  const measured: (SheetRow & { key: MeasuredKey; why: string; auto: string | null })[] = MEASURED_FIELDS.map((f) => {
    let a: { value: string | null; why?: string } = auto?.[f.key] ?? { value: null, why: '' };
    if (f.key === 'weight' && a.value && !(densityNum > 0)) a = { value: null, why: 'Choose the metal above to get a weight.' };
    const typed = overrides[f.key];
    const value = typed ?? a.value ?? '';
    return {
      key: f.key, label: f.label, value, auto: a.value, why: a.value ? '' : (a.why ?? ''),
      source: typed !== undefined && typed !== a.value && typed.trim() ? 'you' : value.trim() ? 'estimated' : 'none',
    };
  });
  const stoneLayerChoices = [...new Set(partBoxes.map((p) => p.layer).filter(Boolean))];

  /** The jeweler's own pictures when the file has no display meshes: up to four. */
  const addPictures = async (files: FileList | null) => {
    if (!files?.length) return;
    const toPng = (f: File) => new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1200 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const g = c.getContext('2d')!;
        g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('unreadable'));
      img.src = URL.createObjectURL(f);
    });
    try {
      const urls = await Promise.all([...files].filter((f) => f.type.startsWith('image/')).slice(0, 4).map(toPng));
      setViews(Object.fromEntries(urls.map((u, i) => [VIEW_NAMES[i], u])));
      setOwnPictures(true);
    } catch {
      toast({ title: 'That picture could not be opened', description: 'Please use a JPG, PNG or WebP image.' });
    }
  };

  const pickMetal = (key: string) => {
    setMetalKey(key);
    const m = METALS.find((x) => x.key === key);
    if (m) { setDensity(String(m.density)); setEntered((f) => ({ ...f, metal: m.label })); }
  };

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
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    {VIEW_NAMES.filter((v) => views[v]).map((v) => (
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
                      It was saved in Rhino with Save small, which keeps the exact surfaces but not the display meshes a browser draws. The size below is still read from the surfaces. To add views, open it in Rhino, choose Save As and turn Save small off, or add your own pictures.
                    </p>
                    <input ref={pictures} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { addPictures(e.target.files); e.target.value = ''; }} />
                    <Button type="button" variant="outline" className="mt-4 px-6" onClick={() => pictures.current?.click()}>Add pictures (up to 4)</Button>
                  </div>
                )}

                <hr className="my-8 border-border" />

                {/* From the file | measured from the model */}
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
                    <h2 className="font-body text-base font-semibold normal-case tracking-normal">Measured from the model</h2>
                    <p className="mt-1 font-body text-sm text-muted-foreground">Please check these. Type over any value to change it.</p>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="cad-system" className="font-body text-sm text-muted-foreground">Ring sizes</label>
                        <Select value={system} onValueChange={(v) => setSystem(v as SizeSystem)}>
                          <SelectTrigger id="cad-system" className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>{SIZE_SYSTEMS.map((x) => <SelectItem key={x.key} value={x.key}>{x.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label htmlFor="cad-length" className="font-body text-sm text-muted-foreground">Lengths in</label>
                        <Select value={length} onValueChange={(v) => setLength(v as LengthUnit)}>
                          <SelectTrigger id="cad-length" className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="mm">Millimeters</SelectItem>
                            <SelectItem value="in">Inches</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label htmlFor="cad-metal" className="font-body text-sm text-muted-foreground">Metal</label>
                        <Select value={metalKey} onValueChange={pickMetal}>
                          <SelectTrigger id="cad-metal" className="mt-1"><SelectValue placeholder="Choose…" /></SelectTrigger>
                          <SelectContent>{METALS.map((m) => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label htmlFor="cad-density" className="font-body text-sm text-muted-foreground">Density, g/cm³</label>
                        <DocInput id="cad-density" aria-label="Density in grams per cubic centimeter" inputMode="decimal" placeholder="e.g. 13.07" value={density} onChange={(e) => setDensity(e.target.value)} className="mt-1 font-body text-base" />
                      </div>
                      {stoneLayerChoices.length > 1 && (
                        <div className="col-span-2">
                          <label htmlFor="cad-stone-layer" className="font-body text-sm text-muted-foreground">Stones are on</label>
                          <Select value={stoneLayer || 'auto'} onValueChange={(v) => setStoneLayer(v === 'auto' ? '' : v)}>
                            <SelectTrigger id="cad-stone-layer" className="mt-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="auto">Layers named as stones</SelectItem>
                              {stoneLayerChoices.map((l) => <SelectItem key={l} value={l}>Layer “{l}”</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                    <div className="mt-5 space-y-4">
                      {measured.map((m) => (
                        <div key={m.key}>
                          <div className="flex items-baseline justify-between gap-4">
                            <label htmlFor={`cad-${m.key}`} className="font-body text-sm text-muted-foreground">{m.label}</label>
                            <span className="flex items-baseline gap-3">
                              {m.source === 'you' && m.auto && (
                                <button
                                  type="button"
                                  onClick={() => setOverrides((o) => { const next = { ...o }; delete next[m.key]; return next; })}
                                  className="font-body text-xs underline underline-offset-4"
                                >
                                  Use measured
                                </button>
                              )}
                              <Tag source={m.source} />
                            </span>
                          </div>
                          <DocInput
                            id={`cad-${m.key}`}
                            aria-label={m.label}
                            placeholder={MEASURED_FIELDS.find((f) => f.key === m.key)?.placeholder}
                            value={m.value}
                            onChange={(e) => setOverrides((o) => ({ ...o, [m.key]: e.target.value }))}
                            className="font-body text-base"
                          />
                          {m.why && !m.value && <p className="mt-1 font-body text-sm text-muted-foreground">{m.why}</p>}
                        </div>
                      ))}
                    </div>
                  </section>
                </div>

                <hr className="my-8 border-border" />

                <section>
                  <h2 className="font-body text-base font-semibold normal-case tracking-normal">Entered by you</h2>
                  <div className="mt-4 grid gap-x-10 gap-y-4 md:grid-cols-2">
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
