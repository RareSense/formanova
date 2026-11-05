import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, ExternalLink, Loader2, Play, RefreshCw, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  fileBlob,
  listRubyCalls,
  matchesSearch,
  recordingBlob,
  type AdminUpload,
  type RubyCallRow,
} from '@/lib/ruby-call/admin-calls';
import { parseServerTime } from '@/lib/server-time';

/**
 * Every Ruby call, deal or not. The list says who, how to reach them, how long and how it ended; a call
 * opens on its own view (?call=<id>, so it can be linked and Back works) with the recording to play or
 * download, the conversation, what the client submitted and the brief. Everything that came from a call
 * is shown as plain text (React text nodes), never as HTML; only http(s) links become links.
 */
const WIDE = 'hidden md:table-cell';
const CARD = 'border border-border bg-card';

const asDate = (iso: string) => (/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? new Date(iso) : parseServerTime(iso));
const when = (iso: string) => {
  const d = asDate(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

export const clock = (seconds: number | null) =>
  seconds === null ? '-' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

const OUTCOME_STYLE: Record<RubyCallRow['outcome'], string> = {
  Paid: 'bg-[hsl(var(--formanova-hero-accent)/0.3)] font-semibold text-foreground',
  Deal: 'bg-[hsl(var(--formanova-hero-accent)/0.15)] text-foreground',
  Quoted: 'bg-muted text-foreground',
  'No deal': 'text-muted-foreground',
};

export default function AdminRubyCallsPage() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const calls = useQuery({ queryKey: ['admin-ruby-calls'], queryFn: listRubyCalls });
  const openId = params.get('call');
  const open = (calls.data ?? []).find((r) => r.workflowId === openId) ?? null;
  const rows = useMemo(() => (calls.data ?? []).filter((r) => matchesSearch(r, query)), [calls.data, query]);

  const show = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('call', id);
    else next.delete('call');
    setParams(next);
  };

  if (open) return <CallView call={open} onBack={() => show(null)} />;

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 md:px-8">
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
      {openId && calls.data && !open && (
        <p className="border border-border bg-muted px-3 py-2 text-sm">That call is not in the latest list.</p>
      )}

      {calls.data && (
        <div className={CARD}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className={WIDE}>Contact</TableHead>
                <TableHead>Length</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead className={WIDE}>Recording</TableHead>
                <TableHead className={WIDE}>Shared</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-sm text-muted-foreground">
                    {query ? 'No call matches that search.' : 'No calls yet.'}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.workflowId} className="cursor-pointer" onClick={() => show(r.workflowId)}>
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
                  <TableCell className={`${WIDE} text-sm`}>
                    {r.uploads + r.links.length ? `${r.uploads} file(s), ${r.links.length} link(s)` : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function CallView({ call, onBack }: { call: RubyCallRow; onBack(): void }) {
  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 md:px-8">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
        <ArrowLeft className="mr-2 h-4 w-4" /> All calls
      </Button>

      <section className={`${CARD} space-y-4 p-4 sm:p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold">{call.name || 'Unknown caller'}</h2>
            <p className="break-all text-sm text-muted-foreground">
              {[call.email, call.contact].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="text-right text-sm">
            <span className={`px-2 py-0.5 text-xs ${OUTCOME_STYLE[call.outcome]}`}>{call.outcome}</span>
            <p className="mt-1 text-muted-foreground">
              {when(call.startedAt)} · {clock(call.durationSeconds)}
            </p>
          </div>
        </div>
        <Recording call={call} />
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className={`${CARD} min-w-0 p-4 sm:p-5`}>
          <h3 className="mb-3 text-sm font-semibold">Conversation · {call.turns.length} turns</h3>
          {call.turns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transcript.</p>
          ) : (
            <ul aria-label="Transcript" className="max-h-[70vh] space-y-2.5 overflow-y-auto pr-1">
              {call.turns.map((t, i) => (
                <li key={i} className={`flex ${t.role === 'client' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] px-3 py-2 text-sm ${
                      t.role === 'client' ? 'bg-[hsl(var(--formanova-hero-accent)/0.12)]' : 'bg-muted'
                    }`}
                  >
                    <p className="mb-0.5 text-[11px] font-medium text-muted-foreground">
                      {t.role === 'ruby' ? 'Ruby' : 'Client'}
                      {typeof t.start_ms === 'number' && <span className="ml-2 tabular-nums">{clock(Math.floor(t.start_ms / 1000))}</span>}
                    </p>
                    <p className="whitespace-pre-wrap break-words">{t.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="min-w-0 space-y-4">
          <Submissions call={call} />
          <Brief lead={call.lead} />
          <Deal call={call} />
        </div>
      </div>
    </div>
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
  const recording = call.recording;
  const fileName = `ruby-call-${call.startedAt.slice(0, 10)}-${(call.name || 'caller').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.webm`;
  if (url)
    return (
      <div className="flex flex-wrap items-center gap-3">
        <audio controls autoPlay src={url} className="min-w-0 flex-1" />
        <a href={url} download={fileName} className="inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline">
          <Download className="h-4 w-4" /> Download
        </a>
      </div>
    );
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

const PURPOSE: Record<string, string> = {
  jewelry_photos: 'Jewelry photo',
  references: 'Reference',
  cad_files: 'CAD file',
  other: 'Other',
};

function Submissions({ call }: { call: RubyCallRow }) {
  const empty = call.uploadList.length === 0 && call.links.length === 0;
  return (
    <section aria-label="Submissions" className={`${CARD} p-4 sm:p-5`}>
      <h3 className="mb-3 text-sm font-semibold">Submissions</h3>
      {empty && <p className="text-sm text-muted-foreground">Nothing was uploaded or shared on this call.</p>}
      {call.uploadList.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {call.uploadList.map((u, i) => (
            <li key={`${u.sha ?? u.name}-${i}`} className="min-w-0">
              <Thumb upload={u} />
              <p className="mt-1 truncate text-xs font-medium">{u.name}</p>
              <p className="text-[11px] text-muted-foreground">{PURPOSE[u.purpose] ?? u.purpose}</p>
            </li>
          ))}
        </ul>
      )}
      {call.links.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-sm">
          {call.links.map((l) => (
            <li key={l} className="flex min-w-0 items-start gap-1.5">
              <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <a href={l} target="_blank" rel="noopener noreferrer" className="min-w-0 break-all underline-offset-4 hover:underline">
                {l}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The uploaded image itself, fetched with the admin's token; click opens it full size. */
function Thumb({ upload }: { upload: AdminUpload }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!upload.sha) return;
    let live = true;
    let made: string | null = null;
    fileBlob(upload.sha)
      .then((blob) => {
        made = URL.createObjectURL(blob);
        if (live) setUrl(made);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [upload.sha]);

  const box = 'flex aspect-square w-full items-center justify-center overflow-hidden border border-border bg-muted text-[11px] text-muted-foreground';
  if (!upload.sha || failed) return <div className={box}>No preview</div>;
  if (!url)
    return (
      <div className={box}>
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      </div>
    );
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={box}>
      <img src={url} alt={upload.name} className="h-full w-full object-cover" />
    </a>
  );
}

const GROUPS: { title: string; keys: string[] }[] = [
  { title: 'Contact', keys: ['name', 'email', 'phone', 'instagram', 'contact_preference'] },
  { title: 'Project', keys: ['brand', 'sells', 'store_url', 'channels', 'shopify', 'project', 'pieces', 'images', 'image_types', 'deadline', 'budget'] },
  {
    title: 'Specs',
    keys: ['resolution', 'aspect_ratios', 'style', 'references', 'models_source', 'model_looks', 'photo_source', 'photos_link', 'data_ready', 'data_sorted', 'needs_curation', 'photo_quality_notes'],
  },
];

const label = (key: string) => key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

function Brief({ lead }: { lead: Record<string, string> }) {
  const known = new Set(GROUPS.flatMap((g) => g.keys));
  const rest = Object.keys(lead).filter((k) => !known.has(k));
  const groups = [...GROUPS, { title: 'Notes', keys: rest }].filter((g) => g.keys.some((k) => lead[k]));
  return (
    <section aria-label="Brief" className={`${CARD} p-4 sm:p-5`}>
      <h3 className="mb-3 text-sm font-semibold">Brief</h3>
      {groups.length === 0 && <p className="text-sm text-muted-foreground">Nothing saved.</p>}
      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g.title}>
            <h4 className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{g.title}</h4>
            <dl className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
              {g.keys
                .filter((k) => lead[k])
                .map((k) => (
                  <div key={k} className="contents">
                    <dt className="break-words text-muted-foreground">{label(k)}</dt>
                    <dd className="min-w-0 whitespace-pre-wrap break-words">{lead[k]}</dd>
                  </div>
                ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}

function Deal({ call }: { call: RubyCallRow }) {
  return (
    <section aria-label="Deal" className={`${CARD} p-4 text-sm sm:p-5`}>
      <h3 className="mb-2 font-semibold">Deal</h3>
      {call.payment ? (
        <p className="break-words">
          {call.payment.status === 'paid'
            ? `Paid during the call${call.payment.paidAt ? ` (${when(String(call.payment.paidAt))})` : ''} · ${String(call.payment.total ?? '')}`
            : call.payment.simulated
              ? `Test link only (no real payment yet) · ${String(call.payment.total ?? '')}`
              : `Payment link sent, waiting for payment · ${String(call.payment.total ?? '')}`}
        </p>
      ) : call.quote ? (
        <p className="break-words">Last quote {String(call.quote.total ?? '')}, no payment link yet</p>
      ) : (
        <p className="text-muted-foreground">No quote on this call.</p>
      )}
    </section>
  );
}
