import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, ChevronDown, Loader2, MessageSquareWarning } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import SupervisedReplacementPanel from '@/components/admin/SupervisedReplacementPanel';
import { normalizeAdminGenerationDetail } from '@/lib/admin-generations-api';
import {
  PHASE_ACTIONS,
  SupervisedRunsApiError,
  addSupervisedRunNote,
  failSupervisedRun,
  getSupervisedRun,
  rejectSupervisedRun,
  sameNames,
  sendSupervisedRun,
  startSupervisedRuns,
  type SupervisedPhase,
  type SupervisedRunDetail,
} from '@/lib/supervised-runs-api';
import { DetailContent } from '@/pages/AdminGenerationDetailPage';

const POLL_MS = 5000;
const POLL_LIMIT_MS = 2 * 60 * 1000;
const NOTE_MAX = 10000;

type ButtonAction = 'start' | 'send' | 'reject' | 'fail';
const BUTTON_LABELS: Record<ButtonAction, string> = { start: 'Start', send: 'Send', reject: 'Reject', fail: 'Fail' };
const BUTTON_ACTIONS = Object.keys(BUTTON_LABELS) as ButtonAction[];
const WORKING: SupervisedPhase[] = ['running', 'finalizing'];
const FINISHED: SupervisedPhase[] = ['delivered', 'failed'];

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
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

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="break-words text-sm">{value}</p>
    </div>
  );
}

function StateCard({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">{icon}</div>
        <div className="space-y-1">
          <h2 className="font-display text-2xl tracking-wide">{title}</h2>
          <p className="text-sm text-muted-foreground">{body}</p>
        </div>
      </CardContent>
    </Card>
  );
}

const EVENT_TIME_KEYS = ['at', 'time', 'timestamp', 'created_at', 'ts'];
const EVENT_LABEL_KEYS = ['type', 'event', 'phase'];

function describeEvent(event: Record<string, unknown>) {
  const timeKey = EVENT_TIME_KEYS.find((key) => typeof event[key] === 'string');
  const labels = EVENT_LABEL_KEYS
    .filter((key) => typeof event[key] === 'string' && event[key])
    .map((key) => String(event[key]));
  const rest = Object.fromEntries(
    Object.entries(event).filter(([key]) => key !== timeKey && !EVENT_LABEL_KEYS.includes(key)),
  );
  return {
    time: timeKey ? formatDateTime(event[timeKey] as string) : '-',
    label: labels.join(' / '),
    rest: Object.keys(rest).length > 0 ? JSON.stringify(rest) : '',
  };
}

function EventsList({ events }: { events: Array<Record<string, unknown>> }) {
  const [open, setOpen] = useState(false);
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No events yet.</p>;
  }
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 px-4">
          Events ({events.length})
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-3 space-y-2">
          {events.map((event, index) => {
            const { time, label, rest } = describeEvent(event);
            return (
              <li key={index} className="min-w-0 border border-border p-3 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-xs text-muted-foreground">{time}</span>
                  {label && <span className="font-medium">{label}</span>}
                </div>
                {rest && (
                  <p className="mt-1 font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">{rest}</p>
                )}
              </li>
            );
          })}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

function SupervisionCard({ data }: { data: SupervisedRunDetail }) {
  const s = data.supervision;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-2xl tracking-wide">Supervision</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <PhaseBadge phase={s.phase} />
          <span className="text-sm">Attempt {s.attempt}</span>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <MetaItem label="Attempt Started" value={formatDateTime(s.attempt_started_at)} />
          {s.decision && <MetaItem label="Decision" value={s.decision} />}
          {s.decision && <MetaItem label="Decided By" value={s.decided_by_email || '-'} />}
          {s.decision && <MetaItem label="Decided At" value={formatDateTime(s.decided_at)} />}
        </div>
        {s.last_error && (
          <div className="min-w-0 space-y-2">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Last Error · {formatDateTime(s.last_error_at)}
            </p>
            <pre className="max-h-96 max-w-full overflow-y-auto whitespace-pre-wrap break-words border border-border bg-muted/40 p-3 font-mono text-xs [overflow-wrap:anywhere]">
              {s.last_error}
            </pre>
          </div>
        )}
        <EventsList events={s.events ?? []} />
      </CardContent>
    </Card>
  );
}

function NotesCard({ data, workflowId, onSaved }: { data: SupervisedRunDetail; workflowId: string; onSaved: () => void }) {
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  async function save() {
    if (!body.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await addSupervisedRunNote(workflowId, body);
      if (!mounted.current) return;
      setBody('');
      onSaved();
    } catch (err) {
      if (!mounted.current) return;
      const code = err instanceof SupervisedRunsApiError ? err.code : 'request_failed';
      setError(code === 'bad_note' ? "That note can't be saved (1 to 10,000 characters)." : code);
    } finally {
      if (mounted.current) setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-2xl tracking-wide">Notes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        ) : (
          <ul className="space-y-3">
            {data.notes.map((note) => (
              <li key={note.id} className="min-w-0 border border-border p-3">
                <p className="flex flex-wrap gap-x-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  <span className="break-all normal-case">{note.author_email}</span>
                  <span>{formatDateTime(note.created_at)}</span>
                </p>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{note.body}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-2">
          <Textarea
            aria-label="New note"
            value={body}
            maxLength={NOTE_MAX}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write a note..."
            className="min-h-24"
          />
          <p className="text-xs text-muted-foreground">Notes can't be edited or deleted.</p>
          {error && <p className="break-words text-sm text-destructive" role="alert">{error}</p>}
          <Button className="px-4" disabled={!body.trim() || saving} onClick={() => void save()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add note
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminCadQueueDetailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { workflowId = '' } = useParams<{ workflowId: string }>();
  const backTarget = `/admin/cad-queue${location.search || ''}`;

  // While an accepted action waits for the run to move, poll; the phase at press time is the baseline.
  const [waitingFrom, setWaitingFrom] = useState<SupervisedPhase | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [failOpen, setFailOpen] = useState(false);
  const [ticked, setTicked] = useState<string[]>([]);

  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  // Synchronous lock: held from the press until the request fails, or, once accepted, until the
  // phase moves or the 2-minute wait ends. State alone lets a second same-tick click through.
  const locked = useRef(false);

  const query = useQuery({
    queryKey: ['admin-cad-queue-run', workflowId],
    queryFn: () => getSupervisedRun(workflowId),
    enabled: Boolean(workflowId),
    retry: false,
    refetchInterval: waitingFrom ? POLL_MS : false,
  });

  const data = query.data;
  const phase = data?.supervision.phase;
  const runDetail = useMemo(
    () => (data ? normalizeAdminGenerationDetail(data.run, workflowId) : null),
    [data, workflowId],
  );

  useEffect(() => {
    if (waitingFrom && phase && phase !== waitingFrom) {
      locked.current = false;
      setWaitingFrom(null);
      setMessage(null);
    }
  }, [waitingFrom, phase]);

  useEffect(() => {
    if (!waitingFrom) return;
    const timer = setTimeout(() => {
      locked.current = false;
      setWaitingFrom(null);
      setMessage(`Still ${phaseLabel(waitingFrom)}. Refresh to check again.`);
    }, POLL_LIMIT_MS);
    return () => clearTimeout(timer);
  }, [waitingFrom]);

  async function handleCode(code: string, detail: Record<string, unknown> = {}) {
    if (code === 'invalid_phase') {
      const fresh = await query.refetch();
      if (!mounted.current) return;
      const now = typeof detail.phase === 'string' ? detail.phase : fresh.data?.supervision.phase ?? 'changed';
      setMessage(`This run is now ${phaseLabel(now)}.`);
    } else if (code === 'signal_failed') {
      setMessage('Nothing happened. Press again.');
    } else if (code === 'acknowledgement_mismatch') {
      setMessage("The missing list changed. Check it again.");
      void query.refetch();
    } else if (code === 'no_model') {
      setMessage('There is no model to send.');
    } else {
      setMessage(code);
    }
  }

  async function run(action: () => Promise<{ accepted: boolean; code?: string }>) {
    if (!phase || locked.current) return;
    locked.current = true;
    let accepted = false;
    const from = phase;
    setBusy(true);
    setMessage(null);
    setWaitingFrom(null);
    try {
      const result = await action();
      if (!mounted.current) return;
      if (result.accepted) {
        accepted = true;
        setMessage('Done. Waiting for the run to move...');
        setWaitingFrom(from);
        void query.refetch();
      } else {
        await handleCode(result.code || 'not_accepted');
      }
    } catch (err) {
      if (!mounted.current) return;
      if (err instanceof SupervisedRunsApiError) await handleCode(err.code, err.detail);
      else setMessage(err instanceof Error && err.message ? err.message : 'request_failed');
    } finally {
      if (!accepted) locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const start = () => run(async () => {
    const results = await startSupervisedRuns([workflowId]);
    const mine = results.find((r) => r.workflow_id === workflowId) ?? results[0];
    if (!mine) return { accepted: false, code: 'not_found' };
    return 'code' in mine && !mine.accepted ? { accepted: false, code: mine.code } : { accepted: Boolean(mine.accepted) };
  });
  const reject = () => run(() => rejectSupervisedRun(workflowId));
  const fail = () => run(() => failSupervisedRun(workflowId));
  const send = () => {
    setSendOpen(false);
    void run(() => sendSupervisedRun(workflowId, ticked));
  };

  function openSend() {
    setTicked([]);
    setSendOpen(true);
  }

  function toggleTick(name: string, checked: boolean) {
    setTicked((prev) => (checked ? [...prev.filter((n) => n !== name), name] : prev.filter((n) => n !== name)));
  }

  const error = query.error instanceof SupervisedRunsApiError ? query.error : null;
  const allowed = phase ? BUTTON_ACTIONS.filter((a) => PHASE_ACTIONS[phase].includes(a)) : [];
  const missing = data?.send_check?.missing ?? [];
  const noModel = data?.send_check?.has_model === false;
  const actionsLocked = busy || waitingFrom !== null;
  const canSend = !noModel && sameNames(ticked, missing) && !actionsLocked;
  const onPress: Record<ButtonAction, () => void> = {
    start: () => void start(),
    send: openSend,
    reject: () => void reject(),
    fail: () => setFailOpen(true),
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate(backTarget)}>
            <ArrowLeft className="h-4 w-4" />
            Back to CAD Queue
          </Button>
        </div>

        {query.isLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ) : error?.status === 401 || error?.status === 403 ? (
          <StateCard
            icon={<AlertTriangle className="h-6 w-6 text-muted-foreground" />}
            title="Not Authorized"
            body="Your account is authenticated, but the backend did not authorize access to this run."
          />
        ) : error?.status === 404 ? (
          <StateCard
            icon={<MessageSquareWarning className="h-6 w-6 text-muted-foreground" />}
            title="Run Not Found"
            body="This run is not in the CAD queue."
          />
        ) : query.error ? (
          <Card>
            <CardContent className="flex items-center justify-center px-6 py-16 text-center">
              <p className="break-words text-sm text-muted-foreground">
                Failed to load the run{error ? ` (${error.code})` : ''}.
              </p>
            </CardContent>
          </Card>
        ) : data && phase ? (
          <div className="min-w-0 space-y-6">
            <div className="min-w-0 space-y-1">
              <h1 className="font-display text-3xl tracking-wide">
                {runDetail?.workflow_name || 'CAD Queue Run'}
              </h1>
              <p className="break-all font-mono text-xs text-muted-foreground">{workflowId}</p>
            </div>

            <SupervisionCard data={data} />

            <Card>
              <CardContent className="space-y-3 pt-6">
                {WORKING.includes(phase) ? (
                  <p className="text-sm text-muted-foreground">Working: no actions until this finishes.</p>
                ) : FINISHED.includes(phase) ? (
                  <p className="text-sm text-muted-foreground">Finished.</p>
                ) : allowed.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
                    {allowed.map((action) => (
                      <Button
                        key={action}
                        variant={action === 'fail' ? 'destructive' : action === 'reject' ? 'outline' : 'default'}
                        className="h-10 w-full px-4 sm:w-28"
                        disabled={actionsLocked}
                        onClick={onPress[action]}
                      >
                        {BUTTON_LABELS[action]}
                      </Button>
                    ))}
                  </div>
                ) : null}
                {message && phase !== 'rejected' && (
                  <p className="break-words text-sm" aria-live="polite">{message}</p>
                )}
              </CardContent>
            </Card>

            {phase === 'rejected' && (
              <SupervisedReplacementPanel
                detail={data}
                workflowId={workflowId}
                onChanged={() => void query.refetch()}
                runAction={run}
                locked={actionsLocked}
                message={message}
              />
            )}

            <NotesCard data={data} workflowId={workflowId} onSaved={() => void query.refetch()} />

            <section className="min-w-0 space-y-4">
              <h2 className="font-display text-2xl tracking-wide">The run</h2>
              {runDetail && <DetailContent detail={runDetail} />}
            </section>

            <Dialog open={sendOpen} onOpenChange={setSendOpen}>
              <DialogContent className="w-[calc(100%-2rem)] max-w-lg">
                <DialogHeader>
                  <DialogTitle>Send this run?</DialogTitle>
                  <DialogDescription>
                    {noModel
                      ? 'There is no model to send.'
                      : missing.length === 0
                        ? 'Nothing is missing.'
                        : "Without these files the user can't improve this model later. Tick each one to confirm."}
                  </DialogDescription>
                </DialogHeader>
                {!noModel && missing.length > 0 && (
                  <ul className="space-y-2">
                    {missing.map((name) => {
                      const id = `missing-${name}`;
                      return (
                        <li key={name} className="flex min-w-0 items-center gap-3">
                          <Checkbox
                            id={id}
                            checked={ticked.includes(name)}
                            onCheckedChange={(checked) => toggleTick(name, checked === true)}
                          />
                          <label htmlFor={id} className="break-all font-mono text-sm">{name}</label>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="outline" className="px-4 sm:w-28" onClick={() => setSendOpen(false)}>
                    Cancel
                  </Button>
                  <Button className="px-4 sm:w-28" disabled={!canSend} onClick={send}>
                    Send
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <AlertDialog open={failOpen} onOpenChange={setFailOpen}>
              <AlertDialogContent className="w-[calc(100%-2rem)] max-w-lg">
                <AlertDialogHeader>
                  <AlertDialogTitle>Fail this run?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Refunds every credit. The user gets no email. This can't be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="px-4 sm:w-28">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={actionsLocked}
                    className="bg-destructive px-4 text-destructive-foreground hover:bg-destructive/90 sm:w-28"
                    onClick={() => void fail()}
                  >
                    Fail run
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : (
          <StateCard
            icon={<MessageSquareWarning className="h-6 w-6 text-muted-foreground" />}
            title="Run Not Found"
            body="This run is not in the CAD queue."
          />
        )}
      </div>
    </div>
  );
}
