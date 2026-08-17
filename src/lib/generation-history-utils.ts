import { type WorkflowSummary } from '@/lib/generation-history-api';
import { getAssetDisplayName, type UserAsset } from '@/lib/assets-api';

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
  return file || null;
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

export function sortByCreatedDesc<T extends { created_at?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => Date.parse(b.created_at ?? '') - Date.parse(a.created_at ?? ''));
}

export function buildOrderedCadAssetNameMap(workflows: WorkflowSummary[], assets: UserAsset[]): Record<string, string> {
  const cadWorkflows = sortByCreatedDesc(
    workflows.filter(w => w.source_type === 'text_to_cad' && w.status === 'completed'),
  );
  const cadAssetNames = sortByCreatedDesc(assets)
    .map(getAssetDisplayName)
    .filter(Boolean);

  return cadWorkflows.reduce<Record<string, string>>((acc, workflow, index) => {
    const name = cadAssetNames[index];
    if (name) acc[workflow.workflow_id] = name;
    return acc;
  }, {});
}
