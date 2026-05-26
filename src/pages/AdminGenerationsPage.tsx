import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ExternalLink, Loader2, MessageSquareWarning, Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  AdminGenerationsApiError,
  listAdminGenerations,
  type AdminGenerationListItem,
} from '@/lib/admin-generations-api';
import { matchesAdminGenerationSearch } from '@/lib/admin-generations-search';

const PAGE_SIZE = 20;
const STATUS_OPTIONS = ['queued', 'running', 'completed', 'failed', 'cancelled'] as const;
const USER_TYPE_OPTIONS = [
  'jewelry_brand',
  'freelancer',
  'researcher_student',
  'content_creator',
  'other',
] as const;

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

function formatCredits(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '-';
  return `${new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(value)} credits`;
}

function formatUserType(value: string | null): string {
  if (!value) return '-';
  return value.replace(/_/g, ' ');
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === 'completed' ? 'default'
      : status === 'failed' ? 'destructive'
        : 'secondary';
  return (
    <Badge variant={variant} className="capitalize">
      {status.replace(/_/g, ' ')}
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
            Your account is authenticated, but the backend did not authorize access to admin generations.
          </p>
        </div>
      </div>
    </div>
  );
}

function InvalidRequestState({ message }: { message: string }) {
  return (
    <div className="border border-border bg-card">
      <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <MessageSquareWarning className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <h2 className="font-display text-2xl tracking-wide">Invalid Request</h2>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
    </div>
  );
}

export default function AdminGenerationsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const status = searchParams.get('status') ?? '';
  const search = searchParams.get('search') ?? searchParams.get('workflow_name') ?? '';
  const hasFeedback = searchParams.get('has_feedback') ?? '';
  const userType = searchParams.get('user_type') ?? '';
  const isPaying = searchParams.get('is_paying') ?? '';
  const offset = Number(searchParams.get('offset') ?? '0') || 0;
  const hasSearch = search.trim().length > 0;
  const isEmailSearch = hasSearch && search.includes('@');

  const query = useQuery({
    queryKey: ['admin-generations', { status, search, hasFeedback, userType, isPaying, offset }],
    queryFn: () => listAdminGenerations({
      limit: PAGE_SIZE,
      offset,
      status: status || undefined,
      user_email: isEmailSearch ? search.trim() : undefined,
      has_feedback: hasFeedback === '' ? undefined : hasFeedback === 'true',
      user_type: userType || undefined,
      is_paying: isPaying === '' ? undefined : isPaying === 'true',
    }),
    retry: false,
  });

  const serverItems = query.data?.items ?? [];
  const items = useMemo(
    () => (hasSearch
      ? serverItems.filter((item) => matchesAdminGenerationSearch(item, search))
      : serverItems),
    [hasSearch, search, serverItems],
  );
  const total = query.data?.total ?? 0;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const error = query.error instanceof AdminGenerationsApiError ? query.error : null;

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === 'search') next.delete('workflow_name');
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

  function clearFilters() {
    setSearchParams({});
  }

  const hasFilters = useMemo(
    () => Boolean(status || search || hasFeedback || userType || isPaying),
    [status, search, hasFeedback, userType, isPaying],
  );

  function openDetail(item: AdminGenerationListItem) {
    const qs = searchParams.toString();
    navigate(`/admin/generations/${encodeURIComponent(item.workflow_id)}${qs ? `?${qs}` : ''}`);
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8">

        <div className="mb-5 flex flex-wrap gap-2">
          <div className="relative w-full shrink-0 sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => updateParam('search', event.target.value)}
              placeholder="Search by email, workflow, or ID..."
              className="h-9 pl-8 text-sm"
            />
          </div>

          <Select value={status || 'all'} onValueChange={(value) => updateParam('status', value === 'all' ? '' : value)}>
            <SelectTrigger className="h-9 w-full shrink-0 text-sm sm:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option} value={option} className="capitalize">{option}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={hasFeedback || 'all'} onValueChange={(value) => updateParam('has_feedback', value === 'all' ? '' : value)}>
            <SelectTrigger className="h-9 w-full shrink-0 text-sm sm:w-44">
              <SelectValue placeholder="Complaint flag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All complaint states</SelectItem>
              <SelectItem value="true">Has complaint</SelectItem>
              <SelectItem value="false">No complaint</SelectItem>
            </SelectContent>
          </Select>

          <Select value={userType || 'all'} onValueChange={(value) => updateParam('user_type', value === 'all' ? '' : value)}>
            <SelectTrigger className="h-9 w-full shrink-0 text-sm sm:w-44">
              <SelectValue placeholder="User type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All user types</SelectItem>
              {USER_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>{option.replace(/_/g, ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={isPaying || 'all'} onValueChange={(value) => updateParam('is_paying', value === 'all' ? '' : value)}>
            <SelectTrigger className="h-9 w-full shrink-0 text-sm sm:w-36">
              <SelectValue placeholder="Plan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All plans</SelectItem>
              <SelectItem value="true">Paying</SelectItem>
              <SelectItem value="false">Free</SelectItem>
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button variant="outline" size="sm" className="h-9" onClick={clearFilters}>
              Clear
            </Button>
          )}
        </div>

        {query.isLoading ? (
          <div className="border border-border bg-card">
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          </div>
        ) : error?.status === 401 || error?.status === 403 ? (
          <NotAuthorizedState />
        ) : error?.status === 402 || error?.status === 422 ? (
          <InvalidRequestState message={error.message || 'One or more filters are invalid.'} />
        ) : error ? (
          <div className="border border-border bg-card">
            <div className="flex items-center justify-center py-16">
              <p className="text-sm text-muted-foreground">Failed to load generations.</p>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="border border-border bg-card">
            <div className="flex items-center justify-center py-16">
              <p className="text-sm text-muted-foreground">No generations found.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-mono text-[10px] uppercase tracking-widest">Created</TableHead>
                    <TableHead className="font-mono text-[10px] uppercase tracking-widest">User</TableHead>
                    <TableHead className="font-mono text-[10px] uppercase tracking-widest">Workflow</TableHead>
                    <TableHead className="font-mono text-[10px] uppercase tracking-widest">Status</TableHead>
                    <TableHead className="font-mono text-[10px] uppercase tracking-widest">Actual Cost</TableHead>
                    <TableHead className="font-mono text-[10px] uppercase tracking-widest">Provider Cost</TableHead>
                    <TableHead className="font-mono text-[10px] uppercase tracking-widest">User Type</TableHead>
                    <TableHead className="font-mono text-[10px] uppercase tracking-widest">Paying</TableHead>
                    <TableHead className="font-mono text-[10px] uppercase tracking-widest">Complaint</TableHead>
                    <TableHead className="font-mono text-[10px] uppercase tracking-widest text-right">Open</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow
                      key={item.workflow_id}
                      className="cursor-pointer"
                      onClick={() => openDetail(item)}
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {formatDateTime(item.created_at)}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-sm">{item.user_email || '-'}</TableCell>
                      <TableCell className="max-w-[280px] truncate text-sm">
                        {item.workflow_name || item.workflow_id}
                      </TableCell>
                      <TableCell><StatusBadge status={item.status} /></TableCell>
                      <TableCell className="font-mono text-xs">{formatCredits(item.actual_cost)}</TableCell>
                      <TableCell className="font-mono text-xs">{formatCredits(item.provider_cost)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground capitalize">
                        {formatUserType(item.user_type)}
                      </TableCell>
                      <TableCell><PayingBadge isPaying={item.is_paying} /></TableCell>
                      <TableCell>
                        {item.feedback_id ? (
                          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                            <MessageSquareWarning className="h-4 w-4" />
                            <span className="font-mono text-[10px] uppercase tracking-widest">Has Complaint</span>
                          </span>
                        ) : (
                          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          className="gap-1.5"
                          onClick={(event) => {
                            event.stopPropagation();
                            openDetail(item);
                          }}
                        >
                          View Details
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
                Page {currentPage} of {totalPages} · {total} results
              </p>
              <PaginationBar currentPage={currentPage} totalPages={totalPages} onPageChange={setPage} />
            </div>
          </>
        )}
    </div>
  );
}
