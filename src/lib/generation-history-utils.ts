import { type WorkflowSummary } from '@/lib/generation-history-api';
import { type UserAsset } from '@/lib/assets-api';

const CACHE_KEY = 'formanova_gen_cache_v5';
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface CachePayload {
  workflows: WorkflowSummary[];
  enriched: Record<string, Partial<WorkflowSummary>>;
  ts: number;
}

export function loadCache(): CachePayload | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: CachePayload = JSON.parse(raw);
    if (Date.now() - parsed.ts > CACHE_TTL_MS) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return parsed;
  } catch { return null; }
}

export function saveCache(workflows: WorkflowSummary[], enriched: Record<string, Partial<WorkflowSummary>>) {
  try {
    const payload: CachePayload = { workflows, enriched, ts: Date.now() };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch { /* quota exceeded — ignore */ }
}

export function preloadImage(url: string) {
  if (!url || url.startsWith('data:') || url.includes('/artifacts/')) return;
  const img = new Image();
  img.src = url;
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => resolve(null), ms);
    promise
      .then((value) => resolve(value))
      .catch(() => resolve(null))
      .finally(() => window.clearTimeout(timeout));
  });
}

export async function retryNullable<T>(
  task: () => Promise<T | null>,
  attempts = 2,
): Promise<T | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await task();
      if (result !== null) return result;
    } catch {
      // Retry bounded transient failures; the caller owns the terminal state.
    }
  }
  return null;
}

export async function batchSettled<T>(
  tasks: Array<() => Promise<T>>,
  concurrency = 5,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency).map((t) => t());
    results.push(...(await Promise.allSettled(batch)));
  }
  return results;
}

export function isVisibleGeneration(workflow: Pick<WorkflowSummary, 'status'>): boolean {
  return workflow.status === 'completed';
}

export function getAssetWorkflowId(asset: UserAsset): string | null {
  return (
    asset.workflow_id ||
    asset.workflow_run_id ||
    asset.source_workflow_id ||
    asset.generation_workflow_id ||
    asset.metadata?.workflow_id ||
    asset.metadata?.workflow_run_id ||
    asset.metadata?.source_workflow_id ||
    asset.metadata?.generation_workflow_id ||
    null
  );
}

export function getArtifactKey(value?: string | null): string | null {
  if (!value) return null;
  const clean = value.split('?')[0];
  const artifactMatch = clean.match(/\/artifacts\/([^/]+)/);
  if (artifactMatch?.[1]) return artifactMatch[1];
  const file = clean.split('/').pop();
  if (!file) return null;
  const stem = file.replace(/\.[^.]+$/, '');
  return /^(?:[a-f0-9]{32,}|[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/i.test(stem)
    ? stem
    : null;
}

export function getAssetArtifactKeys(asset: UserAsset): string[] {
  return [
    asset.artifact_sha256,
    asset.sha256,
    asset.metadata?.artifact_sha256,
    asset.metadata?.sha256,
    getArtifactKey(asset.uri),
    getArtifactKey(asset.artifact_url),
    getArtifactKey(asset.url),
    getArtifactKey(asset.thumbnail_url),
    getArtifactKey(asset.metadata?.uri),
    getArtifactKey(asset.metadata?.artifact_url),
    getArtifactKey(asset.metadata?.url),
  ].filter((v): v is string => Boolean(v));
}

/** One version of a ring, as the history card shows it. */
export interface RingVersionRef {
  assetId: string;
  position: number;
  workflowId: string | null;
  thumbnailUrl: string | null;
}

/**
 * Collapses a ring's runs into one row: the newest version, carrying the rest.
 *
 * Generate and every Improve press are separate workflow runs, so a ring that
 * has been improved twice fills three rows of history that all show the same
 * ring. The vault knows they belong together, so the runs it accounts for are
 * folded into the newest one and the older rows are dropped from the list.
 *
 * A run the vault does not know - anything made before versions existed -
 * passes through untouched, which is why this is safe to apply to the whole
 * list.
 */
export function groupRingVersions<T extends { workflow_id: string }>(
  workflows: T[],
  rings: Array<{ versions?: Array<{ asset_id: string; position?: number; source_workflow_id?: string | null; thumbnail_url?: string | null }> }>,
): Array<T & { ring_versions?: RingVersionRef[] }> {
  const newestOf = new Map<string, RingVersionRef[]>();   // workflow id of the newest -> all versions
  const supersededIds = new Set<string>();

  for (const ring of rings) {
    const versions = [...(ring.versions ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const withRuns = versions.filter((v) => v.source_workflow_id);
    if (withRuns.length < 1) continue;
    const newest = withRuns[withRuns.length - 1];
    for (const version of withRuns) {
      if (version.source_workflow_id !== newest.source_workflow_id) {
        supersededIds.add(String(version.source_workflow_id));
      }
    }
    newestOf.set(String(newest.source_workflow_id), versions.map((v) => ({
      assetId: v.asset_id,
      position: v.position ?? 0,
      workflowId: v.source_workflow_id ?? null,
      thumbnailUrl: v.thumbnail_url ?? null,
    })));
  }

  return workflows
    .filter((w) => !supersededIds.has(w.workflow_id))
    .map((w) => {
      const versions = newestOf.get(w.workflow_id);
      // One version is just a ring nobody has improved yet: no strip to show.
      return versions && versions.length > 1 ? { ...w, ring_versions: versions } : w;
    });
}
