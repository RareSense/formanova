/**
 * Prefetch generation history in the background.
 * Mount this hook on Dashboard so data is warm when the user opens Generations.
 * Uses the same sessionStorage cache key as the Generations page.
 */
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { listMyWorkflows, getWorkflowDetails, type WorkflowSummary } from '@/lib/generation-history-api';

const CACHE_KEY = 'formanova_gen_cache_v3';
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CachePayload {
  workflows: WorkflowSummary[];
  enriched: Record<string, Partial<WorkflowSummary>>;
  ts: number;
}

function loadCache(): CachePayload | null {
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

function saveCache(workflows: WorkflowSummary[], enriched: Record<string, Partial<WorkflowSummary>>) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ workflows, enriched, ts: Date.now() } as CachePayload));
  } catch { /* quota */ }
}

// Reuse extraction helpers via dynamic import to avoid circular deps
let extractors: typeof import('@/lib/generation-enrichment') | null = null;
async function getExtractors() {
  if (!extractors) {
    extractors = await import('@/lib/generation-enrichment');
  }
  return extractors;
}

/**
 * Silently prefetch & enrich generation history in the background.
 * Safe to call multiple times — skips if cache is fresh.
 */
export function usePrefetchGenerations() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    // Skip if cache is already fresh
    const existing = loadCache();
    if (existing) return;

    let cancelled = false;

    (async () => {
      try {
        const workflows = await listMyWorkflows(100, 0);
        if (cancelled) return;

        // Filter out unknown source types immediately
        const valid = workflows.filter(w => w.source_type !== 'unknown');
        const enriched: Record<string, Partial<WorkflowSummary>> = {};
        saveCache(valid, enriched);

        // Start background enrichment for the first ~15 workflows (covers page 1 of all sections)
        const { extractPhotoThumbnail, extractCadTextData, extractProductShotThumbnail } = await getExtractors();
        const toEnrich = valid
          .filter(w => w.status === 'completed' || (w.source_type === 'cad_text' && w.status === 'failed'))
          .slice(0, 15);

        for (let i = 0; i < toEnrich.length; i += 3) {
          if (cancelled) return;
          const batch = toEnrich.slice(i, i + 3);
          const results = await Promise.allSettled(
            batch.map(async (wf) => {
              const details = await getWorkflowDetails(wf.workflow_id);
              if (wf.source_type === 'product_shot') {
                const thumb = extractProductShotThumbnail(details.steps ?? []);
                return { id: wf.workflow_id, thumbnail_url: thumb ?? '' };
              }
              if (wf.source_type === 'cad_text') {
                return { id: wf.workflow_id, ...extractCadTextData(details.steps ?? []) };
              }
              const thumb = extractPhotoThumbnail(details.steps ?? []);
              return { id: wf.workflow_id, thumbnail_url: thumb ?? '' };
            })
          );
          for (const r of results) {
            if (r.status === 'fulfilled' && r.value) {
              const { id, ...data } = r.value;
              enriched[id] = data;
            }
          }
          // Save incrementally so partial results are available
          saveCache(valid, enriched);
        }
      } catch (e) {
        // Prefetch is best-effort, don't surface errors
        if (import.meta.env.DEV) console.warn('[Prefetch] generation history prefetch failed:', e);
      }
    })();

    return () => { cancelled = true; };
  }, [user]);
}
