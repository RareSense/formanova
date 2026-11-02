/**
 * The version's tech spec, a section of the CAD left panel under Metal
 * weight, shown only when the version has a spec sheet: page 1 of the PDF as
 * an A4 card with the open review items as a chip, View and Download under
 * it, and a larger in-app preview with page navigation on a click.
 *
 * pdf.js is pulled in by a dynamic import here and nowhere else. While it
 * renders, a skeleton; if it cannot (corrupt file, blocked fetch, worker
 * error), a plain document card with the same buttons, and the error logged.
 */
import { useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Download, ExternalLink, FileText } from 'lucide-react';

import { SECTION_LABEL } from '@/components/metal-weight/WeightCard';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { CadSource } from '@/lib/cad-analytics';
import { openVersionFile, saveVersionFile } from '@/lib/cad-version-file';
import type { CadVersionDownload } from '@/lib/cad-versions-api';
import type { SpecSheetPdf } from '@/lib/spec-sheet/pdf-render';
import { cn } from '@/lib/utils';

/** The version lists a spec sheet among its files. */
export function hasSpecSheet(downloads: CadVersionDownload[] | null | undefined): boolean {
  return Boolean(downloads?.some((file) => file.kind === 'spec_sheet'));
}

/** Rendered widths, in CSS px: the panel thumbnail and the dialog page. */
const THUMB_WIDTH = 360;
const PAGE_WIDTH = 720;

type Preview =
  | { status: 'loading' }
  | { status: 'ready'; pdf: SpecSheetPdf; thumbnail: string }
  | { status: 'error' };

function ReviewChip({ openFlags }: { openFlags: number | null | undefined }) {
  if (typeof openFlags !== 'number' || !Number.isFinite(openFlags) || openFlags < 0) return null;
  const open = Math.round(openFlags);
  return (
    <span
      className={cn(
        'absolute right-2 top-2 inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 font-mono text-[10px] shadow-sm',
        open > 0
          ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200'
          : 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200',
      )}
    >
      {open > 0 ? `${open} to review` : <><Check className="h-3 w-3" aria-hidden="true" />No open items</>}
    </span>
  );
}

export interface TechSpecSectionProps {
  assetId: string;
  /** Open Review items on the spec sheet; null or absent when the version sends none. */
  openFlags?: number | null;
  source?: CadSource;
}

export function TechSpecSection({ assetId, openFlags, source }: TechSpecSectionProps) {
  const [preview, setPreview] = useState<Preview>({ status: 'loading' });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageImage, setPageImage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPreview({ status: 'loading' });
    import('@/lib/spec-sheet/pdf-render')
      .then(({ loadSpecSheet }) => loadSpecSheet(assetId))
      .then(async (pdf) => {
        const thumbnail = await pdf.renderPage(1, THUMB_WIDTH);
        if (!cancelled) setPreview({ status: 'ready', pdf, thumbnail });
      })
      .catch((err) => {
        console.error('[TechSpec] spec sheet preview failed', err);
        if (!cancelled) setPreview({ status: 'error' });
      });
    return () => { cancelled = true; };
  }, [assetId]);

  const pdf = preview.status === 'ready' ? preview.pdf : null;
  useEffect(() => {
    if (!dialogOpen || !pdf) return;
    let cancelled = false;
    setPageImage(null);
    pdf.renderPage(page, PAGE_WIDTH)
      .then((image) => { if (!cancelled) setPageImage(image); })
      .catch((err) => console.error('[TechSpec] spec sheet page failed', err));
    return () => { cancelled = true; };
  }, [dialogOpen, pdf, page]);

  const view = () => { void openVersionFile(assetId, 'spec_sheet'); };
  const download = () => { void saveVersionFile(assetId, 'spec_sheet', source); };
  const buttons = (
    <div className="grid grid-cols-2 gap-2">
      <Button type="button" variant="outline" size="sm" onClick={view} className="w-full font-mono text-[11px]">
        <ExternalLink aria-hidden="true" />
        View
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={download} className="w-full font-mono text-[11px]">
        <Download aria-hidden="true" />
        Download
      </Button>
    </div>
  );

  return (
    <section aria-label="Tech spec" className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className={SECTION_LABEL}>Tech spec</h3>
        <span className="font-mono text-[10px] tracking-[0.05em] text-muted-foreground">Spec sheet (PDF)</span>
      </div>
      <div className="space-y-2">
        <button
          type="button"
          aria-label="Open spec sheet preview"
          onClick={() => (preview.status === 'error' ? view() : setDialogOpen(true))}
          disabled={preview.status === 'loading'}
          className="relative block aspect-[210/297] w-full overflow-hidden border border-border bg-white shadow-sm transition-colors hover:border-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait"
        >
          {preview.status === 'loading' && <span data-testid="spec-sheet-skeleton" className="absolute inset-0 animate-pulse bg-muted" />}
          {preview.status === 'ready' && (
            <img src={preview.thumbnail} alt="Spec sheet, page 1" className="h-full w-full object-contain" />
          )}
          {preview.status === 'error' && (
            <span data-testid="spec-sheet-fallback" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-card text-muted-foreground">
              <FileText className="h-10 w-10" aria-hidden="true" />
              <span className="font-mono text-[11px]">Spec sheet (PDF)</span>
            </span>
          )}
          <ReviewChip openFlags={openFlags} />
        </button>
        {buttons}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setPage(1); }}>
        <DialogContent className="flex max-h-[92vh] max-w-2xl flex-col gap-3" aria-describedby={undefined}>
          <DialogTitle className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Spec sheet</DialogTitle>
          <div className="relative min-h-0 flex-1 overflow-auto border border-border bg-white">
            {pageImage
              ? <img src={pageImage} alt={`Spec sheet, page ${page}`} className="mx-auto block h-auto w-full" />
              : <div className="aspect-[210/297] w-full animate-pulse bg-muted" />}
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="outline" size="sm" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft aria-hidden="true" />
            </Button>
            <span className="font-mono text-[11px] text-muted-foreground">{`Page ${page} of ${pdf?.pageCount ?? 1}`}</span>
            <Button type="button" variant="outline" size="sm" aria-label="Next page" disabled={!pdf || page >= pdf.pageCount} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
          {buttons}
        </DialogContent>
      </Dialog>
    </section>
  );
}

export default TechSpecSection;
