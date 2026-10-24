# Supervised CAD runs, step 2: admin CAD queue page. Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins run the whole supervised CAD flow from `/admin/cad-queue`: list, Start, Send, Reject, upload a replacement, Send replacement, Fail, notes.

**Architecture:** One typed client (`src/lib/supervised-runs-api.ts`) for every backend call, including a three-step browser-to-Azure upload. A list page and a detail page under the existing admin layout and guard. The detail page reuses the Generations detail view (`DetailContent`) for the run itself.

**Tech Stack:** React 18 + TypeScript, TanStack Query, shadcn/ui (Table, Button, Checkbox, Badge, AlertDialog, Progress, Textarea, Select), Vitest + Testing Library. Worktree `C:\Users\Clubinternet\OneDrive\Desktop\frontend\fn_wt_supervised`, branch `feat/supervised-admin-queue`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-24-supervised-admin-queue-design.md` (backend contract inside).
- API prefix `/api/admin/supervised-runs`; errors are `{"detail": {"code": ..., ...}}`.
- Phase -> actions: queued and errored -> Start, Reject, Fail; awaiting_review -> Send, Reject, Fail; rejected -> uploads, Send replacement, Fail; running, finalizing, delivered, failed -> none.
- Each upload URL is PUT exactly once, never retried. Single PUT only; files over 256,000,000 bytes are refused in the picker with "Files over 256 MB aren't supported yet."
- Send / Send replacement `acknowledge_missing` must equal `missing` exactly (set equality); `[]` when nothing is missing.
- Fail confirm copy, verbatim: title "Fail this run?", body "Refunds every credit. The user gets no email. This can't be undone.", confirm button "Fail run".
- Notes hint, verbatim: "Notes can't be edited or deleted."
- `signal_failed` copy, verbatim: "Nothing happened. Press again."
- Match the existing admin pages' look (AdminGenerationsPage / AdminGenerationDetailPage): same table header style (`font-mono text-[10px] uppercase tracking-widest`), Card, Button, badges. Mobile-first; no horizontal overflow at 390 px. Follow repo CLAUDE.md UI rules (equal-size sibling buttons, no cursor-pointer on buttons, centered dialogs).
- Never modify `src/components/text-to-cad/CADCanvas.tsx` or `src/components/cad-studio/materials.ts`.
- Commits: plain ASCII, no Co-Authored-By. Never push to main.
- Tests: `npx vitest run <file>`; before each commit full `npx vitest run` and `npx tsc --noEmit -p tsconfig.app.json`.

---

### Task 1: The typed client `src/lib/supervised-runs-api.ts`

**Files:** Create `src/lib/supervised-runs-api.ts`, `src/lib/supervised-runs-api.test.ts`.

**Interfaces (produced, used by Tasks 3-5):**
`SupervisedPhase`, `SupervisedRunListItem`, `SupervisedRunDetail`, `SupervisedUpload`, `SupervisedNote`, `UploadRole`, `UPLOAD_ROLES`, `PHASE_ACTIONS`, `MAX_SINGLE_PUT_BYTES`, `SupervisedRunsApiError`, `sameNames`, `listSupervisedRuns`, `getSupervisedRun`, `startSupervisedRuns`, `sendSupervisedRun`, `rejectSupervisedRun`, `failSupervisedRun`, `addSupervisedRunNote`, `removeSupervisedUpload`, `sendSupervisedReplacement`, `uploadReplacementFile`.

- [ ] **Step 1: Write the failing tests** — `src/lib/supervised-runs-api.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/authenticated-fetch', () => ({ authenticatedFetch: mockFetch }));

import {
  PHASE_ACTIONS, SupervisedRunsApiError, addSupervisedRunNote, failSupervisedRun, getSupervisedRun,
  listSupervisedRuns, rejectSupervisedRun, removeSupervisedUpload, sameNames, sendSupervisedReplacement,
  sendSupervisedRun, startSupervisedRuns, uploadReplacementFile,
} from './supervised-runs-api';

const ok = (body: unknown, status = 200) => ({ ok: true, status, json: async () => body });
const fail = (status: number, detail: unknown) => ({ ok: false, status, json: async () => ({ detail }) });
const call = (i = 0) => ({ url: mockFetch.mock.calls[i][0], init: mockFetch.mock.calls[i][1] ?? {} });

beforeEach(() => mockFetch.mockReset());

describe('supervised runs client', () => {
  it('lists with repeated phase params', async () => {
    mockFetch.mockResolvedValue(ok({ items: [], total: 0, limit: 20, offset: 0 }));
    await listSupervisedRuns({ phases: ['queued', 'errored'], userEmail: 'a@b.c', limit: 20, offset: 40 });
    expect(call().url).toBe('/api/admin/supervised-runs?phase=queued&phase=errored&user_email=a%40b.c&limit=20&offset=40');
  });

  it('reads one run', async () => {
    mockFetch.mockResolvedValue(ok({ run: {}, supervision: { phase: 'queued' }, uploads: [], notes: [], download_urls: {} }));
    const d = await getSupervisedRun('wf 1');
    expect(call().url).toBe('/api/admin/supervised-runs/wf%201');
    expect(d.supervision.phase).toBe('queued');
  });

  it('starts many and returns each result', async () => {
    mockFetch.mockResolvedValue(ok({ results: [{ workflow_id: 'a', accepted: true }, { workflow_id: 'b', accepted: false, code: 'invalid_phase' }] }));
    const r = await startSupervisedRuns(['a', 'b']);
    expect(call().init.method).toBe('POST');
    expect(call().url).toBe('/api/admin/supervised-runs/start');
    expect(JSON.parse(call().init.body)).toEqual({ workflow_ids: ['a', 'b'] });
    expect(r[1]).toEqual({ workflow_id: 'b', accepted: false, code: 'invalid_phase' });
  });

  it('sends with the acknowledged names', async () => {
    mockFetch.mockResolvedValue(ok({ accepted: true, phase: 'awaiting_review' }, 202));
    await sendSupervisedRun('a', ['code_artifact']);
    expect(call().url).toBe('/api/admin/supervised-runs/a/send');
    expect(JSON.parse(call().init.body)).toEqual({ acknowledge_missing: ['code_artifact'] });
  });

  it('rejects, fails and adds notes on the right routes', async () => {
    mockFetch.mockResolvedValue(ok({ accepted: true, phase: 'queued' }, 202));
    await rejectSupervisedRun('a');
    await failSupervisedRun('a');
    mockFetch.mockResolvedValue(ok({ id: 'n1', author_email: 'x', body: 'hi', created_at: '' }));
    await addSupervisedRunNote('a', 'hi');
    expect([call(0).url, call(1).url, call(2).url]).toEqual([
      '/api/admin/supervised-runs/a/reject', '/api/admin/supervised-runs/a/fail', '/api/admin/supervised-runs/a/notes',
    ]);
    expect(JSON.parse(call(2).init.body)).toEqual({ body: 'hi' });
  });

  it('sends a replacement with an optional jewelry type', async () => {
    mockFetch.mockResolvedValue(ok({ accepted: true, phase: 'rejected' }, 202));
    await sendSupervisedReplacement('a', [], 'ring');
    await sendSupervisedReplacement('a', ['loop_state_artifact']);
    expect(JSON.parse(call(0).init.body)).toEqual({ acknowledge_missing: [], jewelry_type: 'ring' });
    expect(JSON.parse(call(1).init.body)).toEqual({ acknowledge_missing: ['loop_state_artifact'] });
  });

  it('removes an upload by role', async () => {
    mockFetch.mockResolvedValue(ok({ removed: true }));
    await removeSupervisedUpload('a', 'glb');
    expect(call().init.method).toBe('DELETE');
    expect(call().url).toBe('/api/admin/supervised-runs/a/uploads/glb');
  });

  it('turns a coded error into SupervisedRunsApiError', async () => {
    mockFetch.mockResolvedValue(fail(409, { code: 'invalid_phase', phase: 'running', allowed: [] }));
    const err = await sendSupervisedRun('a', []).catch((e) => e);
    expect(err).toBeInstanceOf(SupervisedRunsApiError);
    expect(err.status).toBe(409);
    expect(err.code).toBe('invalid_phase');
    expect(err.detail.phase).toBe('running');
  });

  it('keeps a plain string detail as the code', async () => {
    mockFetch.mockResolvedValue(fail(403, 'not an admin'));
    const err = await getSupervisedRun('a').catch((e) => e);
    expect(err.code).toBe('not an admin');
  });
});

describe('helpers', () => {
  it('compares names as sets of the same size', () => {
    expect(sameNames([], [])).toBe(true);
    expect(sameNames(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameNames(['a'], ['a', 'b'])).toBe(false);
    expect(sameNames(['a', 'a'], ['a', 'b'])).toBe(false);
  });

  it('allows only the handoff actions per phase', () => {
    expect(PHASE_ACTIONS.queued).toEqual(['start', 'reject', 'fail']);
    expect(PHASE_ACTIONS.errored).toEqual(['start', 'reject', 'fail']);
    expect(PHASE_ACTIONS.awaiting_review).toEqual(['send', 'reject', 'fail']);
    expect(PHASE_ACTIONS.rejected).toEqual(['upload', 'send_replacement', 'fail']);
    for (const p of ['running', 'finalizing', 'delivered', 'failed'] as const) expect(PHASE_ACTIONS[p]).toEqual([]);
  });
});

describe('uploadReplacementFile', () => {
  const file = new File(['x'.repeat(10)], 'ring.glb');

  it('asks for a link, PUTs once with the returned headers, then completes', async () => {
    mockFetch
      .mockResolvedValueOnce(ok({ upload_id: 'u1', upload_url: 'https://blob/x?sig', expires_at: '', headers: { 'x-ms-blob-type': 'BlockBlob' } }))
      .mockResolvedValueOnce(ok({ upload_id: 'u1', role: 'glb', ref: { uri: 'azure://x' } }));
    const put = vi.fn(async () => {});
    const done = await uploadReplacementFile('a', 'glb', file, { put });
    expect(call(0).url).toBe('/api/admin/supervised-runs/a/uploads');
    expect(JSON.parse(call(0).init.body)).toEqual({ role: 'glb', filename: 'ring.glb', bytes: 10 });
    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith('https://blob/x?sig', file, { 'x-ms-blob-type': 'BlockBlob' }, undefined);
    expect(call(1).url).toBe('/api/admin/supervised-runs/a/uploads/u1/complete');
    expect(done.upload_id).toBe('u1');
  });

  it('never retries the PUT and never completes after a failed PUT', async () => {
    mockFetch.mockResolvedValueOnce(ok({ upload_id: 'u1', upload_url: 'https://blob/x', expires_at: '', headers: {} }));
    const put = vi.fn(async () => { throw new SupervisedRunsApiError(0, 'upload_put_failed', {}); });
    await expect(uploadReplacementFile('a', 'glb', file, { put })).rejects.toMatchObject({ code: 'upload_put_failed' });
    expect(put).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('always sends the BlockBlob header even if the backend omits it', async () => {
    mockFetch
      .mockResolvedValueOnce(ok({ upload_id: 'u1', upload_url: 'https://blob/x', expires_at: '' }))
      .mockResolvedValueOnce(ok({ upload_id: 'u1', role: 'glb', ref: {} }));
    const put = vi.fn(async () => {});
    await uploadReplacementFile('a', 'glb', file, { put });
    expect(put.mock.calls[0][2]).toEqual({ 'x-ms-blob-type': 'BlockBlob' });
  });

  it('refuses a file over the single-PUT limit before any request', async () => {
    const big = new File(['x'], 'big.stl');
    Object.defineProperty(big, 'size', { value: 256_000_001 });
    await expect(uploadReplacementFile('a', 'stl', big, { put: vi.fn() })).rejects.toMatchObject({ code: 'too_large_for_browser' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('reports a failed check with its reason', async () => {
    mockFetch
      .mockResolvedValueOnce(ok({ upload_id: 'u1', upload_url: 'https://blob/x', expires_at: '', headers: {} }))
      .mockResolvedValueOnce(fail(422, { code: 'upload_invalid', reason: 'bad_content' }));
    const err = await uploadReplacementFile('a', 'glb', file, { put: vi.fn(async () => {}) }).catch((e) => e);
    expect(err.code).toBe('upload_invalid');
    expect(err.detail.reason).toBe('bad_content');
  });
});
```

- [ ] **Step 2: Run, confirm RED.** `npx vitest run src/lib/supervised-runs-api.test.ts` -> fails: module not found.

- [ ] **Step 3: Implement** — `src/lib/supervised-runs-api.ts`:

```ts
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
    decided_by_email: string | null;
    decided_at: string | null;
    acknowledged_missing: string[] | null;
    delivery: unknown;
    events: Array<Record<string, unknown>>;
  };
  send_check: { has_model: boolean; missing: string[] } | null;
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
  { role: 'code', label: 'CAD code', accept: '.py', maxBytes: 10 * MiB },
  { role: 'loop_state', label: 'Loop state', accept: '.json', maxBytes: 10 * MiB },
  { role: 'thumbnail', label: 'Thumbnail', accept: '.png', maxBytes: 20 * MiB },
  { role: 'design_contract', label: 'Design contract', accept: '.json', maxBytes: 10 * MiB, generateOnly: true },
  { role: 'reference_manifest', label: 'Reference manifest', accept: '.json', maxBytes: 10 * MiB, generateOnly: true },
  { role: 'stl', label: 'Full model STL', accept: '.stl', maxBytes: GiB },
  { role: 'step', label: 'Full model STEP', accept: '.step', maxBytes: GiB },
  { role: 'casting_stl', label: 'Casting STL', accept: '.stl', maxBytes: GiB },
  { role: 'stones', label: 'Stone list', accept: '.json', maxBytes: MiB },
];

/**
 * One PUT is safe up to 256 MB (handoff). Larger files need the Azure Storage SDK's block upload,
 * which this page does not ship yet, so the picker refuses them before any request.
 */
export const MAX_SINGLE_PUT_BYTES = 256_000_000;

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

export async function startSupervisedRuns(workflowIds: string[]): Promise<StartResult[]> {
  const data = await request<{ results: StartResult[] }>('POST', '/start', { workflow_ids: workflowIds });
  return data.results ?? [];
}

export function sendSupervisedRun(workflowId: string, acknowledgeMissing: string[]) {
  return request<{ accepted: boolean; phase: SupervisedPhase }>('POST', `${run(workflowId)}/send`, { acknowledge_missing: acknowledgeMissing });
}

export function rejectSupervisedRun(workflowId: string) {
  return request<{ accepted: boolean; phase: SupervisedPhase }>('POST', `${run(workflowId)}/reject`, {});
}

export function failSupervisedRun(workflowId: string) {
  return request<{ accepted: boolean; phase: SupervisedPhase }>('POST', `${run(workflowId)}/fail`, {});
}

export function addSupervisedRunNote(workflowId: string, body: string) {
  return request<SupervisedNote>('POST', `${run(workflowId)}/notes`, { body });
}

export function removeSupervisedUpload(workflowId: string, role: UploadRole) {
  return request<{ removed: boolean }>('DELETE', `${run(workflowId)}/uploads/${encodeURIComponent(role)}`);
}

export function sendSupervisedReplacement(workflowId: string, acknowledgeMissing: string[], jewelryType?: string) {
  return request<{ accepted: boolean; phase: SupervisedPhase }>('POST', `${run(workflowId)}/send-replacement`, {
    acknowledge_missing: acknowledgeMissing,
    ...(jewelryType ? { jewelry_type: jewelryType } : {}),
  });
}

type PutBlob = (url: string, file: File, headers: Record<string, string>, onProgress?: (fraction: number) => void) => Promise<void>;

/** One PUT straight to Azure, with progress. Never retried: a second PUT would replace a checked file. */
const putBlobOnce: PutBlob = (url, file, headers, onProgress) => new Promise((resolve, reject) => {
  const xhr = new XMLHttpRequest();
  xhr.open('PUT', url);
  for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
  xhr.upload.onprogress = (event) => {
    if (event.lengthComputable) onProgress?.(event.loaded / event.total);
  };
  xhr.onload = () => (xhr.status >= 200 && xhr.status < 300
    ? resolve()
    : reject(new SupervisedRunsApiError(xhr.status, 'upload_put_failed', {})));
  xhr.onerror = () => reject(new SupervisedRunsApiError(0, 'upload_put_failed', {}));
  xhr.send(file);
});

/**
 * Upload one replacement file: ask for a link, PUT the file to it once, then ask the backend to
 * check it. A refusal at any step throws SupervisedRunsApiError; start again from the top for a
 * corrected file (never reuse the link).
 */
export async function uploadReplacementFile(
  workflowId: string,
  role: UploadRole,
  file: File,
  { onProgress, put = putBlobOnce }: { onProgress?: (fraction: number) => void; put?: PutBlob } = {},
): Promise<{ upload_id: string; role: UploadRole; ref: unknown }> {
  if (file.size > MAX_SINGLE_PUT_BYTES) {
    throw new SupervisedRunsApiError(0, 'too_large_for_browser', { max_bytes: MAX_SINGLE_PUT_BYTES });
  }
  const link = await request<{ upload_id: string; upload_url: string; expires_at: string; headers?: Record<string, string> }>(
    'POST', `${run(workflowId)}/uploads`, { role, filename: file.name, bytes: file.size },
  );
  await put(link.upload_url, file, { 'x-ms-blob-type': 'BlockBlob', ...(link.headers ?? {}) }, onProgress);
  return request('POST', `${run(workflowId)}/uploads/${encodeURIComponent(link.upload_id)}/complete`, {});
}
```

- [ ] **Step 4: GREEN.** Same command -> all pass. Then full suite + tsc.
- [ ] **Step 5: Commit** `Admin CAD queue: typed client for the supervised-runs API`

---

### Task 2: Reuse hooks in the Generations admin

**Files:** Modify `src/lib/admin-generations-api.ts`, `src/pages/AdminGenerationsPage.tsx`, `src/pages/AdminGenerationDetailPage.tsx`. Test: `src/lib/admin-generations-api.test.ts`.

**Produces:** `export function normalizeAdminGenerationDetail(data: unknown, workflowId: string): AdminGenerationDetail`; `AdminGenerationsListParams.supervised?: boolean`; `export function DetailContent`.

- [ ] **Step 1: Failing tests** (append to `src/lib/admin-generations-api.test.ts`, following its existing mocking of `authenticatedFetch`; read the file first):
  1. `listAdminGenerations({ supervised: false })` requests a URL containing `supervised=false`; `listAdminGenerations({})` does not contain `supervised`.
  2. `normalizeAdminGenerationDetail({ workflow_id: 'w', workflow_name: 'jewelry_cad_generate', status: 'running', steps: [] }, 'w')` returns `workflow_id: 'w'`, `workflow_name: 'jewelry_cad_generate'`, `steps: []`, and `normalizeAdminGenerationDetail({ data: { workflow_name: 'x' } }, 'w2').workflow_id === 'w2'` (the `data` wrapper and the id fallback are kept).
- [ ] **Step 2: RED.**
- [ ] **Step 3: Implement.**
  - In `AdminGenerationsListParams` add `/** false keeps supervised runs (the CAD queue) out of this list. */ supervised?: boolean;` and in `listAdminGenerations` add `if (params.supervised !== undefined) q.set('supervised', String(params.supervised));`.
  - Move the body of `getAdminGenerationDetail` after `const data = await response.json();` into `export function normalizeAdminGenerationDetail(data: any, workflowId: string): AdminGenerationDetail { const payload = data?.data ?? data; return { ...same object... }; }` and make `getAdminGenerationDetail` return `normalizeAdminGenerationDetail(data, workflowId)`. The returned object is byte-for-byte the same as today.
  - `AdminGenerationsPage.tsx`: in the `listAdminGenerations({...})` call add `supervised: false,` (handoff section 6: queued runs must not show here).
  - `AdminGenerationDetailPage.tsx`: change `function DetailContent(` to `export function DetailContent(`. Nothing else.
- [ ] **Step 4: GREEN**, full suite, tsc.
- [ ] **Step 5: Commit** `Admin generations: keep supervised runs out of the list, and share the run detail view`

---

### Task 3: The queue list page

**Files:** Create `src/pages/AdminCadQueuePage.tsx`, `src/pages/AdminCadQueuePage.test.tsx`. Modify `src/components/admin/AdminLayout.tsx` (tab `{ label: 'CAD Queue', to: '/admin/cad-queue' }` after Generations), `src/App.tsx` (lazy import like `AdminGenerationsPage`; `<Route path="cad-queue" element={<AdminCadQueuePage />} />` inside the admin layout, after `generations`).

**Consumes:** `listSupervisedRuns`, `startSupervisedRuns`, `SupervisedRunListItem`, `SupervisedPhase`, `SupervisedRunsApiError` (Task 1).

Behaviour (read `AdminGenerationsPage.tsx` first and mirror its layout, filters row, table, loading/error/empty states and pagination; `PAGE_SIZE = 20`):
- Filters in the URL search params: `phase` (repeated), `search` (email). Phase filter is a row of toggle chips (buttons, `aria-pressed`) for all 8 phases; with no `phase` param the default set is queued, errored, awaiting_review. Email search debounced 300 ms like the Generations page.
- Query key `['admin-cad-queue', phases, search, offset]`, `retry: false`, `refetchInterval: 15000`.
- Table columns: a tick box column, Created, User, Workflow, Phase (badge, label = phase with `_` -> space), Attempt, Last error (truncate to one line, full text in `title`), Notes (`note_count`), Paying, Open (button). Row click opens `/admin/cad-queue/{id}` keeping the search params, as Generations does.
- Tick boxes are enabled only on `queued` and `errored` rows. A "Start selected (N)" button above the table, disabled when none ticked. On press: `startSupervisedRuns(ids)`; then refetch; clear ticks; show a result line: "Started N." and, for each not accepted, "`{id}`: {code}" (codes shown as-is: not_found, invalid_phase, signal_failed). A request error shows its `code`.
- 401/403 -> the same "Not Authorized" state style as Generations; empty -> "No runs in these phases."

- [ ] **Step 1: Failing tests** — `src/pages/AdminCadQueuePage.test.tsx` (mock `@/lib/supervised-runs-api`; render inside `QueryClientProvider` (new client, retries off) and `MemoryRouter` at `/admin/cad-queue`):

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const api = vi.hoisted(() => ({ listSupervisedRuns: vi.fn(), startSupervisedRuns: vi.fn() }));
vi.mock('@/lib/supervised-runs-api', async (orig) => ({ ...(await orig<object>()), ...api }));

import AdminCadQueuePage from './AdminCadQueuePage';

const row = (id: string, phase: string, extra = {}) => ({
  workflow_id: id, workflow_name: 'jewelry_cad_generate', phase, attempt: 1, created_at: '2026-10-24T10:00:00Z',
  updated_at: '2026-10-24T10:00:00Z', user_email: 'u@x.com', is_paying: false, last_error: null, decision: null, note_count: 0, ...extra,
});

function renderPage(path = '/admin/cad-queue') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}><AdminCadQueuePage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.listSupervisedRuns.mockReset();
  api.startSupervisedRuns.mockReset();
});

describe('AdminCadQueuePage', () => {
  it('asks for queued, errored and awaiting review by default', async () => {
    api.listSupervisedRuns.mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });
    renderPage();
    await waitFor(() => expect(api.listSupervisedRuns).toHaveBeenCalled());
    expect(api.listSupervisedRuns.mock.calls[0][0].phases).toEqual(['queued', 'errored', 'awaiting_review']);
    expect(await screen.findByText('No runs in these phases.')).toBeTruthy();
  });

  it('shows the full last error on hover and the attempt', async () => {
    api.listSupervisedRuns.mockResolvedValue({ items: [row('wf-e', 'errored', { attempt: 2, last_error: 'provider credit exhausted' })], total: 1, limit: 20, offset: 0 });
    renderPage();
    const cell = await screen.findByText('provider credit exhausted');
    expect(cell.getAttribute('title')).toBe('provider credit exhausted');
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('starts the ticked runs and lists the ones not accepted', async () => {
    api.listSupervisedRuns.mockResolvedValue({ items: [row('wf-a', 'queued'), row('wf-b', 'errored'), row('wf-c', 'awaiting_review')], total: 3, limit: 20, offset: 0 });
    api.startSupervisedRuns.mockResolvedValue([{ workflow_id: 'wf-a', accepted: true }, { workflow_id: 'wf-b', accepted: false, code: 'invalid_phase' }]);
    renderPage();
    const boxes = await screen.findAllByRole('checkbox');
    expect(boxes).toHaveLength(3);
    expect(boxes[2].hasAttribute('disabled') || boxes[2].getAttribute('data-disabled') !== null).toBe(true);
    fireEvent.click(boxes[0]);
    fireEvent.click(boxes[1]);
    fireEvent.click(screen.getByRole('button', { name: /start selected \(2\)/i }));
    await waitFor(() => expect(api.startSupervisedRuns).toHaveBeenCalledWith(['wf-a', 'wf-b']));
    expect(await screen.findByText('Started 1.')).toBeTruthy();
    expect(screen.getByText(/wf-b.*invalid_phase/)).toBeTruthy();
  });

  it('keeps Start selected disabled with nothing ticked', async () => {
    api.listSupervisedRuns.mockResolvedValue({ items: [row('wf-a', 'queued')], total: 1, limit: 20, offset: 0 });
    renderPage();
    const button = await screen.findByRole('button', { name: /start selected \(0\)/i });
    expect(button.hasAttribute('disabled')).toBe(true);
  });
});
```

- [ ] **Step 2: RED.** **Step 3: Implement** as described. **Step 4: GREEN**, full suite, tsc.
- [ ] **Step 5: Commit** `Admin CAD queue: the queue list with Start selected`

---

### Task 4: The run detail page (everything except uploads)

**Files:** Create `src/pages/AdminCadQueueDetailPage.tsx`, `src/pages/AdminCadQueueDetailPage.test.tsx`. Modify `src/App.tsx`: lazy import; route `<Route path="/admin/cad-queue/:workflowId" element={<AdminRouteGuard><AdminCadQueueDetailPage /></AdminRouteGuard>} />` next to the generation detail route.

**Consumes:** Task 1 client; `normalizeAdminGenerationDetail` and `DetailContent` (Task 2).

Behaviour (mirror `AdminGenerationDetailPage`'s shell: back button "Back to CAD Queue" to `/admin/cad-queue` + search params, loading/401/404 states):
- Query `['admin-cad-queue-run', id]` -> `getSupervisedRun`.
- **Supervision card:** phase badge, "Attempt {n}", attempt started, `decision` / decided by / decided at when set, full `last_error` in a `<pre className="whitespace-pre-wrap break-words ...">` with its time, and an events list (time + any `type`/`event`/`phase` field + the rest as compact JSON) inside a collapsible.
- **Action bar:** one button per allowed action for the phase (`PHASE_ACTIONS`), equal size, labels "Start", "Send", "Reject", "Fail". `upload` and `send_replacement` are not buttons here (Task 5 panel). For `running`/`finalizing`: text "Working: no actions until this finishes." For `delivered`/`failed`: "Finished."
  - Start -> `startSupervisedRuns([id])`; a not-accepted result is shown with its code.
  - Send -> opens a centered dialog listing `send_check.missing` as tick boxes (labels are the names verbatim) with the text "Without these files the user can't improve this model later. Tick each one to confirm." When `missing` is empty: "Nothing is missing." The dialog's Send button is enabled only when `sameNames(ticked, missing)`. `send_check.has_model === false` -> dialog says "There is no model to send." and Send stays disabled. Calls `sendSupervisedRun(id, ticked)`.
  - Reject -> `rejectSupervisedRun(id)` directly.
  - Fail -> AlertDialog with the verbatim Fail copy; confirm calls `failSupervisedRun(id)`.
  - After an accepted action: show "Done. Waiting for the run to move..." and refetch every 5 s until `supervision.phase` differs from the phase at press time (stop after 2 minutes with "Still {phase}. Refresh to check again.").
  - Errors: `invalid_phase` -> refetch and show "This run is now {detail.phase}." ; `signal_failed` -> "Nothing happened. Press again." ; `acknowledgement_mismatch` -> "The missing list changed. Check it again." and refetch ; `no_model` -> "There is no model to send." ; any other -> its code.
- **Notes card:** list (author, time, body with preserved line breaks), a Textarea (max 10000) + "Add note" button (disabled when blank), the hint "Notes can't be edited or deleted." ; `bad_note` -> "That note can't be saved (1 to 10,000 characters)." ; on success refetch.
- **The run:** `<DetailContent detail={normalizeAdminGenerationDetail(data.run, id)} />` under a heading "The run".

- [ ] **Step 1: Failing tests** — `src/pages/AdminCadQueueDetailPage.test.tsx`. Mock `@/lib/supervised-runs-api` (spread the real module, replace the network functions) and mock `@/pages/AdminGenerationDetailPage` to `{ DetailContent: () => <div>run detail</div> }`. Render with `QueryClientProvider` + `MemoryRouter initialEntries={['/admin/cad-queue/wf-1']}` + `<Routes><Route path="/admin/cad-queue/:workflowId" element={<AdminCadQueueDetailPage />} /></Routes>`. Helper `detail(phase, extra)` builds a full `SupervisedRunDetail` (run `{ workflow_id: 'wf-1', steps: [] }`, empty uploads/notes/download_urls, `send_check` null unless given). Tests:
  1. `queued` shows exactly the buttons Start, Reject, Fail (query `getAllByRole('button')` names, ignoring "Back to CAD Queue", "Add note"); `awaiting_review` shows Send, Reject, Fail; `running` shows "Working: no actions until this finishes." and no action buttons.
  2. Send with `send_check: { has_model: true, missing: ['code_artifact', 'loop_state_artifact'] }`: the dialog's Send is disabled; after ticking one it is still disabled; after ticking both it is enabled; pressing calls `sendSupervisedRun('wf-1', ['code_artifact', 'loop_state_artifact'])` (order-insensitive check via `expect.arrayContaining` + length 2).
  3. Send with `missing: []` enables Send at once and sends `[]`.
  4. Fail opens a dialog with "Refunds every credit. The user gets no email. This can't be undone."; pressing "Fail run" calls `failSupervisedRun('wf-1')`; cancelling does not.
  5. A `signal_failed` rejection from `rejectSupervisedRun` shows "Nothing happened. Press again."
  6. Notes: the hint "Notes can't be edited or deleted." is shown; typing "checked the prongs" and pressing "Add note" calls `addSupervisedRunNote('wf-1', 'checked the prongs')`; "Add note" is disabled while the box is blank.
  7. The run section renders "run detail" (the reused view).
- [ ] **Step 2: RED.** **Step 3: Implement.** **Step 4: GREEN**, full suite, tsc.
- [ ] **Step 5: Commit** `Admin CAD queue: run detail with Start, Send, Reject, Fail and notes`

---

### Task 5: The replacement panel (uploads and Send replacement)

**Files:** Create `src/components/admin/SupervisedReplacementPanel.tsx`, `src/components/admin/SupervisedReplacementPanel.test.tsx`. Modify `src/pages/AdminCadQueueDetailPage.tsx` to render `<SupervisedReplacementPanel detail={data} onChanged={refetch} />` when `supervision.phase === 'rejected'` (above Notes).

**Consumes:** `UPLOAD_ROLES`, `MAX_SINGLE_PUT_BYTES`, `uploadReplacementFile`, `removeSupervisedUpload`, `sendSupervisedReplacement`, `sameNames`, `SupervisedRunsApiError`, `SupervisedRunDetail`.

Behaviour:
- Generate run = `normalizeAdminGenerationDetail(detail.run, id).workflow_name === 'jewelry_cad_generate'`; roles with `generateOnly` are hidden otherwise.
- One row per role: label (+ "required" on glb), accepted extension, max size (human: "1 GiB", "10 MiB", "1 MiB", "20 MiB"), the verified upload for that role if any (filename, size, "checked" + link from `download_urls[role]` opening in a new tab, and a "Remove" button -> `removeSupervisedUpload`), and a file picker (`<input type="file" accept=...>` behind a button "Choose file" / "Replace file").
- On pick: refuse before any request if `file.size > maxBytes` ("Too big for this role (max …).") or `> MAX_SINGLE_PUT_BYTES` ("Files over 256 MB aren't supported yet."). Otherwise call `uploadReplacementFile(id, role, file, { onProgress })`: show a Progress bar during the PUT, then "Checking..." until complete resolves, then call `onChanged()`. Errors: `upload_invalid` -> "Refused: {detail.reason}. Upload it again." ; `bad_size` -> "Wrong size (max {max_bytes} bytes)." ; `role_not_allowed` -> "This file type isn't allowed for this run." ; `upload_not_pending` -> "This upload was already used. Choose the file again." ; `upload_put_failed` -> "The upload to storage failed. Choose the file again." One upload at a time per role; a role's picker is disabled while its upload runs.
- Under the glb row, a muted hint, verbatim: "Must differ from the pipeline's model. An identical GLB saves nothing and the user gets no model; use Send instead." (Backend 2026-10-24: an identical GLB saves no new version and `output_asset_id` is null.) Test 1 also asserts this text is shown.
- Below the rows: "What will be sent" from `replacement_check.final_preview` (render as compact JSON in a collapsible), `replacement_check.missing` as tick boxes with "Without these files the user can't improve this model later. Tick each one to confirm.", a jewelry type Select (ring, necklace, bracelet, earring, other) shown only when `missing` includes `jewelry_type`, and "Send replacement" enabled only when `replacement_check.has_model` and `sameNames(ticked, missing)` and (jewelry type chosen if `jewelry_type` is missing). Pressing calls `sendSupervisedReplacement(id, ticked, jewelryType)`, then `onChanged()`. `has_model === false` -> "Upload the GLB first." Same error copy as Task 4 for `acknowledgement_mismatch`, `no_model`, `signal_failed`, `invalid_phase`.

- [ ] **Step 1: Failing tests** — `SupervisedReplacementPanel.test.tsx` (mock `@/lib/supervised-runs-api` spreading the real module and replacing `uploadReplacementFile`, `removeSupervisedUpload`, `sendSupervisedReplacement`):
  1. For a generate run all 12 roles show; for `workflow_name: 'jewelry_cad_improve'` the two generate-only roles (Design contract, Reference manifest) are hidden.
  2. Picking a 300 MB file for `stl` (File with `size` defined via `Object.defineProperty`) shows "Files over 256 MB aren't supported yet." and never calls `uploadReplacementFile`.
  3. Picking `ring.glb` calls `uploadReplacementFile('wf-1', 'glb', file, expect.objectContaining({ onProgress: expect.any(Function) }))` and then `onChanged`.
  4. An `upload_invalid` rejection with `detail.reason: 'bad_signature'` shows "Refused: bad_signature. Upload it again."
  5. `replacement_check: { has_model: true, missing: ['loop_state_artifact', 'jewelry_type'], final_preview: {} }`: Send replacement disabled until both are ticked and a jewelry type is picked; then pressing calls `sendSupervisedReplacement('wf-1', expect.arrayContaining([...both]), 'ring')`.
  6. `has_model: false` shows "Upload the GLB first." and Send replacement is disabled.
  7. A verified glb upload shows its filename and a Remove button that calls `removeSupervisedUpload('wf-1', 'glb')`.
- [ ] **Step 2: RED.** **Step 3: Implement.** **Step 4: GREEN**, full suite, tsc.
- [ ] **Step 5: Commit** `Admin CAD queue: replacement uploads straight to storage, and Send replacement`

---

### Task 6: Verification

- [ ] Full `npx vitest run`, `npx tsc --noEmit -p tsconfig.app.json`, eslint on all new/changed files (no new errors vs main), `npx vite build --outDir /tmp/fn_admin_build`.
- [ ] Screenshots at 390 px and 1440 px of the list and of the detail in phases queued, awaiting_review (Send dialog open) and rejected (replacement panel), using the dev server with the API mocked in the browser (route-intercept `/api/admin/supervised-runs*` in the browser script; never committed). Check: no horizontal scroll at 390, equal-size action buttons, dialogs centered, long errors wrap.
- [ ] `git diff origin/main --stat`: only the files named in Tasks 1-5 plus spec and plan.
