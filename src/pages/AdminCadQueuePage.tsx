import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, ExternalLink, Loader2, Play, Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
  type StartResult,
  type SupervisedPhase,
  type SupervisedRunListItem,
} from '@/lib/supervised-runs-api';

const PAGE_SIZE = 20;
const ALL_PHASES: SupervisedPhase[] = [
  'queued', 'running', 'errored', 'awaiting_review', 'rejected', 'finalizing', 'delivered', 'failed',
];
const DEFAULT_PHASES: SupervisedPhase[] = ['queued', 'errored', 'awaiting_review'];
const STARTABLE: SupervisedPhase[] = ['queued', 'errored'];

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function phaseLabel(phase: string): string {
  return phase.replace(/_/g, ' ');
}

function PhaseBadge({ phase }: { phase: SupervisedPhase }) {
  const variant =
    phase === 'delivered' ? 'default'
      : phase === 'errored' || phase === 'failed' ? 'destructive'
        : 'secondary';
  return (
    <Badge variant={variant} className="capitalize whitespace-nowrap">
      {phaseLabel(phase)}
    </Badge>
  );
}

function PayingBadge({ isPaying }: { isPaying: boolean }) {
  return <Badge variant={isPaying ? 'default' : 'outline'}>{isPaying ? 'Paying' : 'Free'}</Badge>;
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

type StartOutcome = { results: StartResult[] } | { error: string };

export default function AdminCadQueuePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const phaseParams = searchParams.getAll('phase');
  const phases = useMemo(() => {
    const picked = ALL_PHASES.filter((phase) => phaseParams.includes(phase));
    return picked.length > 0 ? picked : DEFAULT_PHASES;
    // phaseParams is a fresh array each render; its joined value is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseParams.join(',')]);
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

  const [ticked, setTicked] = useState<Set<string>>(() => new Set());
  const [outcome, setOutcome] = useState<StartOutcome | null>(null);

  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  // Only ticks on visible, still-startable rows count (a refetch can move a run on).
  const selectedIds = useMemo(
    () => items
      .filter((item) => STARTABLE.includes(item.phase) && ticked.has(item.workflow_id))
      .map((item) => item.workflow_id),
    [items, ticked],
  );

  const start = useMutation({
    mutationFn: (ids: string[]) => startSupervisedRuns(ids),
    onSuccess: (results) => {
      setOutcome({ results });
      setTicked(new Set());
      void query.refetch();
    },
    onError: (error) => {
      setOutcome({ error: errorCode(error) });
    },
  });

  const total = query.data?.total ?? 0;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const error = query.error instanceof SupervisedRunsApiError ? query.error : null;

  // Ticks and the Start outcome belong to the list that was on screen; drop them when it changes.
  function resetSelection() {
    setTicked(new Set());
    setOutcome(null);
  }

  function updateParam(key: string, value: string) {
    resetSelection();
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('offset');
    setSearchParams(next);
  }

  function togglePhase(phase: SupervisedPhase) {
    const nextPhases = phases.includes(phase)
      ? phases.filter((p) => p !== phase)
      : ALL_PHASES.filter((p) => p === phase || phases.includes(p));
    // At least one phase stays on; an empty set would silently snap back to the default.
    if (nextPhases.length === 0) return;
    resetSelection();
    const next = new URLSearchParams(searchParams);
    next.delete('phase');
    for (const p of nextPhases) next.append('phase', p);
    next.delete('offset');
    setSearchParams(next);
  }

  function setPage(page: number) {
    resetSelection();
    const next = new URLSearchParams(searchParams);
    const nextOffset = Math.max(0, (page - 1) * PAGE_SIZE);
    if (nextOffset === 0) next.delete('offset');
    else next.set('offset', String(nextOffset));
    setSearchParams(next);
  }

  function toggleTick(id: string, checked: boolean) {
    setTicked((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function openDetail(item: SupervisedRunListItem) {
    const qs = searchParams.toString();
    navigate(`/admin/cad-queue/${encodeURIComponent(item.workflow_id)}${qs ? `?${qs}` : ''}`);
  }

  const hasFilters = searchParams.has('phase') || Boolean(search);

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-3 flex flex-wrap gap-2">
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

        {hasFilters && (
          <Button variant="outline" size="sm" className="h-9" onClick={() => { resetSelection(); setSearchParams({}); }}>
            Clear
          </Button>
        )}
      </div>

      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Phases">
        {ALL_PHASES.map((phase) => {
          const pressed = phases.includes(phase);
          return (
            <Button
              key={phase}
              type="button"
              size="sm"
              variant={pressed ? 'default' : 'outline'}
              aria-pressed={pressed}
              className="h-8 capitalize"
              onClick={() => togglePhase(phase)}
            >
              {phaseLabel(phase)}
            </Button>
          );
        })}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 text-sm" aria-live="polite">
          {outcome && 'error' in outcome && (
            <p className="break-words text-destructive">Start failed: {outcome.error}</p>
          )}
          {outcome && 'results' in outcome && (
            <div className="space-y-1">
              <p>Started {outcome.results.filter((r) => r.accepted).length}.</p>
              {outcome.results.some((r) => !r.accepted) && (
                <ul className="space-y-0.5">
                  {outcome.results.filter(isRefused).map((r) => (
                    <li key={r.workflow_id} className="break-all font-mono text-xs text-muted-foreground">
                      {r.workflow_id}: {r.code}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <Button
          size="sm"
          className="h-9 gap-1.5 px-4"
          disabled={selectedIds.length === 0 || start.isPending}
          onClick={() => start.mutate(selectedIds)}
        >
          {start.isPending
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Play className="h-3.5 w-3.5" />}
          Start selected ({selectedIds.length})
        </Button>
      </div>

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
            <p className="text-sm text-muted-foreground">No runs in these phases.</p>
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
                  <TableHead className="w-10"><span className="sr-only">Select</span></TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest">Created</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest">User</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest">Workflow</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest">Phase</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest">Attempt</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest">Last Error</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest">Notes</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest">Paying</TableHead>
                  <TableHead className="font-mono text-[10px] uppercase tracking-widest text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const startable = STARTABLE.includes(item.phase);
                  return (
                    <TableRow
                      key={item.workflow_id}
                      className="cursor-pointer"
                      onClick={() => openDetail(item)}
                    >
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          aria-label={`Select ${item.workflow_id}`}
                          disabled={!startable}
                          checked={startable && ticked.has(item.workflow_id)}
                          onCheckedChange={(checked) => toggleTick(item.workflow_id, checked === true)}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(item.created_at)}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-sm">{item.user_email || '-'}</TableCell>
                      <TableCell className="max-w-[240px] truncate text-sm">
                        {item.workflow_name || item.workflow_id}
                      </TableCell>
                      <TableCell><PhaseBadge phase={item.phase} /></TableCell>
                      <TableCell className="font-mono text-xs">{item.attempt}</TableCell>
                      <TableCell className="max-w-[260px] text-sm">
                        {item.last_error ? (
                          <span className="block truncate text-muted-foreground" title={item.last_error}>
                            {item.last_error}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{item.note_count}</TableCell>
                      <TableCell><PayingBadge isPaying={item.is_paying} /></TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          className="gap-1.5"
                          onClick={(event) => {
                            event.stopPropagation();
                            openDetail(item);
                          }}
                        >
                          Open
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
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
