// Reusable upscale launcher.
//
// Encapsulates the full launch path for a post-generation upscale so it can be
// triggered from anywhere (Studio results, generation history), not just inside
// useStudioGeneration: credit preflight, startUpscale, and tracking through
// GenerationsContext (which owns polling, the header indicator, and leave-and-
// return). The studio keeps its own copy for its in-place swap behavior; this
// hook is the standalone path for surfaces like the history card.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useGenerations } from '@/contexts/GenerationsContext';
import { useCreditPreflight } from '@/hooks/use-credit-preflight';
import { markGenerationStarted } from '@/lib/generation-lifecycle';
import { startUpscale, tierForUpscale, estimateUpscaleCostCached, UPSCALE_POLL_TIMEOUT_MS } from '@/lib/upscale-api';
import { TO_SINGULAR } from '@/lib/jewelry-utils';
import { trackUpscaleStarted, trackUpscaleCompleted, trackUpscalePaywallHit } from '@/lib/posthog-events';
import { saveUpscaleIntent, clearUpscaleIntent } from '@/lib/upscale-intent';
import type { Resolution } from '@/components/studio/OutputSettingsPills';

export type UpscaleRunStatus = 'idle' | 'starting' | 'processing' | 'completed' | 'error';

export interface UpscaleLaunchArgs {
  /** The image to enlarge (SAS https URL or azure:// URI). */
  imageUri: string;
  /** Source tier - drives billing and the priced factor set. */
  resolution: Resolution;
  /** Integer multiplier the user picked. */
  factor: number;
  isProductShot: boolean;
  jewelryType: string;
  /** Fired once the tracked upscale completes (e.g. to refresh the history list). */
  onCompleted?: () => void;
}

export interface UseUpscaleLauncherReturn {
  status: UpscaleRunStatus;
  error: string | null;
  launch: (args: UpscaleLaunchArgs) => Promise<void>;
  /** Insufficient-credit modal state, re-exported so the caller can render it. */
  showInsufficientModal: boolean;
  dismissModal: () => void;
  preflightResult: ReturnType<typeof useCreditPreflight>['preflightResult'];
}

export function useUpscaleLauncher(): UseUpscaleLauncherReturn {
  const { generations, trackGeneration, clearGeneration } = useGenerations();
  const { checkCredits, showInsufficientModal, dismissModal, preflightResult } = useCreditPreflight();

  const [status, setStatus] = useState<UpscaleRunStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const onCompletedRef = useRef<(() => void) | undefined>(undefined);

  // Props captured at launch so the completion effect can emit upscale_completed
  // with the upscale's OWN dimensions (never the tracked generation's cost).
  const completedPropsRef = useRef<{
    source_tier: Resolution;
    factor: number;
    credits_cost: number;
    category: string;
    is_product_shot: boolean;
  } | null>(null);

  const tracked = generations.find(g => g.workflowId === activeId);

  // React to completion/failure of the tracked upscale.
  useEffect(() => {
    if (!tracked || !activeId) return;
    if (tracked.status === 'completed') {
      setStatus('completed');
      if (completedPropsRef.current) {
        trackUpscaleCompleted({ ...completedPropsRef.current, surface: 'history' });
      }
      onCompletedRef.current?.();
      clearGeneration(activeId);
      setActiveId(null);
    } else if (tracked.status === 'failed') {
      setStatus('error');
      setError('Upscale failed. Please try again.');
      clearGeneration(activeId);
      setActiveId(null);
    }
    // Deps excluded: activeId, clearGeneration, tracked. We intentionally fire
    // only on the tracked run's status transition (mirrors the studio completion
    // effect). activeId and clearGeneration are stable, and reading `tracked`
    // fresh each run is correct. Watch: if activeId changes mid-flight the lookup
    // yields undefined and the effect safely no-ops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracked?.status]);

  const launch = useCallback(async ({
    imageUri, resolution, factor, isProductShot, jewelryType, onCompleted,
  }: UpscaleLaunchArgs) => {
    if (status === 'starting' || status === 'processing') return;
    if (!imageUri) {
      setStatus('error');
      setError('Cannot upscale - the image is not available.');
      return;
    }

    setStatus('starting');
    setError(null);

    // Quoted hold price at launch (policy-driven, cache is warm from UpscaleControl).
    const credits_cost = (await estimateUpscaleCostCached({ resolution, factor })) ?? 0;
    const category = TO_SINGULAR[jewelryType] ?? jewelryType;

    const approved = await checkCredits('upscale_image', 1, {
      pricingContext: { image_size: tierForUpscale(resolution), factor },
    });
    if (!approved) {
      trackUpscalePaywallHit({ source_tier: resolution, factor, credits_cost, category, surface: 'history' });
      // Stash the exact selection so a credits purchase round-trip (pricing ->
      // Stripe -> back) returns the user to their choice instead of starting
      // over. Consumed + cleared by the surface that re-arms it on return.
      saveUpscaleIntent({ imageUri, resolution, factor, isProductShot, jewelryType });
      setStatus('idle');
      return;
    }
    // Approved: drop any stale pending intent so it can't re-arm a later visit.
    clearUpscaleIntent();

    try {
      const res = await startUpscale({
        imageUri,
        factor,
        resolution,
        idempotency_key: `upscale-${Date.now()}-${jewelryType}`,
      });
      const id = res.workflow_id;
      onCompletedRef.current = onCompleted;
      completedPropsRef.current = {
        source_tier: resolution, factor, credits_cost, category, is_product_shot: isProductShot,
      };
      trackUpscaleStarted({
        source_tier: resolution, factor, credits_cost, category,
        is_product_shot: isProductShot, surface: 'history',
      });
      setActiveId(id);
      setStatus('processing');
      trackGeneration({
        workflowId: id,
        isProductShot,
        jewelryType,
        jewelryUrl: '',
        modelUrl: imageUri,
        aspectRatio: '',
        resolution,
        generationCost: null,
        timeoutMs: UPSCALE_POLL_TIMEOUT_MS,
      });
      markGenerationStarted(id);
    } catch {
      setStatus('error');
      setError('Could not start the upscale. Please try again.');
    }
  }, [status, checkCredits, trackGeneration]);

  return { status, error, launch, showInsufficientModal, dismissModal, preflightResult };
}
