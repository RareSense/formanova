/**
 * Results queue for Bulk Studio. Holds one item per dispatched shot (and per
 * fix), and reads live status from GenerationsContext, which owns all polling.
 * generate() returns immediately; uploads and starts run in the background so
 * the Shot List stays editable and more batches can be queued.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { useGenerations, type TrackedGeneration } from '@/contexts/GenerationsContext';
import { markGenerationStarted } from '@/lib/generation-lifecycle';
import { trackBatchSubmit, trackGenerationStart } from '@/lib/posthog-events';
import { defaultDispatchDeps, resolvePiece, runPool, startShot, type DispatchDeps } from '@/lib/bulk-dispatch';
import type { BatchPlan, PlannedShot, ShotTier } from '@/lib/bulk-plan';
import type { AssigneeKind, ShotListAction } from '@/lib/shot-list';
import type { Resolution } from '@/components/studio/OutputSettingsPills';
import { newId } from './useShotList';

const UPLOAD_CONCURRENCY = 3;

export interface QueueItem {
  id: string;
  /** Set once the run has started. */
  workflowId?: string;
  origin: 'shot' | 'fix';
  pieceNumber: number;
  assigneeName: string;
  isProductShot: boolean;
  tier: ShotTier;
  category: string;
  aspectRatio: string;
  resolution: Resolution;
  jewelryUrls: string[];
  referenceUrl: string;
  /** Before the run exists: uploading photos / starting / could not start. */
  phase: 'uploading' | 'starting' | 'started' | 'failed';
  humanReview?: boolean;
  upscaledUrl?: string;
}

export type QueueStatus = 'preparing' | 'rendering' | 'completed' | 'failed';

export interface QueueView extends QueueItem {
  status: QueueStatus;
  progress: number;
  resultUrl: string | null;
  outputAssetId: string | null;
}

export function viewOf(item: QueueItem, gen: TrackedGeneration | undefined): QueueView {
  let status: QueueStatus = item.phase === 'failed' ? 'failed' : 'preparing';
  if (item.phase === 'started') status = gen?.status === 'completed' ? 'completed' : gen?.status === 'failed' ? 'failed' : 'rendering';
  return {
    ...item,
    status,
    progress: status === 'completed' ? 100 : Math.round(gen?.progress ?? (item.phase === 'starting' ? 20 : 8)),
    resultUrl: item.upscaledUrl ?? gen?.resultImages?.[0] ?? null,
    outputAssetId: gen?.outputAssetId ?? null,
  };
}

interface GenerateArgs {
  plan: BatchPlan;
  kind: AssigneeKind;
  category: string;
  aspectRatio: string;
  resolution: Resolution;
  perShotCost: (tier: ShotTier) => number | null;
  shotListDispatch: (a: ShotListAction) => void;
}

export function useBulkQueue(deps: DispatchDeps = defaultDispatchDeps) {
  const { generations, trackGeneration } = useGenerations();
  const [items, setItems] = useState<QueueItem[]>([]);
  const depsRef = useRef(deps);

  const patch = useCallback((ids: string[], p: Partial<QueueItem>) => {
    const set = new Set(ids);
    setItems((prev) => prev.map((it) => (set.has(it.id) ? { ...it, ...p } : it)));
  }, []);

  const generate = useCallback(({ plan, kind, category, aspectRatio, resolution, perShotCost, shotListDispatch }: GenerateArgs) => {
    const batchId = newId();
    const isProductShot = kind === 'scene';
    const meta = { category, intended_use: isProductShot ? 'pdp' as const : 'on_model' as const };
    const itemIdOf = new Map<string, string>();
    const fresh: QueueItem[] = plan.shots.map((s) => {
      const id = newId();
      itemIdOf.set(s.key, id);
      return {
        id, origin: 'shot', pieceNumber: s.pieceNumber, assigneeName: s.assignee.name, isProductShot,
        tier: s.tier, category, aspectRatio, resolution, jewelryUrls: [], referenceUrl: s.assignee.imageUrl, phase: 'uploading',
      };
    });
    setItems((prev) => [...fresh, ...prev]);
    trackBatchSubmit(plan.shots.length, category);

    const byRow = new Map<string, PlannedShot[]>();
    plan.shots.forEach((s) => byRow.set(s.rowId, [...(byRow.get(s.rowId) ?? []), s]));

    void runPool([...byRow.values()], UPLOAD_CONCURRENCY, async (shots) => {
      const ids = shots.map((s) => itemIdOf.get(s.key)!);
      let inputs: Awaited<ReturnType<typeof resolvePiece>>['inputs'];
      try {
        const res = await resolvePiece(shots[0].angles, meta, depsRef.current);
        inputs = res.inputs;
        if (res.uploads.length) shotListDispatch({ type: 'setAngleUploads', uploads: res.uploads });
      } catch (e) {
        console.warn('[bulk-studio] upload failed', e);
        patch(ids, { phase: 'failed' });
        return;
      }
      patch(ids, { phase: 'starting', jewelryUrls: inputs.urls });
      await Promise.all(shots.map(async (shot) => {
        const id = itemIdOf.get(shot.key)!;
        try {
          const workflowId = await startShot(shot, inputs, { kind, category, aspectRatio, resolution, batchId }, depsRef.current);
          trackGeneration({
            workflowId, isProductShot, jewelryType: category, jewelryUrl: inputs.urls[0], modelUrl: shot.assignee.imageUrl,
            aspectRatio, resolution, generationCost: perShotCost(shot.tier), quietCompletion: true,
          });
          markGenerationStarted(workflowId);
          trackGenerationStart('bulk-studio');
          patch([id], { workflowId, phase: 'started' });
        } catch (e) {
          console.warn('[bulk-studio] start failed', e);
          patch([id], { phase: 'failed' });
        }
      }));
    });
  }, [patch, trackGeneration]);

  /** A started fix run appears as its own card right before its source. */
  const addFix = useCallback((source: QueueItem, workflowId: string) => {
    const fix: QueueItem = { ...source, id: newId(), origin: 'fix', workflowId, phase: 'started', humanReview: false, upscaledUrl: undefined };
    trackGeneration({
      workflowId, isProductShot: source.isProductShot, jewelryType: source.category, jewelryUrl: source.jewelryUrls[0] ?? '',
      modelUrl: source.referenceUrl, aspectRatio: source.aspectRatio, resolution: source.resolution, generationCost: null, quietCompletion: true,
    });
    markGenerationStarted(workflowId);
    setItems((prev) => {
      const i = prev.findIndex((p) => p.id === source.id);
      const next = [...prev];
      next.splice(Math.max(i, 0), 0, fix);
      return next;
    });
  }, [trackGeneration]);

  const markHumanReview = useCallback((id: string) => patch([id], { humanReview: true }), [patch]);
  const setUpscaled = useCallback((id: string, url: string) => patch([id], { upscaledUrl: url }), [patch]);

  const views = useMemo(() => {
    const byWf = new Map(generations.map((g) => [g.workflowId, g]));
    return items.map((it) => viewOf(it, it.workflowId ? byWf.get(it.workflowId) : undefined));
  }, [items, generations]);

  const counts = useMemo(() => ({
    total: views.length,
    active: views.filter((v) => v.status === 'preparing' || v.status === 'rendering').length,
    done: views.filter((v) => v.status === 'completed').length,
  }), [views]);

  return { views, counts, generate, addFix, markHumanReview, setUpscaled };
}
