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

// ── Types ─────────────────────────────────────────────────────────────────

export interface TrackedGeneration {
  workflowId: string;
  status: 'running' | 'completed' | 'failed';
  progress: number;
  generationStep: string;
  resultImages: string[];
  isProductShot: boolean;
  jewelryType: string;
  startedAt: number;
  statusUrl: string;
  resultUrl: string;
}

export interface TrackGenerationParams {
  workflowId: string;
  isProductShot: boolean;
  jewelryType: string;
  statusUrl: string;
  resultUrl: string;
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
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      for (const candidate of ['output_url', 'image_url', 'result_url', 'url', 'output_image']) {
        const val = obj[candidate];
        if (typeof val !== 'string' || val.length === 0) continue;
        if (val.startsWith('azure://')) return [azureUriToUrl(val)];
        if (val.startsWith('http') || val.startsWith('data:')) return [val];
      }

      const b64 = obj['image_b64'];
      if (typeof b64 === 'string' && b64.length > 0) {
        const mime = typeof obj['mime_type'] === 'string' ? obj['mime_type'] : 'image/jpeg';
        return [`data:${mime};base64,${b64}`];
      }
    }
  }

  return [];
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
        isProductShot: params.isProductShot,
        jewelryType: params.jewelryType,
        startedAt: Date.now(),
        statusUrl: params.statusUrl,
        resultUrl: params.resultUrl,
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
        fetchStatus: () => authenticatedFetch(gen.statusUrl),
        fetchResult: () => authenticatedFetch(gen.resultUrl),
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
        timeoutMs: 720_000,
        max404s: Number.MAX_SAFE_INTEGER,
        maxPollErrors: 10,
        maxResultRetries: 6,
        resultRetryDelayMs: 1000,
        signal: ctrl.signal,
      }).then(pollResult => {
        clearInterval(ticker);
        if (pollResult.status === 'cancelled') return;

        const result = pollResult.result;

        // Extract images first — if we got output images the generation succeeded regardless
        // of what other keys exist in the result (handles _2k/_4k workflows with different node names).
        const resultImages = extractResultImages(result);

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
            ? { ...g, status: 'completed', progress: 100, resultImages }
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
                state: { asyncResult: { workflowId: gen.workflowId, resultImages }, mode: gen.isProductShot ? 'product-shot' : 'model-shot' },
              })}
            >
              View Results
            </ToastAction>
          ),
        });
      }).catch(err => {
        clearInterval(ticker);
        if (err?.name === 'AbortError') return;
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
