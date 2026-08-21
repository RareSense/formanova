import React, { createContext, useContext, useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCredits } from '@/contexts/CreditsContext';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { CAD_RESTORE_SRC_PARAM, type CadRestoreEntry } from '@/lib/cad-analytics';
import { pollWorkflow } from '@/lib/poll-workflow';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { markGenerationCompleted, markGenerationFailed } from '@/lib/generation-lifecycle';
import { azureUriToUrl } from '@/lib/azure-utils';
import type { PhotoshootResultResponse } from '@/lib/photoshoot-api';
import type { Resolution } from '@/components/studio/OutputSettingsPills';
import { getWorkflowDetails } from '@/lib/generation-history-api';
import {
  RING_CAD_POLL_TIMEOUT_MS,
  isRingCadRepairing,
  parseRingCadFailure,
  parseRingCadResult,
  ringCadProgressFraction,
} from '@/lib/ring-cad-nurbs-api';
import { extractPhotoThumbnail, extractProductShotThumbnail } from '@/lib/generation-enrichment';

const STUDIO_RESULT_RETRY_DELAY_MS = 3000;
// 4K workflows can reach "completed" before the result payload is readable.
// Keep the status poll bounded separately and only extend this post-completion lag window.
const STUDIO_RESULT_MAX_RETRIES = 100;
// Default poll ceiling for photoshoot/fix runs. Slow workflows (e.g. upscale)
// override this via TrackGenerationParams.timeoutMs.
const DEFAULT_POLL_TIMEOUT_MS = 720_000;
const CAD_TRACKING_STORAGE_KEY = 'formanova_running_cad_v1';
const CAD_TRACKING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface PersistedCadGeneration {
  workflowId: string;
  startedAt: number;
  cadRoute: '/text-to-cad' | '/image-to-cad';
  timeoutMs: number;
}

function loadPersistedCadGenerations(): TrackedGeneration[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CAD_TRACKING_STORAGE_KEY);
    if (!raw) return [];
    const now = Date.now();
    const rows = JSON.parse(raw) as PersistedCadGeneration[];
    if (!Array.isArray(rows)) return [];
    return rows
      .filter(row =>
        typeof row?.workflowId === 'string' &&
        typeof row?.startedAt === 'number' &&
        now - row.startedAt < CAD_TRACKING_MAX_AGE_MS
      )
      .map(row => ({
        kind: 'cad' as const,
        workflowId: row.workflowId,
        status: 'running' as const,
        progress: 5,
        generationStep: 'Reconnecting to your CAD...',
        resultImages: [],
        outputAssetId: null,
        jewelryUrl: '',
        modelUrl: '',
        isProductShot: false,
        jewelryType: 'ring',
        startedAt: row.startedAt,
        aspectRatio: '1:1',
        resolution: '1K' as Resolution,
        generationCost: null,
        glbUrl: null,
        threedmUrl: null,
        cadRoute: row.cadRoute ?? '/image-to-cad',
        timeoutMs: row.timeoutMs ?? RING_CAD_POLL_TIMEOUT_MS,
      }));
  } catch {
    try { localStorage.removeItem(CAD_TRACKING_STORAGE_KEY); } catch { /* unavailable storage */ }
    return [];
  }
}

/**
 * Deep link that restores a finished CAD run into the workspace it was
 * started from. Both TextToCAD and ImageToCAD read ?glb= and ?workflow_id=
 * on mount and seed the viewport; cadRoute picks which page to land on.
 *
 * `entry` stamps the link with where it came from, and it is REQUIRED on
 * purpose. The completion email links to this exact same URL shape, so the two
 * were previously indistinguishable. Rather than depend on backend tagging the
 * email, we tag every link we generate ourselves and treat an unmarked arrival
 * as external -- see CAD_RESTORE_SRC_PARAM in @/lib/cad-analytics.
 *
 * That inference only holds while every internal navigation is marked. Making
 * the argument required means a new CAD restore link that forgets it fails to
 * compile, instead of quietly inflating the external (email) count. If you are
 * adding one, call this builder rather than assembling params by hand.
 */
export function buildCadRestorePath(
  workflowId: string,
  glbUrl: string | null,
  cadRoute: '/text-to-cad' | '/image-to-cad' = '/image-to-cad',
  entry: Exclude<CadRestoreEntry, 'external'> = 'toast',
): string {
  const params = new URLSearchParams({ workflow_id: workflowId });
  if (glbUrl) params.set('glb', glbUrl);
  params.set(CAD_RESTORE_SRC_PARAM, entry);
  return `${cadRoute}?${params.toString()}`;
}

// ── Types ─────────────────────────────────────────────────────────────────

export interface TrackedGeneration {
  workflowId: string;
  status: 'running' | 'completed' | 'failed';
  progress: number;
  generationStep: string;
  resultImages: string[];
  jewelryUrl: string;
  /** High Effort: the full cover-first jewelry angle set, when known. Falls back
   *  to [jewelryUrl] downstream. Optional — absent on older/simple runs. */
  jewelryUrls?: string[];
  modelUrl: string;
  isProductShot: boolean;
  jewelryType: string;
  startedAt: number;
  aspectRatio: string;
  resolution: Resolution;
  generationCost: number | null;
  jewelryDescription?: string;
  /**
   * Vault asset id of this run's output image, read top-level from /result on
   * completion (generic across model-shot/PDP/fix/upscale). Undefined for
   * history-fallback / error paths and for old items whose /result predates the
   * field. Consumed as the fix `source_asset_id` so a fix prices/runs at the tier
   * of the exact asset being fixed (including an already-upscaled one).
   */
  outputAssetId?: string | null;
  /** Poll ceiling for this run. Defaults to DEFAULT_POLL_TIMEOUT_MS when omitted. */
  timeoutMs?: number;
  /**
   * For derivative runs (e.g. upscale): the original generation this was derived
   * from. Restore paths re-anchor the studio to this id so feedback, category, and
   * inputs stay tied to the source photoshoot rather than the upscale workflow.
   */
  parentWorkflowId?: string;
  /** Original model/reference image of the parent generation (upscale carries this). */
  parentModelUrl?: string;
  /**
   * Which pipeline this run belongs to. Absent means 'photoshoot' so every
   * existing row and call site keeps its current meaning.
   */
  kind?: GenerationKind;
  /** CAD only: GLB preview url, used to restore the viewport. */
  glbUrl?: string | null;
  /** CAD only: the machinable NURBS .3dm deliverable. */
  threedmUrl?: string | null;
  /** CAD only: label for the completion toast. */
  label?: string;
  /** CAD only: which page started this run, so restore paths return to the right one. */
  cadRoute?: '/text-to-cad' | '/image-to-cad';
}

export type GenerationKind = 'photoshoot' | 'cad';

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
  /** Original generation id when this run is a derivative (upscale). */
  parentWorkflowId?: string;
  /** Original model/reference image of the parent generation. */
  parentModelUrl?: string;
}

/**
 * Image-to-3D run. CAD produces a GLB preview and a NURBS .3dm rather than
 * images, so it shares only the queue, the header indicator and the completion
 * toast with photoshoots - never their result shape.
 */
export interface TrackCadGenerationParams {
  workflowId: string;
  /** Shown in the completion toast so a user with several runs can tell them apart. */
  label?: string;
  /** Poll ceiling; ring_cad_nurbs_v1 runs can take up to 90 minutes. */
  timeoutMs?: number;
  /** Which page started this run, so restore paths return to the right one. */
  cadRoute?: '/text-to-cad' | '/image-to-cad';
}

export interface GenerationsContextValue {
  generations: TrackedGeneration[];
  trackGeneration: (params: TrackGenerationParams) => void;
  trackCadGeneration: (params: TrackCadGenerationParams) => void;
  clearGeneration: (workflowId: string) => void;
}

// Exported for testing — allows wrapping with a controlled value in tests.
export const GenerationsContext = createContext<GenerationsContextValue | null>(null);

// ── Result extraction ────────────────────────────────────────────────────
// Moved here from useStudioGeneration.ts (Phase 1 spec).

function normalizeResultImage(value: string): string | null {
  if (!value) return null;
  // Route every candidate through azureUriToUrl so a content-addressed blob URL
  // (azure:// OR a raw https blob host) collapses to the same-origin artifact
  // proxy. data:/blob:/non-artifact URLs pass through unchanged.
  if (value.startsWith('azure://') || value.startsWith('http')) return azureUriToUrl(value);
  if (value.startsWith('data:') || value.startsWith('blob:')) return value;
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

function extractOutputAssetId(result: PhotoshootResultResponse): string | null {
  const r = result as unknown as Record<string, unknown>;
  if (typeof r.output_asset_id === 'string') return r.output_asset_id;
  for (const items of Object.values(r)) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const entry = item as Record<string, unknown>;
      if (typeof entry.output_asset_id === 'string') return entry.output_asset_id;
      if (entry.output_asset && typeof entry.output_asset === 'object') {
        const oa = entry.output_asset as Record<string, unknown>;
        if (typeof oa.id === 'string') return oa.id;
      }
    }
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
        if (import.meta.env.DEV) console.log(`[extractJewelryDescription] found in node "${key}":`, rec['description']);
        return rec['description'];
      }
    }
  }
  // Absent is the normal case for upscale/fix/PDP results (no description node);
  // only some model-shot generations emit one. Dev-only, not a production warning.
  if (import.meta.env.DEV) {
    console.debug('[extractJewelryDescription] no description node in result (expected for upscale/fix/pdp). Keys:', Object.keys(result));
  }
  return undefined;
}

// Prepare/analyze nodes now emit input images (jewelry/inspiration) as CAS refs
// too (see prepare->generate CAS handoff), so their result keys must be skipped
// here — otherwise an input image's uri gets picked up as if it were the output.
function isInputStageKey(key: string): boolean {
  const lower = key.toLowerCase();
  return lower.includes('prepare') || lower.includes('analyze');
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
    ...Object.keys(result).filter(key => !preferredKeys.includes(key) && !isInputStageKey(key)),
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
  const [generations, setGenerations] = useState<TrackedGeneration[]>(loadPersistedCadGenerations);
  const generationsRef = useRef<TrackedGeneration[]>(generations);
  const controllers = useRef<Map<string, AbortController>>(new Map());
  const settledCadIds = useRef<Set<string>>(new Set());
  const reconcilingCadIds = useRef<Set<string>>(new Set());
  const { refreshCredits } = useCredits();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    generationsRef.current = generations;
  }, [generations]);

  const trackGeneration = useCallback((params: TrackGenerationParams) => {
    setGenerations(prev => [
      ...prev,
      {
        workflowId: params.workflowId,
        status: 'running',
        progress: 35,
        generationStep: 'Generating photoshoot...',
        resultImages: [],
        outputAssetId: null,
        jewelryUrl: params.jewelryUrl,
        modelUrl: params.modelUrl,
        isProductShot: params.isProductShot,
        jewelryType: params.jewelryType,
        startedAt: Date.now(),
        aspectRatio: params.aspectRatio,
        resolution: params.resolution,
        generationCost: params.generationCost,
        ...(params.timeoutMs ? { timeoutMs: params.timeoutMs } : {}),
        ...(params.parentWorkflowId ? { parentWorkflowId: params.parentWorkflowId } : {}),
        ...(params.parentModelUrl ? { parentModelUrl: params.parentModelUrl } : {}),
      },
    ]);
  }, []);

  /**
   * Queues an Image-to-3D run. Photoshoot-shaped fields are filled with inert
   * defaults so the shared queue, header indicator and toast keep working
   * without every consumer having to special-case CAD.
   */
  const trackCadGeneration = useCallback((params: TrackCadGenerationParams) => {
    setGenerations(prev => {
      const next: TrackedGeneration = {
        kind: 'cad',
        workflowId: params.workflowId,
        status: 'running',
        progress: 5,
        generationStep: 'Analyzing your design...',
        resultImages: [],
        outputAssetId: null,
        jewelryUrl: '',
        modelUrl: '',
        isProductShot: false,
        jewelryType: 'ring',
        startedAt: Date.now(),
        aspectRatio: '1:1',
        resolution: '1K' as Resolution,
        generationCost: null,
        glbUrl: null,
        threedmUrl: null,
        ...(params.label ? { label: params.label } : {}),
        cadRoute: params.cadRoute ?? '/image-to-cad',
        timeoutMs: params.timeoutMs ?? RING_CAD_POLL_TIMEOUT_MS,
      };
      return [...prev.filter(g => g.workflowId !== params.workflowId), next];
    });
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
  /**
   * Poll loop for Image-to-3D runs. Mirrors the photoshoot loop's lifecycle
   * (ticker cleared on abort, controller removed on settle, credits refreshed,
   * toast with a restore action) but uses the CAD status/result contract.
   */
  const pollCadGeneration = useCallback((
    gen: TrackedGeneration,
    ctrl: AbortController,
    startTime: number,
  ) => {
    // Runs take 10-45 minutes, so ease the bar toward 90 to show liveness.
    const ticker = setInterval(() => {
      setGenerations(prev => prev.map(g => {
        if (g.workflowId !== gen.workflowId || g.status !== 'running') return g;
        return { ...g, progress: Math.min(g.progress + Math.max((90 - g.progress) * 0.01, 0.05), 90) };
      }));
    }, 1000);
    ctrl.signal.addEventListener('abort', () => clearInterval(ticker), { once: true });

    pollWorkflow<unknown>({
      mode: 'status-then-result',
      fetchStatus: () => authenticatedFetch(`/api/status/${gen.workflowId}`, { signal: ctrl.signal }),
      // /result blocks until the run finishes, so it is fetched once, after
      // status reports terminal - never as a poll.
      fetchResult: () => authenticatedFetch(`/api/result/${gen.workflowId}`),
      resolveState: (statusData) => {
        const s = statusData as { runtime?: { state?: string } };
        return (s.runtime?.state || 'unknown').toLowerCase();
      },
      onStatusData: (statusData) => {
        const pct = Math.round(ringCadProgressFraction(statusData) * 90);
        const step = isRingCadRepairing(statusData) ? 'Fixing the model...' : 'Building your CAD...';
        setGenerations(prev => prev.map(g =>
          g.workflowId === gen.workflowId
            ? { ...g, progress: Math.max(g.progress, pct), generationStep: step }
            : g
        ));
      },
      parseResult: (d) => d,
      intervalMs: 5000,
      timeoutMs: gen.timeoutMs ?? RING_CAD_POLL_TIMEOUT_MS,
      max404s: 13,
      maxPollErrors: 10,
      maxResultRetries: 1,
      signal: ctrl.signal,
    }).then(pollResult => {
      clearInterval(ticker);
      if (pollResult.status === 'cancelled') return;
      if (settledCadIds.current.has(gen.workflowId)) return;
      settledCadIds.current.add(gen.workflowId);
      controllers.current.delete(gen.workflowId);

      const raw = pollResult.result;

      // /status already reported runtime.state "completed" - pollWorkflow only
      // resolves here on that signal (a "failed" state throws and is caught
      // below instead). The /result body's own ok/status fields are not part
      // of the documented contract, so the real success check is whether a
      // model artifact is actually present - falling back through whatever
      // stage did produce one, same as parseRingCadResult already does.
      let parsed: ReturnType<typeof parseRingCadResult>;
      try {
        parsed = parseRingCadResult(raw);
      } catch {
        const failure = parseRingCadFailure(raw);
        setGenerations(prev => prev.map(g =>
          g.workflowId === gen.workflowId ? { ...g, status: 'failed', progress: 100 } : g
        ));
        markGenerationFailed(gen.workflowId, failure.userMessage ?? 'CAD run failed', startTime);
        // A failed run releases the entire credit hold.
        refreshCredits();
        toast({
          title: 'Your CAD could not be generated',
          description: failure.userMessage
            ?? 'The run did not complete. Your credits were not charged.',
          variant: 'destructive',
        });
        return;
      }
      const duration = Math.round((Date.now() - startTime) / 1000);
      setGenerations(prev => prev.map(g =>
        g.workflowId === gen.workflowId
          ? {
              ...g,
              status: 'completed',
              progress: 100,
              glbUrl: parsed.glbUrl,
              threedmUrl: parsed.threedmArtifact?.url ?? null,
            }
          : g
      ));
      markGenerationCompleted(gen.workflowId, startTime);
      refreshCredits();

      toast({
        title: 'Your CAD is ready',
        description: `${gen.label ?? 'Image to CAD'} · ${duration}s`,
        action: (
          <ToastAction
            altText="View Result"
            onClick={() => navigate(buildCadRestorePath(gen.workflowId, parsed.glbUrl, gen.cadRoute, 'toast'))}
          >
            View Result
          </ToastAction>
        ),
      });
    }).catch(err => {
      clearInterval(ticker);
      controllers.current.delete(gen.workflowId);
      if (ctrl.signal.aborted) return;
      console.error('[GenerationsContext] CAD poll failed:', err);
      setGenerations(prev => prev.map(g =>
        g.workflowId === gen.workflowId ? { ...g, status: 'failed', progress: 100 } : g
      ));
      markGenerationFailed(gen.workflowId, 'CAD poll failed', startTime);
      refreshCredits();
      toast({
        title: 'Your CAD could not be generated',
        description: 'The run did not complete. Your credits were not charged.',
        variant: 'destructive',
      });
    });
  }, [navigate, refreshCredits, toast]);

  const runningKey = generations
    .filter(g => g.status === 'running')
    .map(g => g.workflowId)
    .join(',');

  // Persist only the minimum needed to reconnect CAD polling after a refresh
  // or browser restart. Prompts and artifact URLs are deliberately excluded.
  const persistedCadKey = JSON.stringify(
    generations
      .filter(g => g.kind === 'cad' && g.status === 'running')
      .map(g => ({
        workflowId: g.workflowId,
        startedAt: g.startedAt,
        cadRoute: g.cadRoute ?? '/image-to-cad',
        timeoutMs: g.timeoutMs ?? RING_CAD_POLL_TIMEOUT_MS,
      })),
  );

  useEffect(() => {
    try {
      const rows = JSON.parse(persistedCadKey) as PersistedCadGeneration[];
      if (rows.length > 0) localStorage.setItem(CAD_TRACKING_STORAGE_KEY, persistedCadKey);
      else localStorage.removeItem(CAD_TRACKING_STORAGE_KEY);
    } catch {
      // Storage is best-effort; the live poll remains authoritative.
    }
  }, [persistedCadKey]);

  // Browser background throttling, transient poll failures, or a stale tab
  // must never leave a terminal backend workflow displayed as "Generating".
  // Reconcile independently of the long poll on an interval and whenever the
  // user returns to the tab.
  const reconcileCadGenerations = useCallback(async () => {
    const runningCad = generationsRef.current.filter(g => g.kind === 'cad' && g.status === 'running');
    for (const gen of runningCad) {
      if (settledCadIds.current.has(gen.workflowId) || reconcilingCadIds.current.has(gen.workflowId)) continue;
      reconcilingCadIds.current.add(gen.workflowId);
      try {
        const statusResponse = await authenticatedFetch(`/api/status/${gen.workflowId}`);
        if (!statusResponse.ok) continue;
        const statusData = await statusResponse.json() as { runtime?: { state?: string } };
        const state = (statusData.runtime?.state ?? '').toLowerCase();
        if (state === 'completed') {
          settledCadIds.current.add(gen.workflowId);
          controllers.current.get(gen.workflowId)?.abort();
          controllers.current.delete(gen.workflowId);

          // Terminal backend state clears the running UI immediately. Result
          // hydration is a separate bounded operation and must never keep the
          // generation spinner alive.
          setGenerations(prev => prev.map(g =>
            g.workflowId === gen.workflowId
              ? { ...g, status: 'completed', progress: 100, generationStep: 'Loading completed result...' }
              : g
          ));
          markGenerationCompleted(gen.workflowId, gen.startedAt);
          refreshCredits();

          let parsed: ReturnType<typeof parseRingCadResult> | null = null;
          const resultController = new AbortController();
          const resultTimeout = window.setTimeout(() => resultController.abort(), 15_000);
          try {
            const resultResponse = await authenticatedFetch(`/api/result/${gen.workflowId}`, {
              signal: resultController.signal,
            });
            if (resultResponse.ok) parsed = parseRingCadResult(await resultResponse.json());
          } catch {
            // Completion is still terminal. The restore link will retry result loading.
          } finally {
            window.clearTimeout(resultTimeout);
          }

          setGenerations(prev => prev.map(g =>
            g.workflowId === gen.workflowId
              ? {
                  ...g,
                  status: 'completed',
                  progress: 100,
                  generationStep: parsed ? 'Completed' : 'Completed — result unavailable',
                  glbUrl: parsed?.glbUrl ?? null,
                  threedmUrl: parsed?.threedmArtifact?.url ?? null,
                }
              : g
          ));
          toast({
            title: parsed ? 'Your CAD is ready' : 'Your CAD finished',
            description: parsed
              ? (gen.label ?? 'Open the completed CAD result')
              : 'The result could not be loaded yet. Open it to retry.',
            action: (
              <ToastAction
                altText="View Result"
                onClick={() => navigate(buildCadRestorePath(gen.workflowId, parsed?.glbUrl ?? null, gen.cadRoute, 'toast'))}
              >
                View Result
              </ToastAction>
            ),
          });
          continue;
        }

        if (['failed', 'cancelled', 'canceled', 'timed_out'].includes(state)) {
          settledCadIds.current.add(gen.workflowId);
          controllers.current.get(gen.workflowId)?.abort();
          controllers.current.delete(gen.workflowId);
          setGenerations(prev => prev.map(g =>
            g.workflowId === gen.workflowId ? { ...g, status: 'failed', progress: 100 } : g
          ));
          markGenerationFailed(gen.workflowId, `CAD workflow ${state}`, gen.startedAt);
          refreshCredits();
        }
      } catch {
        // The primary poll owns transient-error UI; reconciliation stays silent.
      } finally {
        reconcilingCadIds.current.delete(gen.workflowId);
      }
    }
  }, [navigate, refreshCredits, toast]);

  useEffect(() => {
    const reconcileOnReturn = () => {
      if (document.visibilityState === 'visible') void reconcileCadGenerations();
    };
    const interval = window.setInterval(() => void reconcileCadGenerations(), 30_000);
    window.addEventListener('focus', reconcileOnReturn);
    window.addEventListener('online', reconcileOnReturn);
    document.addEventListener('visibilitychange', reconcileOnReturn);
    void reconcileCadGenerations();
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', reconcileOnReturn);
      window.removeEventListener('online', reconcileOnReturn);
      document.removeEventListener('visibilitychange', reconcileOnReturn);
    };
  }, [reconcileCadGenerations]);

  useEffect(() => {
    const running = generations.filter(g => g.status === 'running');

    for (const gen of running) {
      if (controllers.current.has(gen.workflowId)) continue;

      const ctrl = new AbortController();
      controllers.current.set(gen.workflowId, ctrl);
      const startTime = gen.startedAt;

      // Image-to-3D polls the same endpoints but reports progress through
      // node_visit_seq and returns a flat CAD result, so it runs its own loop
      // and leaves the photoshoot path below completely untouched.
      if (gen.kind === 'cad') {
        pollCadGeneration(gen, ctrl, startTime);
        continue;
      }

      // Smooth progress animation while polling
      const ticker = setInterval(() => {
        setGenerations(prev => prev.map(g => {
          if (g.workflowId !== gen.workflowId || g.status !== 'running') return g;
          return { ...g, progress: Math.min(g.progress + Math.max((90 - g.progress) * 0.04, 0.1), 90) };
        }));
      }, 300);
      // Aborting the poll (unmount/cancel) must also stop the ticker — otherwise
      // it keeps firing setState after teardown.
      ctrl.signal.addEventListener('abort', () => clearInterval(ticker), { once: true });

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
        if (import.meta.env.DEV && gen.isProductShot) console.log('[product-shot result keys]', Object.keys(result), result);
        const jewelryDescription = gen.isProductShot ? extractJewelryDescription(result) : undefined;
        // Top-level sibling scalar (not a node-keyed array). Older payloads bury the
        // asset id inside node-keyed arrays instead, so fall back to the deep scan.
        const outputAssetId = typeof result.output_asset_id === 'string' ? result.output_asset_id : extractOutputAssetId(result);

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
                          workflowId: gen.parentWorkflowId ?? gen.workflowId,
                          resultImages: fallbackImages,
                          aspectRatio: gen.aspectRatio,
                          resolution: gen.resolution,
                          generationCost: gen.generationCost,
                          jewelryUrl: gen.jewelryUrl,
                          modelUrl: gen.parentModelUrl ?? gen.modelUrl,
                        },
                        mode: gen.isProductShot ? 'product-shot' : 'model-shot',
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
            ? { ...g, status: 'completed', progress: 100, resultImages, outputAssetId, ...(jewelryDescription ? { jewelryDescription } : {}) }
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
                    // Derivative runs (upscale) re-anchor to the source generation so
                    // feedback/category/inputs stay tied to the original photoshoot.
                    workflowId: gen.parentWorkflowId ?? gen.workflowId,
                    resultImages,
                    outputAssetId,
                    aspectRatio: gen.aspectRatio,
                    resolution: gen.resolution,
                    generationCost: gen.generationCost,
                    jewelryUrl: gen.jewelryUrl,
                    modelUrl: gen.parentModelUrl ?? gen.modelUrl,
                  },
                  mode: gen.isProductShot ? 'product-shot' : 'model-shot',
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
    <GenerationsContext.Provider value={{ generations, trackGeneration, trackCadGeneration, clearGeneration }}>
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
