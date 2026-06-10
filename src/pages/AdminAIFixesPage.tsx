import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  X, ChevronLeft, ChevronRight, Loader2, ImageOff, Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useAuthenticatedImage } from '@/hooks/useAuthenticatedImage';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import {
  type AIFixStatus,
  type AIFixShotType,
  type AIFixListItem,
  type AIFixDetail,
  listAIFixes,
  getAIFixById,
} from '@/lib/ai-fixes-api';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const CATEGORIES = ['ring', 'necklace', 'bracelet', 'earring', 'watch', 'other'] as const;

const WORKFLOW_OPTIONS = [
  { label: 'Model shot (all)',    value: 'family:model_shot' },
  { label: 'Product shot (all)', value: 'family:product_shot' },
  { label: 'fix_model_shot',     value: 'exact:fix_model_shot' },
  { label: 'fix_model_shot_2k',  value: 'exact:fix_model_shot_2k' },
  { label: 'fix_model_shot_4k',  value: 'exact:fix_model_shot_4k' },
  { label: 'fix_product_shot',   value: 'exact:fix_product_shot' },
  { label: 'fix_product_shot_2k', value: 'exact:fix_product_shot_2k' },
  { label: 'fix_product_shot_4k', value: 'exact:fix_product_shot_4k' },
] as const;

const STATUS_CFG: Record<AIFixStatus, { label: string; pill: string }> = {
  completed: { label: 'Completed', pill: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  running:   { label: 'Running',   pill: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  failed:    { label: 'Failed',    pill: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  cancelled: { label: 'Cancelled', pill: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400' },
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatLocalDate(iso: string): string {
  const utc = iso.endsWith('Z') ? iso : iso + 'Z';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(utc));
}

async function downloadAuthImage(url: string, filename: string) {
  try {
    const res = await authenticatedFetch(url);
    if (!res.ok) return;
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch { /* silent */ }
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AIFixStatus }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.failed;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-sm font-mono text-[10px] uppercase tracking-widest whitespace-nowrap ${cfg.pill}`}>
      {cfg.label}
    </span>
  );
}

// ─── ImageThumbnail ───────────────────────────────────────────────────────────

function ImageThumbnail({ url, label }: { url: string | null; label: string }) {
  const [open, setOpen] = useState(false);
  const resolved = useAuthenticatedImage(url);

  return (
    <div className="flex flex-col items-center gap-1.5 shrink-0">
      {url ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-20 h-20 border border-border bg-muted/30 overflow-hidden flex items-center justify-center hover:border-foreground/40 transition-colors"
        >
          {resolved
            ? <img src={resolved} alt={label} className="w-full h-full object-cover" />
            : <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/40" />
          }
        </button>
      ) : (
        <div className="w-20 h-20 border border-border bg-muted/20 flex items-center justify-center">
          <ImageOff className="h-4 w-4 text-muted-foreground/30" />
        </div>
      )}
      <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">{label}</span>

      {url && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-3xl w-full p-0 overflow-hidden bg-black border-0">
            <div className="relative">
              {resolved
                ? <img src={resolved} alt={label} className="w-full max-h-[82vh] object-contain" />
                : <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-white/40" /></div>
              }
              <div className="absolute top-3 left-3">
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => downloadAuthImage(url, `${label.toLowerCase().replace(/\s+/g, '-')}.jpg`)}
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── DetailSheet ──────────────────────────────────────────────────────────────

interface DetailSheetProps {
  item: AIFixDetail | null;
  notFound: boolean;
  open: boolean;
  onClose: () => void;
}

function DetailSheet({ item, notFound, open, onClose }: DetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 pt-6 pb-5 border-b border-border">
          <SheetTitle className="font-display text-2xl tracking-wide [text-shadow:none]">
            AI Fix Detail
          </SheetTitle>
        </SheetHeader>

        {notFound ? (
          <div className="flex flex-col items-center justify-center flex-1 px-6 py-16 text-center gap-2">
            <p className="text-sm font-medium text-foreground">Run not found</p>
            <p className="font-mono text-[10px] text-muted-foreground">
              This run may belong to another tenant or the page is stale.
            </p>
          </div>
        ) : item ? (
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

            {/* User & Meta */}
            <div className="space-y-1">
              <p className="font-medium text-sm break-all">{item.user_email}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
                <StatusBadge status={item.status} />
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground capitalize">
                  {item.category ?? '—'}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {formatLocalDate(item.created_at)}
                </span>
                {item.finished_at && (
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Done {formatLocalDate(item.finished_at)}
                  </span>
                )}
              </div>
              <p className="font-mono text-[10px] text-muted-foreground break-all pt-0.5">
                {item.workflow_name} &middot; {item.workflow_id}
              </p>
            </div>

            {/* Fix instruction */}
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Fix Instruction</p>
              <p className="text-sm leading-relaxed text-justify">{item.prompt ?? '—'}</p>
            </div>

            {/* Images */}
            <div className="border-t border-b border-border py-5">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Images</p>
              <div className="flex flex-wrap gap-4">
                {item.input_image_urls.map((url, i) => {
                  const isProductShot = item.workflow_name.startsWith('fix_product_shot');
                  const label = i === 0
                    ? (isProductShot ? 'Product shot' : 'Model shot')
                    : 'Your jewelry';
                  return <ImageThumbnail key={url} url={url} label={label} />;
                })}
                {item.output_image_url ? (
                  <ImageThumbnail url={item.output_image_url} label="Output" />
                ) : (
                  <div className="flex flex-col items-center gap-1.5 shrink-0">
                    <div className="w-20 h-20 border border-border bg-muted/20 flex items-center justify-center">
                      <ImageOff className="h-4 w-4 text-muted-foreground/30" />
                    </div>
                    <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground text-center">
                      No output
                    </span>
                  </div>
                )}
              </div>
              {!item.output_image_url && (
                <p className="mt-3 font-mono text-[10px] text-muted-foreground">
                  Run {item.status} — no output produced.
                </p>
              )}
            </div>

          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminAIFixesPage() {
  const [categoryFilter, setCategoryFilter] = useState('');
  // workflowFilter encodes either "family:<shot_type>" or "exact:<workflow_name>"
  const [workflowFilter, setWorkflowFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<AIFixStatus | ''>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [offset, setOffset] = useState(0);

  const [activeDetail, setActiveDetail] = useState<AIFixDetail | null>(null);
  const [detailNotFound, setDetailNotFound] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => { setOffset(0); }, [categoryFilter, workflowFilter, statusFilter, fromDate, toDate]);

  const createdAfter  = fromDate ? `${fromDate}T00:00:00` : undefined;
  const createdBefore = toDate   ? `${toDate}T23:59:59`   : undefined;

  const shotType     = workflowFilter.startsWith('family:') ? workflowFilter.slice(7) as AIFixShotType : undefined;
  const workflowName = workflowFilter.startsWith('exact:')  ? workflowFilter.slice(6) : undefined;

  const listQuery = useQuery({
    queryKey: ['ai-fixes-list', { categoryFilter, workflowFilter, statusFilter, fromDate, toDate, offset }],
    queryFn: () => listAIFixes({
      limit:          PAGE_SIZE,
      offset,
      category:       categoryFilter || undefined,
      shot_type:      shotType,
      workflow_name:  workflowName,
      status:         statusFilter || undefined,
      created_after:  createdAfter,
      created_before: createdBefore,
    }),
  });

  const items: AIFixListItem[] = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const hasFilters = !!(categoryFilter || workflowFilter || statusFilter || fromDate || toDate);

  async function openDetail(workflowId: string) {
    setLoadingId(workflowId);
    setDetailNotFound(false);
    try {
      const data = await getAIFixById(workflowId);
      setActiveDetail(data);
      setSheetOpen(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('404')) {
        setActiveDetail(null);
        setDetailNotFound(true);
        setSheetOpen(true);
      }
    } finally {
      setLoadingId(null);
    }
  }

  function clearFilters() {
    setCategoryFilter('');
    setWorkflowFilter('');
    setStatusFilter('');
    setFromDate('');
    setToDate('');
    setOffset(0);
  }

  return (
    <>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8">

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-5">
          <Select value={categoryFilter || 'all'} onValueChange={(v) => setCategoryFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="h-9 w-full sm:w-36 text-sm shrink-0">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORIES.map(c => (
                <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={workflowFilter || 'all'} onValueChange={(v) => setWorkflowFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="h-9 w-full sm:w-48 text-sm shrink-0">
              <SelectValue placeholder="Workflow" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All workflows</SelectItem>
              {WORKFLOW_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v as AIFixStatus)}>
            <SelectTrigger className="h-9 w-full sm:w-36 text-sm shrink-0">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(Object.keys(STATUS_CFG) as AIFixStatus[]).map(s => (
                <SelectItem key={s} value={s}>{STATUS_CFG[s].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-9 w-full sm:w-36 text-sm shrink-0"
          />
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-9 w-full sm:w-36 text-sm shrink-0"
          />

          {hasFilters && (
            <Button variant="outline" size="sm" className="h-9 gap-1.5 shrink-0" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="border border-border overflow-x-auto">
          {listQuery.isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : listQuery.isError ? (
            <div className="flex items-center justify-center py-16">
              <p className="text-sm text-muted-foreground">Failed to load AI fix runs.</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <p className="text-sm text-muted-foreground">No AI fix runs found.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 pl-4 font-mono text-[10px] uppercase tracking-widest">#</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest min-w-[160px]">User</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest w-28">Status</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest w-24">Category</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest w-32">Workflow</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest min-w-[180px]">Prompt</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest w-36">Created</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest w-36">Finished</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, idx) => (
                  <TableRow key={item.workflow_id}>
                    <TableCell className="pl-4 font-mono text-xs text-muted-foreground">
                      {offset + idx + 1}
                    </TableCell>
                    <TableCell className="max-w-[180px]">
                      <p className="text-sm truncate">{item.user_email}</p>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={item.status} />
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs capitalize">
                        {item.category ?? <span className="text-muted-foreground">—</span>}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground truncate block max-w-[120px]" title={item.workflow_name}>
                        {item.workflow_name}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[240px]">
                      <p className="text-sm text-muted-foreground truncate">
                        {item.prompt ?? <span className="italic">—</span>}
                      </p>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {formatLocalDate(item.created_at)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {item.finished_at ? formatLocalDate(item.finished_at) : <span className="text-muted-foreground/40">—</span>}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        disabled={loadingId === item.workflow_id}
                        onClick={() => openDetail(item.workflow_id)}
                      >
                        {loadingId === item.workflow_id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : 'View'
                        }
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-5">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Page {currentPage} of {totalPages} &middot; {total} results
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 text-xs"
                disabled={offset === 0}
                onClick={() => setOffset(o => Math.max(0, o - PAGE_SIZE))}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 text-xs"
                disabled={currentPage >= totalPages}
                onClick={() => setOffset(o => o + PAGE_SIZE)}
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <DetailSheet
        item={activeDetail}
        notFound={detailNotFound}
        open={sheetOpen}
        onClose={() => { setSheetOpen(false); setDetailNotFound(false); }}
      />
    </>
  );
}
