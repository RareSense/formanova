/**
 * cad-versions-api.ts
 *
 * The ring vault: a ring's versions, and starting an improve on one.
 *
 *   GET  /api/cad/rings                        -> one entry per ring, versions nested
 *   POST /api/cad/versions/{asset_id}/improve  -> 202, starts ring_cad_improve
 *
 * Two things backend confirmed (2026-09-18) shape this module:
 *
 * 1. A run is reported complete by /status BEFORE its version row is written,
 *    so a ring looked up the instant /status turns terminal can legitimately
 *    be missing. /result/{id} waits for that write, so after it returns the
 *    ring is guaranteed to be listed. findRingForWorkflow still retries, since
 *    the caller may have reached it by another route.
 *
 * 2. Improve is started by the backend, never by a /run call from here: the
 *    one-improve-per-ring rule lives on its endpoint, and a client-initiated
 *    start is refused.
 */
import { authenticatedFetch } from '@/lib/authenticated-fetch';

/** How the backend labels an improve outcome, e.g. "Looks better". */
export interface CadVersionLabel {
  code: string;
  text: string;
}

export interface CadRingVersion {
  asset_id: string;
  /** 0 is the original from generate; the button reads "Improve from V{position+1}". */
  position: number;
  name?: string | null;
  /** The run that produced THIS version. It lives on the version, not the ring. */
  source_workflow_id?: string | null;
  /** The before-and-after verdict of an improve press; absent on version 0. */
  label?: CadVersionLabel | null;
  /** The version this one was improved from; absent on the first version. */
  improved_from_asset_id?: string | null;
  glb_url?: string | null;
  thumbnail_url?: string | null;
  threedm_url?: string | null;
  /** False when this version cannot be improved; the button stays hidden. */
  improvable?: boolean;
  created_at?: string | null;
}

export interface CadRing {
  set_id: string;
  name?: string | null;
  /** Ordered by position; the last entry is the newest version. */
  versions: CadRingVersion[];
  improve_running?: boolean;
  running_improve_workflow_id?: string | null;
}

/**
 * Why a press produced no new version, or could not start.
 *
 * `no_new_version` is not a failure to apologise for: the run ended on purpose
 * and the credits are already back. It arrives as a 404 whose body carries a
 * reason code and a sentence written for the user, which is the one case where
 * a 404 from /result is normal rather than an error.
 */
export type CadImproveFailure =
  | 'no_new_version'
  | 'already_running'
  | 'not_improvable'
  | 'version_not_found'
  | 'improve_unavailable'
  | 'insufficient_credits'
  | 'unknown';

export class CadImproveError extends Error {
  readonly failure: CadImproveFailure;
  /** The backend's own short code, when it sent one. */
  readonly reasonCode?: string;
  /** The workflow already improving this ring, on `already_running`. */
  readonly runningWorkflowId?: string | null;

  constructor(
    failure: CadImproveFailure,
    message: string,
    options: { reasonCode?: string; runningWorkflowId?: string | null } = {},
  ) {
    super(message);
    this.name = 'CadImproveError';
    this.failure = failure;
    this.reasonCode = options.reasonCode;
    this.runningWorkflowId = options.runningWorkflowId ?? null;
  }
}

export interface CadImproveStarted {
  workflow_id: string;
  status_url?: string;
  result_url?: string;
  projected_cost?: number;
  authorized_budget?: number;
}

/** Page size the vault endpoint accepts; larger values are rejected. */
const MAX_PAGE_SIZE = 50;

/** Paging starts at 0 there, so asking for page 1 skips the newest rings. */
export async function fetchCadRings(page = 0, pageSize = MAX_PAGE_SIZE): Promise<CadRing[]> {
  const size = Math.min(pageSize, MAX_PAGE_SIZE);
  const response = await authenticatedFetch(`/api/cad/rings?page=${page}&page_size=${size}`);
  if (!response.ok) {
    // An empty vault and an unreachable one must not look the same to a caller
    // deciding whether to show an Improve button.
    throw new Error(`Could not load your rings (${response.status})`);
  }
  const body = await response.json();
  const items = Array.isArray(body) ? body : body?.items;
  return Array.isArray(items) ? (items as CadRing[]) : [];
}

/** The newest version of a ring, which is the one an Improve press starts from. */
export function latestVersion(ring: CadRing): CadRingVersion | null {
  if (!ring.versions?.length) return null;
  // Highest position wins rather than array order: the button must never offer
  // to improve from anything but the newest version.
  return ring.versions.reduce((newest, v) => ((v.position ?? 0) >= (newest.position ?? 0) ? v : newest));
}

/** What the button says: version 0 is V1, so a press reads "Improve from V1". */
export function versionLabel(version: CadRingVersion): string {
  return `V${(version.position ?? 0) + 1}`;
}

/**
 * The ring a run produced, or null when it never appears.
 *
 * Call this after /result/{id} has returned, where one attempt is enough. The
 * retries cover the caller who got here straight from /status, where the
 * version row may still be moments away.
 */
export async function findRingForWorkflow(
  workflowId: string,
  { attempts = 4, delayMs = 750 }: { attempts?: number; delayMs?: number } = {},
): Promise<CadRing | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    let rings: CadRing[];
    try {
      rings = await fetchCadRings();
    } catch {
      continue; // A transient failure should not end the search early.
    }
    // source_workflow_id belongs to the VERSION a run produced, not to the ring.
    const match = rings.find((ring) =>
      (ring.versions ?? []).some((version) => version.source_workflow_id === workflowId));
    if (match) return match;
  }
  return null;
}

/** Starts one repair pass on a version. The backend builds the payload. */
export async function startImproveFromVersion(assetId: string): Promise<CadImproveStarted> {
  const response = await authenticatedFetch(`/api/cad/versions/${assetId}/improve`, { method: 'POST' });
  if (response.ok) return (await response.json()) as CadImproveStarted;

  const body = await response.json().catch(() => null);
  const detail = (body as { detail?: unknown } | null)?.detail;
  const asObject = detail && typeof detail === 'object' ? (detail as Record<string, unknown>) : null;
  const code = String(asObject?.reason_code ?? (typeof detail === 'string' ? detail : '') ?? '');
  const message = String(asObject?.message ?? (typeof detail === 'string' ? detail : '') ?? '');

  if (response.status === 402) {
    throw new CadImproveError('insufficient_credits', message || 'You do not have enough credits for this.');
  }
  if (response.status === 409) {
    const running = code.includes('already_running') || message.includes('already_running');
    throw new CadImproveError(
      running ? 'already_running' : 'not_improvable',
      message || (running ? 'This ring is already being improved.' : 'This version cannot be improved.'),
      { reasonCode: code, runningWorkflowId: (body as { workflow_id?: string } | null)?.workflow_id ?? null },
    );
  }
  if (response.status === 404) {
    const unavailable = code.includes('improve_unavailable') || message.includes('improve_unavailable');
    throw new CadImproveError(
      unavailable ? 'improve_unavailable' : 'version_not_found',
      message || 'That version is no longer available.',
      { reasonCode: code },
    );
  }
  throw new CadImproveError('unknown', message || `Could not start the improvement (${response.status})`);
}

/**
 * Reads the outcome of a finished improve run from its /result response.
 *
 * A press that saved nothing comes back as 404 with `{message, reason_code,
 * reason}`. Everything else keeps a plain string detail, so the two are told
 * apart by the shape of the body rather than by the status alone.
 */
export async function fetchImproveOutcome(workflowId: string): Promise<CadImproveError | null> {
  try {
    const response = await authenticatedFetch(`/api/result/${workflowId}`);
    if (response.ok) return null;
    return readImproveResultFailure(response.status, await response.json().catch(() => null));
  } catch {
    // A press whose outcome cannot be read is reported as an ordinary failure
    // by the caller, which is the safer of the two stories to tell.
    return null;
  }
}

export function readImproveResultFailure(status: number, body: unknown): CadImproveError | null {
  if (status !== 404) return null;
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (!detail || typeof detail !== 'object') return null;
  const record = detail as Record<string, unknown>;
  const message = typeof record.message === 'string' ? record.message : '';
  const reason = typeof record.reason === 'string' ? record.reason : '';
  return new CadImproveError('no_new_version', message || reason || 'Nothing needed fixing this time.', {
    reasonCode: typeof record.reason_code === 'string' ? record.reason_code : undefined,
  });
}
