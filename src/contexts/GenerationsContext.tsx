import React, { createContext, useContext, useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCredits } from '@/contexts/CreditsContext';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { pollWorkflow } from '@/lib/poll-workflow';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { markGenerationCompleted, markGenerationFailed } from '@/lib/generation-lifecycle';
import { azureUriToUrl } from '@/lib/azure-utils';
import type { PhotoshootResultResponse } from '@/lib/photoshoot-api';
import type { Resolution } from '@/components/studio/OutputSettingsPills';
import { getWorkflowDetails } from '@/lib/generation-history-api';
import { extractPhotoThumbnail, extractProductShotThumbnail } from '@/lib/generation-enrichment';

const STUDIO_RESULT_RETRY_DELAY_MS = 3000;
// 4K workflows can reach "completed" before the result payload is readable.
// Keep the status poll bounded separately and only extend this post-completion lag window.
const STUDIO_RESULT_MAX_RETRIES = 100;
// Default poll ceiling for photoshoot/fix runs. Slow workflows (e.g. upscale)
// override this via TrackGenerationParams.timeoutMs.
const DEFAULT_POLL_TIMEOUT_MS = 720_000;

// ── Types ─────────────────────────────────────────────────────────────────

export interface TrackedGeneration {
  workflowId: string;
  status: 'running' | 'completed' | 'failed';
  progress: number;
  generationStep: string;
  resultImages: string[];
  jewelryUrl: string;
  modelUrl: string;
  isProductShot: boolean;
  jewelryType: string;
  startedAt: number;
  aspectRatio: string;
  resolution: Resolution;
  generationCost: number | null;
  jewelryDescription?: string;
  /** Poll ceiling for this run. Defaults to DEFAULT_POLL_TIMEOUT_MS when omitted. */
  timeoutMs?: number;
}

export interface TrackGenerationParams {
  workflowId: string;
  isProductShot: boolean;
  jewelryType: string;
  jewelryUrl: string;
  modelUrl: string;
  aspectRatio: string;
  resolution: Resolution;
  generationCost: number | null;
  /** Override the poll ceiling for slow workflows (e.g. upscale). */
  timeoutMs?: number;
}

export interface GenerationsContextValue {
  generations: TrackedGeneration[];
  trackGeneration: (params: TrackGenerationParams) => void;
  clearGeneration: (workflowId: string) => void;
}

// Exported for testing — allows wrapping with a controlled value in tests.
export const GenerationsContext = createContext<GenerationsContextValue | null>(null);

// ── Result extraction ────────────────────────────────────────────────────
// Moved here from useStudioGeneration.ts (Phase 1 spec).

function normalizeResultImage(value: string): string | null {
  if (!value) return null;
  if (value.startsWith('azure://')) return azureUriToUrl(value);
  if (value.startsWith('http') || value.startsWith('data:') || value.startsWith('blob:')) return value;
  return null;
}

function findNestedResultImage(item: unknown): string | null {
  if (!item || typeof item !== 'object') return null;
  if (Array.isArray(item)) {
    for (const child of item) {
      const found = findNestedResultImage(child);
      if (found) return found;
    }
    return null;
  }

  const record = item as Record<string, unknown>;

  for (const candidate of ['output_url', 'image_url', 'result_url', 'url', 'uri']) {
    const value = record[candidate];
    if (typeof value !== 'string' || value.length === 0) continue;
    const normalized = normalizeResultImage(value);
    if (normalized) return normalized;
  }

  const b64 = record['image_b64'];
  if (typeof b64 === 'string' && b64.length > 0) {
    const mime = typeof record['mime_type'] === 'string' ? record['mime_type'] : 'image/jpeg';
    return `data:${mime};base64,${b64}`;
  }

  for (const value of Object.values(record)) {
    const found = findNestedResultImage(value);
    if (found) return found;
  }

  return null;
}

function extractJewelryDescription(result: PhotoshootResultResponse): string | undefined {
  for (const [key, items] of Object.entries(result)) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      if (typeof rec['description'] === 'string' && rec['description'].length > 0) {
        console.log(`[extractJewelryDescription] found in node "${key}":`, rec['description']);
        return rec['description'];
      }
    }
  }
  console.warn('[extractJewelryDescription] no description found in result. Keys:', Object.keys(result));
  return undefined;
}

function extractResultImages(result: PhotoshootResultResponse): string[] {
  const preferredKeys = [
    'output',
    'generate',
    'generate_image',
    'generate_images',
    'result',
  ];
  const orderedResultKeys = [
    ...preferredKeys.filter(key => key in result),
    ...Object.keys(result).filter(key => !preferredKeys.includes(key)),
  ];

  for (const key of orderedResultKeys) {
    const items = result[key];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const found = findNestedResultImage(item);
      if (found) return [found];
    }
  }

  return [];
}

async function fallbackResultImagesFromHistory(
  workflowId: string,
  isProductShot: boolean,
): Promise<string[]> {
  const details = await getWorkflowDetails(workflowId);
  const image = isProductShot
    ? extractProductShotThumbnail(details.steps ?? [])
    : extractPhotoThumbnail(details.steps ?? []);
  return image ? [image] : [];
}

// ── Provider ─────────────────────────────────────────────────────────────

export function GenerationsContextProvider({ children }: { children: React.ReactNode }) {
  const [generations, setGenerations] = useState<TrackedGeneration[]>([]);
  const controllers = useRef<Map<string, AbortController>>(new Map());
  const { refreshCredits } = useCredits();
  const { toast } = useToast();
  const navigate = useNavigate();

  const trackGeneration = useCallback((params: TrackGenerationParams) => {
    setGenerations(prev => [
      ...prev,
      {
        workflowId: params.workflowId,
        status: 'running',
        progress: 35,
        generationStep: 'Generating photoshoot...',
        resultImages: [],
        jewelryUrl: params.jewelryUrl,
        modelUrl: params.modelUrl,
        isProductShot: params.isProductShot,
        jewelryType: params.jewelryType,
        startedAt: Date.now(),
        aspectRatio: params.aspectRatio,
        resolution: params.resolution,
        generationCost: params.generationCost,
        ...(params.timeoutMs ? { timeoutMs: params.timeoutMs } : {}),
      },
    ]);
  }, []);

  const clearGeneration = useCallback((workflowId: string) => {
    const ctrl = controllers.current.get(workflowId);
    if (ctrl) {
      ctrl.abort();
      controllers.current.delete(workflowId);
    }
    setGenerations(prev => prev.filter(g => g.workflowId !== workflowId));
  }, []);

  // Start polling for any newly-tracked running generation.
  // Uses the running workflowId set as dep so progress-tick re-renders don't restart polls.
  const runningKey = generations
    .filter(g => g.status === 'running')
    .map(g => g.workflowId)
    .join(',');

  useEffect(() => {
    const running = generations.filter(g => g.status === 'running');

    for (const gen of running) {
      if (controllers.current.has(gen.workflowId)) continue;

      const ctrl = new AbortController();
      controllers.current.set(gen.workflowId, ctrl);
      const startTime = gen.startedAt;

      // Smooth progress animation while polling
      const ticker = setInterval(() => {
        setGenerations(prev => prev.map(g => {
          if (g.workflowId !== gen.workflowId || g.status !== 'running') return g;
          return { ...g, progress: Math.min(g.progress + Math.max((90 - g.progress) * 0.04, 0.1), 90) };
        }));
      }, 300);

      pollWorkflow<PhotoshootResultResponse>({
        mode: 'status-then-result',
        fetchStatus: () => authenticatedFetch(`/api/status/${gen.workflowId}`),
        fetchResult: () => authenticatedFetch(`/api/result/${gen.workflowId}`),
        onStatusData: (statusData: unknown) => {
          const s = statusData as { progress?: { total_nodes?: number; completed_nodes?: number; visited?: string[] } };
          if (!s.progress) return;
          const total = s.progress.total_nodes || 1;
          const done = s.progress.completed_nodes || 0;
          const realPct = Math.min(35 + Math.round((done / total) * 60), 95);
          const visited = s.progress.visited ?? [];
          const step = visited.length > 0 ? visited[visited.length - 1].replace(/_/g, ' ') : 'Generating photoshoot...';
          setGenerations(prev => prev.map(g =>
            g.workflowId === gen.workflowId
              ? { ...g, progress: Math.max(g.progress, realPct), generationStep: step }
              : g
          ));
        },
        parseResult: (d) => d as PhotoshootResultResponse,
        intervalMs: 3000,
        timeoutMs: gen.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS,
        max404s: Number.MAX_SAFE_INTEGER,
        maxPollErrors: 1,
        maxResultRetries: STUDIO_RESULT_MAX_RETRIES,
        resultRetryDelayMs: STUDIO_RESULT_RETRY_DELAY_MS,
        signal: ctrl.signal,
      }).then(async pollResult => {
        clearInterval(ticker);
        if (pollResult.status === 'cancelled') return;

        const result = pollResult.result;

        // Extract images first — if we got output images the generation succeeded regardless
        // of what other keys exist in the result (handles _2k/_4k workflows with different node names).
        const resultImages = extractResultImages(result);
        if (gen.isProductShot) console.log('[product-shot result keys]', Object.keys(result), result);
        const jewelryDescription = gen.isProductShot ? extractJewelryDescription(result) : undefined;

        // Only check for activity errors when no images were produced.
        // Prefer targeted key lookup; only fall back to scanning all values when those keys are absent.
        const hasActivityError = resultImages.length === 0 && (() => {
          const generateItems = (result['generate'] ?? result['generate_image'] ?? []) as unknown[];
          if (Array.isArray(generateItems) && generateItems.length > 0) {
            return generateItems.some((i: any) => i?.action === 'error' || i?.status === 'failed');
          }
          return Object.values(result).some(
            (items) => Array.isArray(items) && items.some((i: any) => i?.action === 'error' || i?.status === 'failed')
          );
        })();

        if (hasActivityError) {
          try {
            const fallbackImages = await fallbackResultImagesFromHistory(gen.workflowId, gen.isProductShot);
            if (fallbackImages.length > 0) {
              const duration = Math.round((Date.now() - startTime) / 1000);
              const label = gen.jewelryType.charAt(0).toUpperCase() + gen.jewelryType.slice(1);
              setGenerations(prev => prev.map(g =>
                g.workflowId === gen.workflowId
                  ? { ...g, status: 'completed', progress: 100, resultImages: fallbackImages }
                  : g
              ));
              markGenerationCompleted(gen.workflowId, startTime);
              refreshCredits();
              controllers.current.delete(gen.workflowId);
              toast({
                title: 'Your photoshoot is ready',
                description: `${label} · ${duration}s`,
                action: (
                  <ToastAction
                    altText="View Results"
                    onClick={() => navigate(`/studio/${gen.jewelryType}`, {
                      state: {
                        asyncResult: {
                          workflowId: gen.workflowId,
                          resultImages: fallbackImages,
                          aspectRatio: gen.aspectRatio,
                          resolution: gen.resolution,
                          generationCost: gen.generationCost,
                        },
                      },
                    })}
                  >
                    View Results
                  </ToastAction>
                ),
              });
              return;
            }
          } catch {
            // Fall through to the normal failure path below if history details do not help.
          }

          setGenerations(prev => prev.map(g =>
            g.workflowId === gen.workflowId ? { ...g, status: 'failed' } : g
          ));
          markGenerationFailed(gen.workflowId, 'workflow-failed', startTime);
          controllers.current.delete(gen.workflowId);
          toast({ variant: 'destructive', title: 'Generation failed', description: 'Try again from the studio' });
          return;
        }
        const duration = Math.round((Date.now() - startTime) / 1000);
        const label = gen.jewelryType.charAt(0).toUpperCase() + gen.jewelryType.slice(1);

        setGenerations(prev => prev.map(g =>
          g.workflowId === gen.workflowId
            ? { ...g, status: 'completed', progress: 100, resultImages, ...(jewelryDescription ? { jewelryDescription } : {}) }
            : g
        ));
        markGenerationCompleted(gen.workflowId, startTime);
        refreshCredits();
        controllers.current.delete(gen.workflowId);

        toast({
          title: 'Your photoshoot is ready',
          description: `${label} · ${duration}s`,
          action: (
            <ToastAction
              altText="View Results"
              onClick={() => navigate(`/studio/${gen.jewelryType}`, {
                state: {
                  asyncResult: {
                    workflowId: gen.workflowId,
                    resultImages,
                    aspectRatio: gen.aspectRatio,
                    resolution: gen.resolution,
                    generationCost: gen.generationCost,
                  },
                },
              })}
            >
              View Results
            </ToastAction>
          ),
        });
      }).catch(async err => {
        clearInterval(ticker);
        if (err?.name === 'AbortError') return;

        try {
          const fallbackImages = await fallbackResultImagesFromHistory(gen.workflowId, gen.isProductShot);
          if (fallbackImages.length > 0) {
            const duration = Math.round((Date.now() - startTime) / 1000);
            const label = gen.jewelryType.charAt(0).toUpperCase() + gen.jewelryType.slice(1);
            setGenerations(prev => prev.map(g =>
              g.workflowId === gen.workflowId
                ? { ...g, status: 'completed', progress: 100, resultImages: fallbackImages }
                : g
            ));
            markGenerationCompleted(gen.workflowId, startTime);
            refreshCredits();
            controllers.current.delete(gen.workflowId);
            toast({
              title: 'Your photoshoot is ready',
              description: `${label} · ${duration}s`,
              action: (
                <ToastAction
                  altText="View Results"
                  onClick={() => navigate(`/studio/${gen.jewelryType}`, {
                    state: {
                      asyncResult: {
                        workflowId: gen.workflowId,
                        resultImages: fallbackImages,
                        aspectRatio: gen.aspectRatio,
                        resolution: gen.resolution,
                        generationCost: gen.generationCost,
                      },
                    },
                  })}
                >
                  View Results
                </ToastAction>
              ),
            });
            return;
          }
        } catch {
          // Fall through to the normal failure path below if history details do not help.
        }

        setGenerations(prev => prev.map(g =>
          g.workflowId === gen.workflowId ? { ...g, status: 'failed' } : g
        ));
        markGenerationFailed(gen.workflowId, err?.message, startTime);
        controllers.current.delete(gen.workflowId);
        toast({ variant: 'destructive', title: 'Generation failed', description: 'Try again from the studio' });
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // Deps excluded: runningKey only. The effect body also captures refreshCredits, toast, and navigate.
  // These are intentionally excluded because:
  //   - refreshCredits and toast are stable refs (guaranteed by CreditsContext and useToast contracts).
  //   - navigate is stable across renders per react-router-dom v6.
  //   - Re-running the effect when these change would restart polling for already-running generations.
  // runningKey is the correct dep: it changes only when the set of running workflowIds changes,
  // not on 300 ms progress ticks — this prevents the effect from restarting active polls.
  // Regression to watch: if refreshCredits, toast, or navigate ever lose stability (e.g. wrapped in
  // an unstable closure), completions will silently use stale refs. Verify their memoization if credits
  // stop refreshing or toasts stop firing after completion.
  // Also watch: if runningKey doesn't update when a new workflowId is added, the new generation
  // won't start polling. Always verify trackGeneration triggers a re-run.
  }, [runningKey]);

  // Abort all controllers on provider unmount
  useEffect(() => {
    return () => {
      for (const ctrl of controllers.current.values()) ctrl.abort();
      controllers.current.clear();
    };
  }, []);

  return (
    <GenerationsContext.Provider value={{ generations, trackGeneration, clearGeneration }}>
      {children}
    </GenerationsContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────

export function useGenerations(): GenerationsContextValue {
  const ctx = useContext(GenerationsContext);
  if (!ctx) throw new Error('useGenerations must be used inside GenerationsContextProvider');
  return ctx;
}
