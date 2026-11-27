/**
 * Generate side of Bulk Studio: output settings, live batch cost, plan,
 * one batch credit check, then background dispatch through useBulkQueue.
 */
import { useMemo, useState } from 'react';
import { useGenerationCost } from '@/hooks/useGenerationCost';
import { useCreditPreflight } from '@/hooks/use-credit-preflight';
import { workflowFor } from '@/lib/photoshoot-api';
import { batchCost, generateLabels, planBatch } from '@/lib/bulk-plan';
import { toast } from '@/hooks/use-toast';
import type { Resolution } from '@/components/studio/OutputSettingsPills';
import type { AssigneeKind, ShotListAction, ShotListState } from '@/lib/shot-list';
import { useBulkQueue } from './useBulkQueue';

const OUTPUT_KEY = 'formanova_bulk_output';
const RESOLUTIONS: Resolution[] = ['1K', '2K', '4K'];

function readOutput(): { aspectRatio: string; resolution: Resolution } {
  try {
    const v = JSON.parse(localStorage.getItem(OUTPUT_KEY) ?? '{}');
    return {
      aspectRatio: typeof v.aspectRatio === 'string' ? v.aspectRatio : '3:4',
      resolution: RESOLUTIONS.includes(v.resolution) ? v.resolution : '1K',
    };
  } catch {
    return { aspectRatio: '3:4', resolution: '1K' };
  }
}

interface Args {
  state: ShotListState;
  dispatch: (a: ShotListAction) => void;
  kind: AssigneeKind;
  category: string;
}

export function useBulkGenerate({ state, dispatch, kind, category }: Args) {
  const [output, setOutput] = useState(readOutput);
  const update = (patch: Partial<typeof output>) => setOutput((prev) => {
    const next = { ...prev, ...patch };
    try { localStorage.setItem(OUTPUT_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
    return next;
  });

  const isProductShot = kind === 'scene';
  // One estimate per tier; refetched only when mode or resolution changes.
  const low = useGenerationCost(workflowFor(isProductShot, output.resolution, 'low'), output.resolution);
  const high = useGenerationCost(workflowFor(isProductShot, output.resolution, 'high'), output.resolution);

  const plan = useMemo(() => planBatch(state, kind), [state, kind]);
  const cost = batchCost(plan, low.cost, high.cost);
  const labels = generateLabels(plan, kind);

  const queue = useBulkQueue();
  const preflight = useCreditPreflight({ redirectOnInsufficient: false });
  const [submitting, setSubmitting] = useState(false);

  const generate = async (onQueued?: () => void) => {
    if (!plan.shots.length || submitting) return;
    setSubmitting(true);
    try {
      const needed = cost ?? plan.lowCount * low.cost + plan.highCount * high.cost;
      const approved = await preflight.checkCreditsFor(needed, workflowFor(isProductShot, output.resolution, 'low'));
      if (!approved) return;
      queue.generate({
        plan, kind, category, aspectRatio: output.aspectRatio, resolution: output.resolution,
        perShotCost: (tier) => (tier === 'high' ? high.cost : low.cost),
        shotListDispatch: dispatch,
      });
      const n = plan.shots.length;
      toast({ title: `${n} ${n === 1 ? 'shot' : 'shots'} queued`, description: 'Keep editing. Results appear as they finish.' });
      onQueued?.();
    } catch (e) {
      console.warn('[bulk-studio] generate failed', e);
      toast({ variant: 'destructive', title: "Couldn't start the batch", description: 'Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  return {
    output, setAspectRatio: (aspectRatio: string) => update({ aspectRatio }), setResolution: (resolution: Resolution) => update({ resolution }),
    plan, cost, costLoading: low.loading || high.loading, labels, generate, submitting, queue, preflight,
  };
}
