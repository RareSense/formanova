import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueries, useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Play, RefreshCw, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PaginationBar } from '@/components/generations/PaginationBar';
import CadQueueTable from '@/components/admin/CadQueueTable';
import CadTierSelect from '@/components/admin/CadTierSelect';
import { QUEUE_GROUPS, STARTABLE } from '@/lib/cad-queue-view';
import {
  SupervisedRunsApiError,
  listSupervisedRuns,
  startSupervisedRuns,
  type StartResult,
  type SupervisedPhase,
  type SupervisedRunListItem,
} from '@/lib/supervised-runs-api';

const PAGE_SIZE = 50;
const REFRESH_MS = 15000;
// "AI for these": a sentinel for leaving each run on its own AI.
const EACH_RUNS_OWN = '__each__';
const EACH_OPTION = [{ value: EACH_RUNS_OWN, label: "Each run's own" }];

type TabKey = 'open' | 'start' | 'running' | 'review' | 'done';
const OPEN_PHASES: SupervisedPhase[] = ['queued', 'errored', 'awaiting_review', 'rejected', 'running', 'finalizing'];
// All open first: a short queue is all on one screen, grouped by what each run needs next.
const TABS: Array<{ key: TabKey; label: string; phases: SupervisedPhase[] }> = [
  { key: 'open', label: 'All open', phases: OPEN_PHASES },
  ...QUEUE_GROUPS.map((group) => ({ key: group.key as TabKey, label: group.label, phases: group.phases })),
];

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

function clockTime(ms: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(ms));
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
    refetchInterval: REFRESH_MS,
  });

  // Every tab's count, kept current, so the queue's shape shows without opening each tab.
  const counts = useQueries({
    queries: TABS.map((t) => ({
      queryKey: ['admin-cad-queue-count', t.key, search],
      queryFn: () => listSupervisedRuns({ phases: t.phases, userEmail: trimmedSearch || undefined, limit: 1 }),
      retry: false,
      refetchInterval: REFRESH_MS,
    })),
  });

  const [outcome, setOutcome] = useState<StartOutcome | null>(null);

  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  // Only rows still startable on screen count (a refetch can move a run on).
  const startableIds = useMemo(
    () => items.filter((item) => STARTABLE.includes(item.phase)).map((item) => item.workflow_id),
    [items],
  );

  // A chosen AI builds and reviews, as on the generate page; "Each run's own" sends no tiers.
  const [aiForThese, setAiForThese] = useState(EACH_RUNS_OWN);
  const start = useMutation({
    mutationFn: ({ ids }: { ids: string[]; all: boolean }) => (aiForThese === EACH_RUNS_OWN
      ? startSupervisedRuns(ids)
      : startSupervisedRuns(ids, { llm_tier: aiForThese, analysis_tier: aiForThese })),
    onSuccess: (results, { all }) => {
      setOutcome({ results, all });
      void query.refetch();
      counts.forEach((c) => void c.refetch());
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
  const canStartHere = tab.key === 'start' || tab.key === 'open';
  // "How long ago" columns move on with each refresh.
  const now = query.dataUpdatedAt || Date.now();

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
    if (key === 'open') next.delete('tab');
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
      <div className="mb-4 flex flex-wrap items-center gap-2">
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

        <p className="ml-auto flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground" aria-live="polite">
          <RefreshCw className={`h-3 w-3 ${query.isFetching ? 'animate-spin' : ''}`} aria-hidden="true" />
          {query.dataUpdatedAt ? `Updated ${clockTime(query.dataUpdatedAt)}` : 'Loading'}
        </p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" role="tablist" aria-label="Runs">
        {TABS.map((t, index) => {
          const selected = t.key === tab.key;
          const count = counts[index]?.data?.total;
          return (
            <Button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={selected}
              variant={selected ? 'default' : 'outline'}
              className="h-9 w-full gap-2 px-4 sm:w-36"
              onClick={() => selectTab(t.key)}
            >
              {t.label}
              {count !== undefined && <span className="tabular-nums opacity-70">{count}</span>}
            </Button>
          );
        })}
      </div>

      {(canStartHere || outcome) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1 text-sm" aria-live="polite">
            {outcome && 'error' in outcome && (
              <p className="break-words text-destructive">Start failed: {outcome.error}</p>
            )}
            {outcome && 'results' in outcome && outcome.all && (() => {
              // A refused run can leave this view on the refresh, so say here how many and why.
              const refused = outcome.results.filter(isRefused);
              const reasons = [...new Set(refused.map((r) => r.code))].join(', ');
              return (
                <p>
                  {`Started ${outcome.results.length - refused.length}.`}
                  {refused.length > 0 && (
                    <span className="text-destructive">{` ${refused.length} not started (${reasons}).`}</span>
                  )}
                </p>
              );
            })()}
          </div>
          {canStartHere && (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
              <div className="sm:w-64">
                <CadTierSelect
                  label="AI for these"
                  value={aiForThese}
                  onChange={setAiForThese}
                  leading={EACH_OPTION}
                  disabled={start.isPending}
                />
              </div>
              <Button
                size="sm"
                className="h-10 gap-1.5 px-4"
                disabled={startableIds.length === 0 || start.isPending}
                onClick={() => start.mutate({ ids: startableIds, all: true })}
              >
                {start.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Play className="h-3.5 w-3.5" />}
                Start all ({startableIds.length})
              </Button>
            </div>
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
            <p className="text-sm text-muted-foreground">{tab.key === 'open' ? 'Nothing waiting. The queue is clear.' : 'Nothing here.'}</p>
            {offset > 0 && (
              <Button variant="outline" size="sm" className="h-9 px-4" onClick={() => setPage(1)}>
                Back to first page
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          <CadQueueTable
            items={items}
            grouped={tab.key === 'open'}
            now={now}
            rowResults={rowResults}
            starting={start.isPending}
            onStart={(item) => start.mutate({ ids: [item.workflow_id], all: false })}
            onOpen={openDetail}
          />

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
