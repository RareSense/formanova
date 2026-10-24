import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { normalizeAdminGenerationDetail } from '@/lib/admin-generations-api';
import {
  MAX_SINGLE_PUT_BYTES,
  SupervisedRunsApiError,
  UPLOAD_ROLES,
  removeSupervisedUpload,
  sameNames,
  sendSupervisedReplacement,
  uploadReplacementFile,
  type SupervisedRunDetail,
  type SupervisedUpload,
  type UploadRole,
  type UploadRoleSpec,
} from '@/lib/supervised-runs-api';

const JEWELRY_TYPES = ['ring', 'necklace', 'bracelet', 'earring', 'other'];
const GLB_HINT = "Must differ from the pipeline's model. An identical GLB saves nothing and the user gets no model; use Send instead.";

export type ActionResult = { accepted: boolean; code?: string };
export type ActionRunner = (action: () => Promise<ActionResult>) => Promise<void> | void;

interface Props {
  detail: SupervisedRunDetail;
  workflowId: string;
  /** Refresh the run after an upload, a remove or a send. */
  onChanged: () => void;
  /**
   * The page's action runner (one in-flight lock for the whole page, and the wait for the phase to
   * move). Without it the panel sends on its own and calls onChanged.
   */
  runAction?: ActionRunner;
  /** True while the page holds its action lock. */
  locked?: boolean;
  /** The page's message for a Send replacement it ran, shown beside that button. */
  message?: string | null;
  /** Told whenever an upload or Remove starts or ends, so the page can hold Fail meanwhile. */
  onBusyChange?: (busy: boolean) => void;
}

type Transfer = { stage: 'uploading' | 'checking'; progress: number };

const KiB = 1024;
const MiB = 1024 * KiB;
const GiB = 1024 * MiB;

function formatBytes(bytes: number): string {
  const trim = (n: number) => String(Number(n.toFixed(1)));
  if (bytes >= GiB) return `${trim(bytes / GiB)} GiB`;
  if (bytes >= MiB) return `${trim(bytes / MiB)} MiB`;
  if (bytes >= KiB) return `${trim(bytes / KiB)} KiB`;
  return `${bytes} B`;
}

function uploadErrorCopy(err: unknown): string {
  if (!(err instanceof SupervisedRunsApiError)) {
    return err instanceof Error && err.message ? err.message : 'request_failed';
  }
  switch (err.code) {
    case 'upload_invalid':
      return `Refused: ${String(err.detail.reason ?? 'unknown')}. Upload it again.`;
    case 'bad_size':
      return `Wrong size (max ${String(err.detail.max_bytes ?? '?')} bytes).`;
    case 'role_not_allowed':
      return "This file type isn't allowed for this run.";
    case 'upload_not_pending':
      return 'This upload was already used. Choose the file again.';
    case 'upload_put_failed':
      return 'The upload to storage failed. Choose the file again.';
    case 'too_large_for_browser':
      return "Files over 256 MB aren't supported yet.";
    case 'invalid_phase':
      return 'This run is no longer rejected. Refresh the page.';
    case 'no_verified_upload':
      return 'That file was already removed. Refresh the page.';
    default:
      return err.code;
  }
}

function isVerified(upload: SupervisedUpload): boolean {
  return upload.status === 'verified' || Boolean(upload.verified_at);
}

interface RowProps {
  spec: UploadRoleSpec;
  upload: SupervisedUpload | undefined;
  downloadUrl: string | undefined;
  transfer: Transfer | undefined;
  error: string | undefined;
  removing: boolean;
  disabled: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
}

function RoleRow({ spec, upload, downloadUrl, transfer, error, removing, disabled, onPick, onRemove }: RowProps) {
  const input = useRef<HTMLInputElement>(null);
  const inputId = `replacement-${spec.role}`;
  const busy = Boolean(transfer) || removing;
  return (
    <li className="min-w-0 space-y-3 border border-border p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{spec.label}</span>
            {spec.required && <Badge variant="secondary">required</Badge>}
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            {spec.accept} · max {formatBytes(spec.maxBytes)}
          </p>
          {spec.role === 'glb' && (
            <p className="text-xs text-muted-foreground">{GLB_HINT}</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          <input
            ref={input}
            id={inputId}
            type="file"
            accept={spec.accept}
            aria-label={`${spec.label} file`}
            className="sr-only"
            tabIndex={-1}
            disabled={disabled || busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Clear so picking the same file again still fires change (a failed upload restarts here).
              event.target.value = '';
              if (file) onPick(file);
            }}
          />
          <Button
            variant="outline"
            className="h-10 w-full px-4 sm:w-32"
            disabled={disabled || busy}
            onClick={() => input.current?.click()}
          >
            {upload ? 'Replace file' : 'Choose file'}
          </Button>
          {upload && (
            <Button
              variant="outline"
              className="h-10 w-full px-4 sm:w-32"
              disabled={disabled || busy}
              onClick={onRemove}
            >
              {removing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remove
            </Button>
          )}
        </div>
      </div>
      {upload && (
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
          <span className="min-w-0 max-w-full truncate font-mono" title={upload.filename}>{upload.filename}</span>
          <span className="text-muted-foreground">{formatBytes(upload.bytes)}</span>
          <Badge variant="default">checked</Badge>
          {downloadUrl && (
            <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
              Download
            </a>
          )}
        </div>
      )}
      {transfer && (
        transfer.stage === 'uploading' ? (
          <div className="space-y-1">
            <Progress value={Math.round(transfer.progress * 100)} className="h-2" aria-label={`${spec.label} upload`} />
            <p className="text-xs text-muted-foreground">Uploading... {Math.round(transfer.progress * 100)}%</p>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Checking...
          </p>
        )
      )}
      {error && <p className="break-words text-sm text-destructive" role="alert">{error}</p>}
    </li>
  );
}

export default function SupervisedReplacementPanel({
  detail, workflowId, onChanged, runAction, locked = false, message, onBusyChange,
}: Props) {
  const [transfers, setTransfers] = useState<Partial<Record<UploadRole, Transfer>>>({});
  const [errors, setErrors] = useState<Partial<Record<UploadRole, string>>>({});
  const [removing, setRemoving] = useState<Partial<Record<UploadRole, boolean>>>({});
  const [ticked, setTicked] = useState<string[]>([]);
  const [jewelryType, setJewelryType] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [ownSending, setOwnSending] = useState(false);
  const [ownMessage, setOwnMessage] = useState<string | null>(null);
  // One upload at a time per role; state alone would let a same-tick second pick through.
  const inFlight = useRef(new Set<UploadRole>());
  const ownLock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const isGenerate = useMemo(
    () => normalizeAdminGenerationDetail(detail.run, workflowId).workflow_name === 'jewelry_cad_generate',
    [detail.run, workflowId],
  );
  const roles = UPLOAD_ROLES.filter((spec) => isGenerate || !spec.generateOnly);
  const check = detail.replacement_check;
  const hasModel = check?.has_model === true;
  const missing = check?.missing ?? [];
  const tickedNow = ticked.filter((name) => missing.includes(name));
  const needsType = missing.includes('jewelry_type');
  const fileBusy = Object.keys(transfers).length > 0 || Object.keys(removing).length > 0;
  const actionsLocked = locked || ownSending;

  // A tick only counts for the missing list it was made against: when a name leaves the list
  // (an upload filled it) it is dropped, so it comes back unticked if the list brings it back.
  const missingKey = missing.join('|');
  useEffect(() => {
    const current = missingKey ? missingKey.split('|') : [];
    setTicked((prev) => {
      const kept = prev.filter((name) => current.includes(name));
      return kept.length === prev.length ? prev : kept;
    });
    if (!current.includes('jewelry_type')) setJewelryType('');
  }, [missingKey]);

  const busyReport = useRef(onBusyChange);
  busyReport.current = onBusyChange;
  useEffect(() => { busyReport.current?.(fileBusy); }, [fileBusy]);
  useEffect(() => () => { busyReport.current?.(false); }, []);
  const canSend = hasModel
    && sameNames(tickedNow, missing)
    && (!needsType || Boolean(jewelryType))
    && !actionsLocked
    && !fileBusy;

  function setRole<T>(setter: (fn: (prev: Partial<Record<UploadRole, T>>) => Partial<Record<UploadRole, T>>) => void, role: UploadRole, value: T | undefined) {
    setter((prev) => {
      const next = { ...prev };
      if (value === undefined) delete next[role];
      else next[role] = value;
      return next;
    });
  }

  async function pick(spec: UploadRoleSpec, file: File) {
    if (inFlight.current.has(spec.role)) return;
    setRole(setErrors, spec.role, undefined);
    if (file.size > spec.maxBytes) {
      setRole(setErrors, spec.role, `Too big for this role (max ${formatBytes(spec.maxBytes)}).`);
      return;
    }
    if (file.size > MAX_SINGLE_PUT_BYTES) {
      setRole(setErrors, spec.role, "Files over 256 MB aren't supported yet.");
      return;
    }
    inFlight.current.add(spec.role);
    setRole<Transfer>(setTransfers, spec.role, { stage: 'uploading', progress: 0 });
    try {
      await uploadReplacementFile(workflowId, spec.role, file, {
        onProgress: (fraction) => {
          if (!mounted.current) return;
          setRole<Transfer>(setTransfers, spec.role, fraction >= 1
            ? { stage: 'checking', progress: 1 }
            : { stage: 'uploading', progress: fraction });
        },
      });
      if (!mounted.current) return;
      onChanged();
    } catch (err) {
      if (mounted.current) setRole(setErrors, spec.role, uploadErrorCopy(err));
    } finally {
      inFlight.current.delete(spec.role);
      if (mounted.current) setRole<Transfer>(setTransfers, spec.role, undefined);
    }
  }

  async function remove(role: UploadRole) {
    if (inFlight.current.has(role)) return;
    inFlight.current.add(role);
    setRole(setErrors, role, undefined);
    setRole(setRemoving, role, true);
    try {
      await removeSupervisedUpload(workflowId, role);
      if (mounted.current) onChanged();
    } catch (err) {
      if (mounted.current) setRole(setErrors, role, uploadErrorCopy(err));
    } finally {
      inFlight.current.delete(role);
      if (mounted.current) setRole(setRemoving, role, undefined);
    }
  }

  async function runOwn(action: () => Promise<ActionResult>) {
    if (ownLock.current) return;
    ownLock.current = true;
    setOwnSending(true);
    setOwnMessage(null);
    try {
      const result = await action();
      if (!mounted.current) return;
      if (result.accepted) onChanged();
      else setOwnMessage(result.code || 'not_accepted');
    } catch (err) {
      if (mounted.current) setOwnMessage(err instanceof SupervisedRunsApiError ? err.code : 'request_failed');
    } finally {
      ownLock.current = false;
      if (mounted.current) setOwnSending(false);
    }
  }

  function send() {
    if (!canSend) return;
    const ack = [...tickedNow];
    const type = needsType ? jewelryType : undefined;
    const action = () => sendSupervisedReplacement(workflowId, ack, type);
    void (runAction ? runAction(action) : runOwn(action));
  }

  function toggleTick(name: string, checked: boolean) {
    setTicked((prev) => (checked ? [...prev.filter((n) => n !== name), name] : prev.filter((n) => n !== name)));
  }

  const verified = new Map<UploadRole, SupervisedUpload>();
  for (const upload of detail.uploads ?? []) {
    if (isVerified(upload)) verified.set(upload.role, upload);
  }
  const shownMessage = message ?? ownMessage;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-2xl tracking-wide">Replacement</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <ul className="space-y-3">
          {roles.map((spec) => (
            <RoleRow
              key={spec.role}
              spec={spec}
              upload={verified.get(spec.role)}
              downloadUrl={detail.download_urls?.[spec.role]}
              transfer={transfers[spec.role]}
              error={errors[spec.role]}
              removing={Boolean(removing[spec.role])}
              disabled={actionsLocked}
              onPick={(file) => void pick(spec, file)}
              onRemove={() => void remove(spec.role)}
            />
          ))}
        </ul>

        <Collapsible open={previewOpen} onOpenChange={setPreviewOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 px-4">
              What will be sent
              <ChevronDown className={`h-4 w-4 transition-transform ${previewOpen ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="mt-3 max-h-96 max-w-full overflow-y-auto whitespace-pre-wrap break-words border border-border bg-muted/40 p-3 font-mono text-xs [overflow-wrap:anywhere]">
              {JSON.stringify(check?.final_preview ?? null, null, 2)}
            </pre>
          </CollapsibleContent>
        </Collapsible>

        {!hasModel ? (
          <p className="text-sm text-muted-foreground">Upload the GLB first.</p>
        ) : missing.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing is missing.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Without these files the user can't improve this model later. Tick each one to confirm.
            </p>
            <ul className="space-y-2">
              {missing.map((name) => {
                const id = `replacement-missing-${name}`;
                return (
                  <li key={name} className="flex min-w-0 items-center gap-3">
                    <Checkbox
                      id={id}
                      checked={tickedNow.includes(name)}
                      onCheckedChange={(checked) => toggleTick(name, checked === true)}
                    />
                    <label htmlFor={id} className="break-all font-mono text-sm">{name}</label>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {hasModel && needsType && (
          <div className="space-y-2">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Jewelry type</p>
            <Select value={jewelryType} onValueChange={setJewelryType}>
              <SelectTrigger aria-label="Jewelry type" className="w-full sm:w-56">
                <SelectValue placeholder="Choose a type" />
              </SelectTrigger>
              <SelectContent>
                {JEWELRY_TYPES.map((type) => (
                  <SelectItem key={type} value={type} className="capitalize">{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-3">
          <Button className="h-10 w-full px-4 sm:w-48" disabled={!canSend} onClick={send}>
            {ownSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send replacement
          </Button>
          {shownMessage && <p className="break-words text-sm" aria-live="polite">{shownMessage}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
