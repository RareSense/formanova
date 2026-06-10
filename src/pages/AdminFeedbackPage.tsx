import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Download, X, ChevronLeft, ChevronRight,
  Loader2, ImageOff, AlertTriangle, Mail, Clock,
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
  type FeedbackItem,
  type EmailStatus,
  listFeedback,
  getAdminFeedbackById,
} from '@/lib/feedback-api';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const CATEGORIES = ['ring', 'necklace', 'bracelet', 'earring', 'watch', 'other'] as const;
const GENERATION_TYPES = ['photoshoot', 'text_to_cad'] as const;

const EMAIL_STATUS_CFG: Record<EmailStatus, { label: string; pill: string; Icon: typeof Mail }> = {
  sent:    { label: 'Sent',    pill: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',  Icon: Mail },
  failed:  { label: 'Failed',  pill: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',         Icon: AlertTriangle },
  pending: { label: 'Pending', pill: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400', Icon: Clock },
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatLocalDate(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

/** Derives the email notification status from item fields. */
function deriveEmailStatus(item: FeedbackItem): EmailStatus {
  if (item.email_sent_at) return 'sent';
  if (item.email_error)   return 'failed';
  return 'pending';
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

// ─── EmailStatusBadge ─────────────────────────────────────────────────────────

function EmailStatusBadge({ status }: { status: EmailStatus }) {
  const cfg = EMAIL_STATUS_CFG[status];
  const Icon = cfg.Icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm font-mono text-[10px] uppercase tracking-widest whitespace-nowrap ${cfg.pill}`}>
      <Icon className="h-2.5 w-2.5" />
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
  item: FeedbackItem | null;
  open: boolean;
  onClose: () => void;
}

function DetailSheet({ item, open, onClose }: DetailSheetProps) {
  if (!item) return null;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 pt-6 pb-5 border-b border-border">
          <SheetTitle className="font-display text-2xl tracking-wide [text-shadow:none]">
            Feedback Detail
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* User & Meta */}
          <div className="space-y-1">
            <p className="font-medium text-sm break-all">{item.reporter_email}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground capitalize">
                {item.category}
              </span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {formatLocalDate(item.created_at)}
              </span>
            </div>
            <p className="font-mono text-[10px] text-muted-foreground break-all pt-0.5">
              {item.workflow_id}
            </p>
          </div>

          {/* Images */}
          <div className="pt-1 pb-1 border-t border-b border-border py-5">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Images</p>
            <div className="flex flex-wrap gap-4">
              <ImageThumbnail url={item.input_image_urls?.[0] ?? null} label="Jewelry" />
              {item.input_image_urls?.[1] ? (
                <ImageThumbnail url={item.input_image_urls[1]} label="Reference" />
              ) : null}
              <ImageThumbnail url={item.output_image_url} label="Output" />
            </div>
          </div>

          {/* Complaint */}
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Complaint</p>
            <p className="text-sm leading-relaxed text-justify">{item.complaint}</p>
          </div>

        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminFeedbackPage() {
  const [searchParams] = useSearchParams();

  const [categoryFilter, setCategoryFilter] = useState('');
  const [generationTypeFilter, setGenerationTypeFilter] = useState('');
  const [emailStatusFilter, setEmailStatusFilter] = useState<EmailStatus | ''>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [offset, setOffset] = useState(0);

  const [activeItem, setActiveItem] = useState<FeedbackItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  // Deep-link: ?id=<uuid> opens that feedback row directly
  const deepLinkId = searchParams.get('id');
  const deepLinkQuery = useQuery({
    queryKey: ['feedback-detail', deepLinkId],
    queryFn: () => getAdminFeedbackById(deepLinkId!),
    enabled: !!deepLinkId,
    staleTime: Infinity,
    retry: false,
  });
  useEffect(() => {
    if (deepLinkQuery.data) {
      setActiveItem(deepLinkQuery.data);
      setSheetOpen(true);
    }
  }, [deepLinkQuery.data]);

  // Reset offset on filter change
  useEffect(() => { setOffset(0); }, [categoryFilter, generationTypeFilter, emailStatusFilter, fromDate, toDate]);

  // Convert local date inputs to ISO 8601 datetimes for the API
  const createdAfter  = fromDate ? `${fromDate}T00:00:00Z` : undefined;
  const createdBefore = toDate   ? `${toDate}T23:59:59Z`   : undefined;

  const queryKey = ['feedback-list', { categoryFilter, generationTypeFilter, emailStatusFilter, fromDate, toDate, offset }];

  const listQuery = useQuery({
    queryKey,
    queryFn: () => listFeedback({
      limit:           PAGE_SIZE,
      offset,
      category:        categoryFilter || undefined,
      generation_type: generationTypeFilter || undefined,
      email_status:    emailStatusFilter || undefined,
      created_after:   createdAfter,
      created_before:  createdBefore,
    }),
  });

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const hasFilters = !!(categoryFilter || generationTypeFilter || emailStatusFilter || fromDate || toDate);

  async function openDetail(id: string) {
    setLoadingId(id);
    try {
      const data = await getAdminFeedbackById(id);
      setActiveItem(data);
      setSheetOpen(true);
    } catch {
      // silent — server errors surface in the query layer
    } finally {
      setLoadingId(null);
    }
  }

  function clearFilters() {
    setCategoryFilter('');
    setGenerationTypeFilter('');
    setEmailStatusFilter('');
    setFromDate('');
    setToDate('');
    setOffset(0);
  }

  return (
    <>
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8">

        {/* Ops notice — shown when filtering for dropped notifications */}
        {(emailStatusFilter === 'failed' || emailStatusFilter === 'pending') && (
          <div className="mb-5 flex items-start gap-3 px-4 py-3 border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 dark:text-amber-300">
              {emailStatusFilter === 'failed'
                ? 'These submissions triggered an email send error — the team was not notified.'
                : 'These submissions were saved but the notification email was never sent (e.g. server crash between save and send).'}
            </p>
          </div>
        )}

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

          <Select value={generationTypeFilter || 'all'} onValueChange={(v) => setGenerationTypeFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="h-9 w-full sm:w-40 text-sm shrink-0">
              <SelectValue placeholder="Generation type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {GENERATION_TYPES.map(t => (
                <SelectItem key={t} value={t} className="capitalize">{t.replace('_', ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={emailStatusFilter || 'all'} onValueChange={(v) => setEmailStatusFilter(v === 'all' ? '' : v as EmailStatus)}>
            <SelectTrigger className="h-9 w-full sm:w-44 text-sm shrink-0">
              <SelectValue placeholder="Email status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All email statuses</SelectItem>
              {(Object.keys(EMAIL_STATUS_CFG) as EmailStatus[]).map(s => (
                <SelectItem key={s} value={s}>{EMAIL_STATUS_CFG[s].label}</SelectItem>
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
              <p className="text-sm text-muted-foreground">Failed to load feedback.</p>
            </div>
          ) : items.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <p className="text-sm text-muted-foreground">No feedback found.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 pl-4 font-mono text-[10px] uppercase tracking-widest">#</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest min-w-[160px]">Reporter</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest w-24">Category</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest w-28">Type</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest min-w-[200px]">Complaint</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest w-32">Notification</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest w-36">Date</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, idx) => (
                  <TableRow key={item.id}>
                    <TableCell className="pl-4 font-mono text-xs text-muted-foreground">
                      {offset + idx + 1}
                    </TableCell>
                    <TableCell className="max-w-[180px]">
                      <p className="text-sm truncate">{item.reporter_email}</p>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs capitalize">{item.category}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">
                        {item.generation_type.replace('_', ' ')}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      <p className="text-sm text-muted-foreground truncate">{item.complaint}</p>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <EmailStatusBadge status={deriveEmailStatus(item)} />
                        {item.email_error && (
                          <p className="font-mono text-[9px] text-destructive truncate max-w-[120px]" title={item.email_error}>
                            {item.email_error}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {formatLocalDate(item.created_at)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        disabled={loadingId === item.id}
                        onClick={() => openDetail(item.id)}
                      >
                        {loadingId === item.id
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
        item={activeItem}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}
