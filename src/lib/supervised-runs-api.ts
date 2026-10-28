/**
 * supervised-runs-api.ts
 *
 * The admin queue for supervised CAD runs (backend handoff 2026-10-24). A submitted CAD generate or
 * improve waits here until an admin starts it, then an admin sends it, rejects it and sends a
 * hand-made replacement, or fails it with a full refund.
 *
 *   GET    /api/admin/supervised-runs?phase=..        -> queue list
 *   GET    /api/admin/supervised-runs/{id}            -> one run, its checks, uploads and notes
 *   POST   /api/admin/supervised-runs/start           -> start 1..50 runs
 *   POST   /api/admin/supervised-runs/{id}/send|reject|fail|notes|send-replacement
 *          (send, fail and send-replacement take an optional user_note: the note the user reads
 *           with their result, saved only when the press is accepted, final after that)
 *   POST   /api/admin/supervised-runs/{id}/uploads    -> a one-time Azure upload link
 *   POST   /api/admin/supervised-runs/{id}/uploads/{upload_id}/complete
 *   DELETE /api/admin/supervised-runs/{id}/uploads/{role}
 *
 * Errors come back as {"detail": {"code": ...}}.
 */
import { authenticatedFetch } from '@/lib/authenticated-fetch';

const BASE = '/api/admin/supervised-runs';

export type SupervisedPhase =
  | 'queued' | 'running' | 'errored' | 'awaiting_review' | 'rejected' | 'finalizing' | 'delivered' | 'failed';
export type SupervisedAction = 'start' | 'send' | 'reject' | 'fail' | 'upload' | 'send_replacement';

/** What each phase allows (handoff section 7). Anything else is refused with invalid_phase. */
export const PHASE_ACTIONS: Record<SupervisedPhase, SupervisedAction[]> = {
  queued: ['start', 'reject', 'fail'],
  errored: ['start', 'reject', 'fail'],
  awaiting_review: ['send', 'reject', 'fail'],
  rejected: ['upload', 'send_replacement', 'fail'],
  running: [],
  finalizing: [],
  delivered: [],
  failed: [],
};

export interface SupervisedRunListItem {
  workflow_id: string;
  workflow_name: string;
  phase: SupervisedPhase;
  attempt: number;
  created_at: string;
  updated_at: string;
  user_email: string;
  is_paying: boolean;
  last_error: string | null;
  decision: string | null;
  note_count: number;
  /** The note sent to the user with the decision; absent from older backends. */
  user_note?: string | null;
}

export interface SupervisedUpload {
  upload_id: string;
  role: UploadRole;
  filename: string;
  status: string;
  bytes: number;
  sha256: string | null;
  uploaded_by_email: string | null;
  created_at: string;
  verified_at: string | null;
}

export interface SupervisedNote {
  id: string;
  author_email: string;
  body: string;
  created_at: string;
}

export interface SupervisedRunDetail {
  /** Exactly the body of GET /admin/generations/{id}. */
  run: unknown;
  supervision: {
    phase: SupervisedPhase;
    attempt: number;
    attempt_started_at: string | null;
    last_error: string | null;
    last_error_at: string | null;
    decision: string | null;
    /** The admin's note to the user, saved with the decision; null for none. Final once set. */
    user_note?: string | null;
    decided_by_email: string | null;
    decided_at: string | null;
    acknowledged_missing: string[] | null;
    delivery: unknown;
    events: Array<Record<string, unknown>>;
    /** The AI each step uses now; null is the CAD toolkit's default. */
    tiers?: { llm_tier: string | null; analysis_tier: string | null };
  };
  send_check: {
    has_model: boolean;
    missing: string[];
    glb_url?: string | null;
    threedm_url?: string | null;
  } | null;
  replacement_check: { has_model: boolean; missing: string[]; final_preview: unknown } | null;
  uploads: SupervisedUpload[];
  notes: SupervisedNote[];
  download_urls: Record<string, string>;
}

export type StartResult =
  | { workflow_id: string; accepted: true }
  | { workflow_id: string; accepted: false; code: 'not_found' | 'invalid_phase' | 'signal_failed' | string };

export type UploadRole =
  | 'glb' | 'threedm' | 'viewer_threedm' | 'code' | 'loop_state' | 'thumbnail' | 'design_contract'
  | 'reference_manifest' | 'stl' | 'step' | 'casting_stl' | 'stones';

export interface UploadRoleSpec {
  role: UploadRole;
  label: string;
  accept: string;
  maxBytes: number;
  required?: boolean;
  /** Only for jewelry_cad_generate runs. */
  generateOnly?: boolean;
}

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;

/** Handoff section 8, in its order. */
export const UPLOAD_ROLES: UploadRoleSpec[] = [
  { role: 'glb', label: 'GLB model', accept: '.glb', maxBytes: GiB, required: true },
  { role: 'threedm', label: 'Rhino 3DM', accept: '.3dm', maxBytes: GiB },
  { role: 'viewer_threedm', label: 'Viewer 3DM (mesh only)', accept: '.3dm', maxBytes: GiB },
  { role: 'code', label: 'CAD code', accept: '.py', maxBytes: 50 * MiB },
  { role: 'loop_state', label: 'Loop state', accept: '.json', maxBytes: 50 * MiB },
  { role: 'thumbnail', label: 'Thumbnail', accept: '.png', maxBytes: 50 * MiB },
  { role: 'design_contract', label: 'Design contract', accept: '.json', maxBytes: 50 * MiB, generateOnly: true },
  { role: 'reference_manifest', label: 'Reference manifest', accept: '.json', maxBytes: 50 * MiB, generateOnly: true },
  { role: 'stl', label: 'Full model STL', accept: '.stl', maxBytes: GiB },
  { role: 'step', label: 'Full model STEP', accept: '.step', maxBytes: GiB },
  { role: 'casting_stl', label: 'Casting STL', accept: '.stl', maxBytes: GiB },
  { role: 'stones', label: 'Stone list', accept: '.json', maxBytes: 10 * MiB },
];

export class SupervisedRunsApiError extends Error {
  status: number;
  code: string;
  detail: Record<string, unknown>;

  constructor(status: number, code: string, detail: Record<string, unknown>) {
    super(code);
    this.name = 'SupervisedRunsApiError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

const STATUS_WORDS: Record<SupervisedPhase, string> = {
  queued: 'Queued',
  running: 'Running',
  finalizing: 'Finishing',
  errored: 'Errored',
  awaiting_review: 'Needs review',
  rejected: 'Rejected',
  delivered: 'Delivered',
  failed: 'Failed',
};

/** A run's status in plain words; the attempt shows once it is a retry, and always on an error. */
export function supervisedStatusLabel(phase: SupervisedPhase, attempt: number): string {
  const word = STATUS_WORDS[phase] ?? String(phase).replace(/_/g, ' ');
  return phase === 'errored' || attempt > 1 ? `${word} (attempt ${attempt})` : word;
}

/** "Generate" / "Improve" for the two CAD workflows, else the raw workflow name. */
export function supervisedRunTypeLabel(workflowName: string | null | undefined): string {
  if (workflowName === 'jewelry_cad_generate') return 'Generate';
  if (workflowName === 'jewelry_cad_improve') return 'Improve';
  return workflowName || '-';
}

/** acknowledge_missing must equal `missing` exactly: same names, no subset, no extras. */
export function sameNames(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = new Set(a);
  return left.size === new Set(b).size && b.every((name) => left.has(name));
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await authenticatedFetch(`${BASE}${path}`, {
    method,
    ...(body !== undefined
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = (data as { detail?: unknown } | null)?.detail;
    const record = detail && typeof detail === 'object' ? (detail as Record<string, unknown>) : {};
    const code = typeof record.code === 'string'
      ? record.code
      : typeof detail === 'string' && detail ? detail : `http_${response.status}`;
    throw new SupervisedRunsApiError(response.status, code, record);
  }
  return data as T;
}

const run = (workflowId: string) => `/${encodeURIComponent(workflowId)}`;

export async function listSupervisedRuns(params: {
  phases?: SupervisedPhase[];
  workflowName?: string;
  userEmail?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ items: SupervisedRunListItem[]; total: number; limit: number; offset: number }> {
  const q = new URLSearchParams();
  for (const phase of params.phases ?? []) q.append('phase', phase);
  if (params.workflowName) q.set('workflow_name', params.workflowName);
  if (params.userEmail) q.set('user_email', params.userEmail);
  if (params.limit !== undefined) q.set('limit', String(params.limit));
  if (params.offset !== undefined) q.set('offset', String(params.offset));
  const query = q.toString();
  return request('GET', query ? `?${query}` : '');
}

export function getSupervisedRun(workflowId: string): Promise<SupervisedRunDetail> {
  return request('GET', run(workflowId));
}

/** The AI that builds the model and the AI that reviews it; one left out keeps the run's own. */
export interface StartTiers {
  llm_tier?: string;
  analysis_tier?: string;
}

export async function startSupervisedRuns(workflowIds: string[], tiers?: StartTiers): Promise<StartResult[]> {
  const body: Record<string, unknown> = { workflow_ids: workflowIds };
  if (tiers?.llm_tier) body.llm_tier = tiers.llm_tier;
  if (tiers?.analysis_tier) body.analysis_tier = tiers.analysis_tier;
  const data = await request<{ results: StartResult[] } | null>('POST', '/start', body);
  return data?.results ?? [];
}

/** The backend's limit for a note to the user, in characters (code points) after trimming. */
export const USER_NOTE_MAX_CHARS = 2000;

/**
 * A note's length the way the backend counts it: characters after trimming both ends. Never use
 * .length or .slice() on the text: they count UTF-16 units and can cut an emoji in half.
 */
export function userNoteLength(text: string): number {
  return [...text.trim()].length;
}

/** The request field for a note: trimmed text, or nothing for a blank box. */
function userNoteField(note?: string): { user_note?: string } {
  const text = note?.trim();
  return text ? { user_note: text } : {};
}

export function sendSupervisedRun(workflowId: string, acknowledgeMissing: string[], userNote?: string) {
  return request<{ accepted: boolean; phase: SupervisedPhase }>('POST', `${run(workflowId)}/send`, {
    acknowledge_missing: acknowledgeMissing,
    ...userNoteField(userNote),
  });
}

export function rejectSupervisedRun(workflowId: string) {
  return request<{ accepted: boolean; phase: SupervisedPhase }>('POST', `${run(workflowId)}/reject`, {});
}

export function failSupervisedRun(workflowId: string, userNote?: string) {
  return request<{ accepted: boolean; phase: SupervisedPhase }>('POST', `${run(workflowId)}/fail`, userNoteField(userNote));
}

export function addSupervisedRunNote(workflowId: string, body: string) {
  return request<SupervisedNote>('POST', `${run(workflowId)}/notes`, { body });
}

export function removeSupervisedUpload(workflowId: string, role: UploadRole) {
  return request<{ removed: boolean }>('DELETE', `${run(workflowId)}/uploads/${encodeURIComponent(role)}`);
}

export function sendSupervisedReplacement(workflowId: string, acknowledgeMissing: string[], jewelryType?: string, userNote?: string) {
  return request<{ accepted: boolean; phase: SupervisedPhase }>('POST', `${run(workflowId)}/send-replacement`, {
    acknowledge_missing: acknowledgeMissing,
    ...(jewelryType ? { jewelry_type: jewelryType } : {}),
    ...userNoteField(userNote),
  });
}

type PutBlob = (url: string, file: File, onProgress?: (fraction: number) => void) => Promise<void>;

/**
 * Upload straight to Azure with the Storage SDK: one request for small files, blocks for large
 * ones (a single PUT is only safe up to 256 MB). Loaded on demand, so only uploads download it.
 * Never repeated once it settles: a second upload would replace a checked file.
 */
const putBlob: PutBlob = async (url, file, onProgress) => {
  try {
    const { BlockBlobClient } = await import('@azure/storage-blob');
    await new BlockBlobClient(url).uploadData(file, {
      onProgress: (progress) => onProgress?.(file.size ? progress.loadedBytes / file.size : 1),
    });
  } catch (err) {
    const status = (err as { statusCode?: unknown })?.statusCode;
    throw new SupervisedRunsApiError(typeof status === 'number' ? status : 0, 'upload_put_failed', {});
  }
};

/**
 * Upload one replacement file: ask for a link, upload the file to it once, then ask the backend to
 * check it. A refusal at any step throws SupervisedRunsApiError; start again from the top for a
 * corrected file (never reuse the link).
 */
export async function uploadReplacementFile(
  workflowId: string,
  role: UploadRole,
  file: File,
  { onProgress, put = putBlob }: { onProgress?: (fraction: number) => void; put?: PutBlob } = {},
): Promise<{ upload_id: string; role: UploadRole; ref: unknown }> {
  // The link's headers only ask for a block blob, which the SDK always writes.
  const link = await request<{ upload_id: string; upload_url: string; expires_at: string }>(
    'POST', `${run(workflowId)}/uploads`, { role, filename: file.name, bytes: file.size },
  );
  await put(link.upload_url, file, onProgress);
  try {
    return await request('POST', `${run(workflowId)}/uploads/${encodeURIComponent(link.upload_id)}/complete`, {});
  } catch (err) {
    // The check can outlive the proxy (Cloudflare cuts at about 100 s): say which upload it was,
    // so the caller can wait for it instead of uploading again.
    if (err instanceof SupervisedRunsApiError) {
      throw new SupervisedRunsApiError(err.status, err.code, { ...err.detail, upload_id: link.upload_id });
    }
    throw new SupervisedRunsApiError(0, 'network_error', { upload_id: link.upload_id });
  }
}

/**
 * True when `complete` failed in a way that says nothing about the check itself: no response
 * (status 0) or a 5xx other than a coded signal_failed. The check may still pass, so wait for the
 * upload to show as verified or removed; never PUT or complete again.
 */
export function isUncertainCheckFailure(err: unknown): err is SupervisedRunsApiError {
  if (!(err instanceof SupervisedRunsApiError)) return false;
  if (typeof err.detail.upload_id !== 'string' || !err.detail.upload_id) return false;
  if (err.status === 0) return true;
  return err.status >= 500 && err.code !== 'signal_failed';
}
