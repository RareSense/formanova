import type { ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ExternalLink, Loader2, MessageSquareWarning } from 'lucide-react';

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
import { AdminGenerationsApiError } from '@/lib/admin-generations-api';
import { listAdminRhinoUsers, rhinoDateRange, type AdminRhinoUser } from '@/lib/admin-rhino-users-api';
import { formatCredits } from '@/lib/admin-cost-display';
import { parseServerTime } from '@/lib/server-time';

const PAGE_SIZE = 20;
const HEAD = 'font-mono text-[10px] uppercase tracking-widest';

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parseServerTime(value));
}

function StatePanel({ children }: { children: ReactNode }) {
  return (
    <div className="border border-border bg-card">
      <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">{children}</div>
    </div>
  );
}

function IconState({ icon: Icon, title, body }: { icon: typeof AlertTriangle; title: string; body: string }) {
  return (
    <StatePanel>
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h2 className="font-display text-2xl tracking-wide">{title}</h2>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
    </StatePanel>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-4 py-3 sm:px-5 sm:py-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl tracking-wide sm:text-3xl">{value}</p>
    </div>
  );
}

/**
 * Rhino plugin usage: totals plus one row per user (GET /admin/rhino-users).
 * All time by default; from/to are inclusive days kept in the URL like the Generations filters.
 */
export default function AdminRhinoUsersPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  const offset = Number(searchParams.get('offset') ?? '0') || 0;

  const query = useQuery({
    queryKey: ['admin-rhino-users', { from, to, offset }],
    queryFn: () => listAdminRhinoUsers({ limit: PAGE_SIZE, offset, ...rhinoDateRange(from, to) }),
    retry: false,
  });

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const error = query.error instanceof AdminGenerationsApiError ? query.error : null;

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('offset');
    setSearchParams(next);
  }

  function setPage(page: number) {
    const next = new URLSearchParams(searchParams);
    const nextOffset = Math.max(0, (page - 1) * PAGE_SIZE);
    if (nextOffset === 0) next.delete('offset');
    else next.set('offset', String(nextOffset));
    setSearchParams(next);
  }

  // Generations has no user-id filter; its email search is the closest match.
  function openRuns(item: AdminRhinoUser) {
    const qs = new URLSearchParams({ client: 'rhino', search: item.user_email });
    navigate(`/admin/generations?${qs.toString()}`);
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <label className="flex w-full items-center gap-2 text-sm text-muted-foreground sm:w-auto">
          <span className="w-10 shrink-0 sm:w-auto">From</span>
          <Input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => updateParam('from', event.target.value)}
            className="h-9 w-full text-sm sm:w-40"
          />
        </label>
        <label className="flex w-full items-center gap-2 text-sm text-muted-foreground sm:w-auto">
          <span className="w-10 shrink-0 sm:w-auto">To</span>
          <Input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => updateParam('to', event.target.value)}
            className="h-9 w-full text-sm sm:w-40"
          />
        </label>
        {(from || to) && (
          <Button variant="outline" size="sm" className="h-9" onClick={() => setSearchParams({})}>
            Clear
          </Button>
        )}
        <p className="w-full font-mono text-[10px] uppercase tracking-widest text-muted-foreground sm:ml-auto sm:w-auto">
          {from || to ? 'Dates in UTC, both days included' : 'All time'} · Rhino 0.6.0+ runs only
        </p>
      </div>

      {query.isLoading ? (
        <StatePanel>
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </StatePanel>
      ) : error?.status === 401 || error?.status === 403 ? (
        <IconState
          icon={AlertTriangle}
          title="Not Authorized"
          body="Your account is authenticated, but the backend did not authorize access to Rhino users."
        />
      ) : error?.status === 422 ? (
        <IconState icon={MessageSquareWarning} title="Invalid Request" body={error.message || 'The date range is invalid.'} />
      ) : query.isError ? (
        <StatePanel>
          <p className="text-sm text-muted-foreground">Failed to load Rhino users.</p>
        </StatePanel>
      ) : (
        <>
          <section aria-label="Rhino totals" className="mb-5 grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-3">
            <Total label="Rhino users" value={String(query.data?.totals.users ?? 0)} />
            <Total label="Rhino runs" value={String(query.data?.totals.runs ?? 0)} />
            <Total label="Rhino credits" value={formatCredits(query.data?.totals.credits ?? 0)} />
          </section>

          {items.length === 0 ? (
            <StatePanel>
              <p className="text-sm text-muted-foreground">No Rhino users found.</p>
            </StatePanel>
          ) : (
            <>
              <div className="border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className={HEAD}>User</TableHead>
                      <TableHead className={HEAD}>First Rhino run</TableHead>
                      <TableHead className={HEAD}>Last Rhino run</TableHead>
                      <TableHead className={HEAD}>Rhino runs</TableHead>
                      <TableHead className={HEAD}>Rhino credits</TableHead>
                      <TableHead className={`${HEAD} text-right`}>Open</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.user_id} className="cursor-pointer" onClick={() => openRuns(item)}>
                        <TableCell className="max-w-[260px] truncate text-sm">{item.user_email || '-'}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateTime(item.first_run_at)}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateTime(item.last_run_at)}
                        </TableCell>
                        <TableCell className="font-mono text-xs whitespace-nowrap">{item.runs}</TableCell>
                        <TableCell className="font-mono text-xs whitespace-nowrap">{formatCredits(item.credits)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            className="gap-1.5"
                            onClick={(event) => {
                              event.stopPropagation();
                              openRuns(item);
                            }}
                          >
                            View Runs
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-5 flex items-center justify-between gap-4">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Page {currentPage} of {totalPages} · {total} users
                </p>
                <PaginationBar currentPage={currentPage} totalPages={totalPages} onPageChange={setPage} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
