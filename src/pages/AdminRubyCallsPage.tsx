import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Play, RefreshCw, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listRubyCalls, matchesSearch, recordingBlob, type RubyCallRow } from '@/lib/ruby-call/admin-calls';
import { parseServerTime } from '@/lib/server-time';

/**
 * Every Ruby call, deal or not: who, how to reach them, how long, and how it ended. Click a call for
 * the lead, the quote, what they shared, the transcript and the recording. Everything from a call is
 * shown as plain text (React text nodes), never as HTML.
 */
const WIDE = 'hidden md:table-cell';

const when = (iso: string) => {
  const d = /[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? new Date(iso) : parseServerTime(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

export const clock = (seconds: number | null) =>
  seconds === null ? '-' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

const OUTCOME_STYLE: Record<RubyCallRow['outcome'], string> = {
  Deal: 'bg-[hsl(var(--formanova-hero-accent))]/15 text-foreground',
  Quoted: 'bg-muted text-foreground',
  'No deal': 'text-muted-foreground',
};

export default function AdminRubyCallsPage() {
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const calls = useQuery({ queryKey: ['admin-ruby-calls'], queryFn: listRubyCalls });

  const rows = useMemo(() => (calls.data ?? []).filter((r) => matchesSearch(r, query)), [calls.data, query]);
  const open = rows.find((r) => r.workflowId === openId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Ruby calls</h2>
          <p className="text-sm text-muted-foreground">Every sales call, with or without a deal. Newest first.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void calls.refetch()} disabled={calls.isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${calls.isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search calls"
          placeholder="Search by name, email, brand or phone"
          className="pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {calls.isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading calls…
        </p>
      )}
      {calls.isError && (
        <p role="alert" className="border border-border bg-muted px-3 py-2 text-sm">
          The calls could not be loaded. Try Refresh.
        </p>
      )}

      {calls.data && (
        <div className="border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className={WIDE}>Contact</TableHead>
                <TableHead>Length</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead className={WIDE}>Recording</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-muted-foreground">
                    {query ? 'No call matches that search.' : 'No calls yet.'}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow
                  key={r.workflowId}
                  className="cursor-pointer"
                  data-state={r.workflowId === openId ? 'selected' : undefined}
                  onClick={() => setOpenId(r.workflowId === openId ? null : r.workflowId)}
                >
                  <TableCell className="whitespace-nowrap text-sm">{when(r.startedAt)}</TableCell>
                  <TableCell className="min-w-0">
                    <div className="font-medium">{r.name || 'Unknown'}</div>
                    <div className="break-all text-xs text-muted-foreground">{r.email}</div>
                  </TableCell>
                  <TableCell className={`${WIDE} break-all text-sm`}>{r.contact || '-'}</TableCell>
                  <TableCell className="text-sm tabular-nums">{clock(r.durationSeconds)}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-0.5 text-xs ${OUTCOME_STYLE[r.outcome]}`}>{r.outcome}</span>
                  </TableCell>
                  <TableCell className={`${WIDE} text-sm`}>{r.recording ? 'Yes' : 'No'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {open && <CallDetail key={open.workflowId} call={open} />}
    </div>
  );
}

function CallDetail({ call }: { call: RubyCallRow }) {
  const leadRows = Object.entries(call.lead);
  return (
    <section className="space-y-5 border border-border bg-card p-4 sm:p-6" aria-label="Call details">
      <div>
        <h3 className="text-base font-semibold">{call.name || 'Unknown caller'}</h3>
        <p className="break-all text-sm text-muted-foreground">
          {when(call.startedAt)} · {clock(call.durationSeconds)} · {call.outcome} · account {call.accountEmail}
        </p>
      </div>

      <Recording call={call} />

      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <h4 className="mb-2 text-sm font-semibold">Lead</h4>
          {leadRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing saved.</p>
          ) : (
            <dl className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
              {leadRows.map(([key, value]) => (
                <div key={key} className="contents">
                  <dt className="break-words text-muted-foreground">{key.replace(/_/g, ' ')}</dt>
                  <dd className="min-w-0 break-words">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <div className="space-y-4 text-sm">
          <div>
            <h4 className="mb-1 font-semibold">Deal</h4>
            {call.payment ? (
              <p className="break-words">Payment link made · {String(call.payment.total ?? '')}</p>
            ) : call.quote ? (
              <p className="break-words">Quoted {String(call.quote.total ?? '')}, no payment link yet</p>
            ) : (
              <p className="text-muted-foreground">No quote on this call.</p>
            )}
          </div>
          <div>
            <h4 className="mb-1 font-semibold">Shared</h4>
            <p>{call.uploads} uploaded file(s)</p>
            {call.links.map((l) => (
              <p key={l} className="break-all">
                {l}
              </p>
            ))}
          </div>
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold">Transcript</h4>
        <div className="max-h-[28rem] space-y-1.5 overflow-y-auto text-sm">
          {call.turns.length === 0 && <p className="text-muted-foreground">No transcript.</p>}
          {call.turns.map((t, i) => (
            <p key={i} className="break-words">
              <span className="font-medium">{t.role === 'ruby' ? 'Ruby' : 'Client'}: </span>
              {t.text}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Fetched only when asked, with the admin's token (a plain audio src cannot send it), then played from a blob. */
function Recording({ call }: { call: RubyCallRow }) {
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  if (!call.recording) return <p className="text-sm text-muted-foreground">No recording for this call.</p>;
  if (url) return <audio controls autoPlay src={url} className="w-full" />;
  const recording = call.recording;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        size="sm"
        disabled={state === 'loading'}
        onClick={async () => {
          setState('loading');
          try {
            setUrl(URL.createObjectURL(await recordingBlob(recording)));
            setState('idle');
          } catch {
            setState('error');
          }
        }}
      >
        {state === 'loading' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
        Play recording
      </Button>
      {state === 'loading' && <span className="text-xs text-muted-foreground">Downloading the whole call first…</span>}
      {state === 'error' && (
        <span role="alert" className="text-xs text-destructive">
          The recording could not be loaded. Try again.
        </span>
      )}
    </div>
  );
}
