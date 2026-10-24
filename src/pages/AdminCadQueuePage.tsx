import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, ExternalLink, Loader2, Play, Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PaginationBar } from '@/components/generations/PaginationBar';
import {
  SupervisedRunsApiError,
  listSupervisedRuns,
  startSupervisedRuns,
  supervisedRunTypeLabel,
  supervisedStatusLabel,
  type StartResult,
  type SupervisedPhase,
  type SupervisedRunListItem,
} from '@/lib/supervised-runs-api';

const PAGE_SIZE = 20;
const STARTABLE: SupervisedPhase[] = ['queued', 'errored'];

type TabKey = 'start' | 'running' | 'review' | 'done';
const TABS: Array<{ key: TabKey; label: string; phases: SupervisedPhase[] }> = [
  { key: 'start', label: 'To start', phases: ['queued', 'errored'] },
  { key: 'running', label: 'Running', phases: ['running', 'finalizing'] },
  { key: 'review', label: 'To review', phases: ['awaiting_review', 'rejected'] },
  { key: 'done', label: 'Done', phases: ['delivered', 'failed'] },
];

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function StatusBadge({ phase, attempt }: { phase: SupervisedPhase; attempt: number }) {
  const variant =
    phase === 'delivered' ? 'default'
      : phase === 'errored' || phase === 'failed' ? 'destructive'
        : 'secondary';
  return (
    <Badge variant={variant} className="whitespace-nowrap">
      {supervisedStatusLabel(phase, attempt)}
    </Badge>
  );
}

function NotAuthorizedState() {
  return (
    <div className="border border-border bg-card">
      <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <AlertTriangle className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <h2 className="font-display text-2xl tracking-wide">Not Authorized</h2>
          <p className="text-sm text-muted-foreground">
            Your account is authenticated, but the backend did not authorize access to the CAD queue.
          </p>
        </div>
      </div>
    </div>
  );
}

function errorCode(error: unknown): string {
  if (error instanceof SupervisedRunsApiError) return error.code;
  if (error instanceof Error && error.message) return error.message;
  return 'request_failed';
}

type RefusedStart = Extract<StartResult, { accepted: false }>;

function isRefused(result: StartResult): result is RefusedStart {
  return !result.accepted;
}

/** What the last Start press did: a summary for Start all, or the request's own failure. */
type StartOutcome = { results: StartResult[]; all: boolean } | { error: string };

function firstLine(text: string): string {
  return text.split(/\r?\n/, 1)[0];
}

export default function AdminCadQueuePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get('tab');
  const tab = TABS.find((t) => t.key === tabParam) ?? TABS[0];
  const phases = tab.phases;
  const search = searchParams.get('search') ?? '';
  const offset = Number(searchParams.get('offset') ?? '0') || 0;
  const trimmedSearch = search.trim();

  // Local, immediately-responsive input value; the `search` URL param is debounced.
  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => { setSearchInput(search); }, [search]);
  useEffect(() => {
    if (searchInput === search) return;
    const t = setTimeout(() => updateParam('search', searchInput), 300);
    return () => clearTimeout(t);
    // Deps: only searchInput, as on the Generations page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const query = useQuery({
    queryKey: ['admin-cad-queue', phases, search, offset],
    queryFn: () => listSupervisedRuns({
      phases,
      userEmail: trimmedSearch || undefined,
      limit: PAGE_SIZE,
      offset,
    }),
    retry: false,
    refetchInterval: 15000,
  });

  const [outcome, setOutcome] = useState<StartOutcome | null>(null);

  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  // Only rows still startable on screen count (a refetch can move a run on).
  const startableIds = useMemo(
    () => items.filter((item) => STARTABLE.includes(item.phase)).map((item) => item.workflow_id),
    [items],
  );

  const start = useMutation({
    mutationFn: ({ ids }: { ids: string[]; all: boolean }) => startSupervisedRuns(ids),
    onSuccess: (results, { all }) => {
      setOutcome({ results, all });
      void query.refetch();
    },
    onError: (error) => {
      setOutcome({ error: errorCode(error) });
    },
  });

  // Each run's own result line: "Started." or the code it was refused with.
  const rowResults = useMemo(() => {
    const map = new Map<string, string>();
    if (outcome && 'results' in outcome) {
      for (const r of outcome.results) map.set(r.workflow_id, isRefused(r) ? r.code : 'Started.');
    }
    return map;
  }, [outcome]);

  const total = query.data?.total ?? 0;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const error = query.error instanceof SupervisedRunsApiError ? query.error : null;

  // The Start results belong to the list that was on screen; drop them when it changes.
  function resetOutcome() {
    setOutcome(null);
  }

  function updateParam(key: string, value: string) {
    resetOutcome();
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('offset');
    setSearchParams(next);
  }

  function selectTab(key: TabKey) {
    if (key === tab.key) return;
    resetOutcome();
    const next = new URLSearchParams(searchParams);
    next.delete('phase');
    if (key === 'start') next.delete('tab');
    else next.set('tab', key);
    next.delete('offset');
    setSearchParams(next);
  }

  function setPage(page: number) {
    resetOutcome();
    const next = new URLSearchParams(searchParams);
    const nextOffset = Math.max(0, (page - 1) * PAGE_SIZE);
    if (nextOffset === 0) next.delete('offset');
    else next.set('offset', String(nextOffset));
    setSearchParams(next);
  }

  function openDetail(item: SupervisedRunListItem) {
    const qs = searchParams.toString();
    navigate(`/admin/cad-queue/${encodeURIComponent(item.workflow_id)}${qs ? `?${qs}` : ''}`);
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative w-full shrink-0 sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search by email..."
            aria-label="Search by email"
            className="h-9 pl-8 text-sm"
          />
        </div>

        {search && (
          <Button variant="outline" size="sm" className="h-9 px-4" onClick={() => updateParam('search', '')}>
            Clear
          </Button>
        )}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" role="tablist" aria-label="Runs">
        {TABS.map((t) => {
          const selected = t.key === tab.key;
          return (
            <Button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={selected}
              variant={selected ? 'default' : 'outline'}
              className="h-9 w-full px-4 sm:w-36"
              onClick={() => selectTab(t.key)}
            >
              {t.label}{selected && query.data ? ` (${total})` : ''}
            </Button>
          );
        })}
      </div>

      {(tab.key === 'start' || outcome) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1 text-sm" aria-live="polite">
            {outcome && 'error' in outcome && (
              <p className="break-words text-destructive">Start failed: {outcome.error}</p>
            )}
            {outcome && 'results' in outcome && outcome.all && (
              <p>Started {outcome.results.filter((r) => r.accepted).length}.</p>
            )}
          </div>
          {tab.key === 'start' && (
            <Button
              size="sm"
              className="h-9 gap-1.5 px-4"
              disabled={startableIds.length === 0 || start.isPending}
              onClick={() => start.mutate({ ids: startableIds, all: true })}
            >
              {start.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Play className="h-3.5 w-3.5" />}
              Start all ({startableIds.length})
            </Button>
          )}
        </div>
      )}

      {query.data && query.error && (
        <p className="mb-3 border border-border bg-muted px-3 py-2 text-sm text-muted-foreground" role="status">
          Couldn't refresh. Showing the last loaded list.
        </p>
      )}

      {query.isLoading ? (
        <div className="border border-border bg-card">
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </div>
      ) : !query.data && (error?.status === 401 || error?.status === 403) ? (
        <NotAuthorizedState />
      ) : !query.data && query.error ? (
        <div className="border border-border bg-card">
          <div className="flex items-center justify-center px-6 py-16 text-center">
            <p className="break-words text-sm text-muted-foreground">
              Failed to load the queue{error ? ` (${error.code})` : ''}.
            </p>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="border border-border bg-card">
          <div className="flex flex-col items-center justify-center gap-4 py-16">
            <p className="text-sm text-muted-foreground">Nothing here.</p>
            {offset > 0 && (
              <Button variant="outline" size="sm" className="h-9 px-4" onClick={() => setPage(1)}>
                Back to first page
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest">When</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest">User</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest">Type</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest">Status</TableHead>
                  <TableHead className="text-right"><span className="sr-only">Action</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const startable = STARTABLE.includes(item.phase);
                  const result = rowResults.get(item.workflow_id);
                  return (
                    <TableRow
                      key={item.workflow_id}
                      className="cursor-pointer"
                      onClick={() => openDetail(item)}
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(item.created_at)}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-sm" title={item.user_email || undefined}>
                        {item.user_email || '-'}
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate text-sm">
                        {supervisedRunTypeLabel(item.workflow_name)}
                      </TableCell>
                      <TableCell className="max-w-[260px]">
                        <StatusBadge phase={item.phase} attempt={item.attempt} />
                        {item.phase === 'errored' && item.last_error && (
                          <span className="mt-1 block truncate text-xs text-muted-foreground" title={item.last_error}>
                            {firstLine(item.last_error)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                        <div className="flex flex-col items-end gap-1">
                          {startable ? (
                            <Button
                              size="sm"
                              className="h-8 w-24 gap-1.5 px-4"
                              disabled={start.isPending}
                              onClick={() => start.mutate({ ids: [item.workflow_id], all: false })}
                            >
                              <Play className="h-3.5 w-3.5" />
                              Start
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 w-24 gap-1.5 px-4"
                              onClick={() => openDetail(item)}
                            >
                              Open
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {result && (
                            <span
                              className={`max-w-[160px] break-all text-xs ${result === 'Started.' ? 'text-muted-foreground' : 'font-mono text-destructive'}`}
                            >
                              {result}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Page {currentPage} of {totalPages} · {total} results
            </p>
            <PaginationBar currentPage={currentPage} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </>
      )}
    </div>
  );
}
