/**
 * useDesignImageRun
 *
 * Makes design pictures for the Create CAD studio: one picture per request,
 * several requests in parallel ("4 designs to choose from", "make 3 angles").
 *
 * Owns the paid-feature rules (AI_RULES 6) so the editor components don't:
 * - one credit preflight for the whole batch (design_image_v1 x N); when it
 *   fails, useCreditPreflight sends the customer to /credits with a return path;
 * - cancellation of every in-flight run on unmount;
 * - a credit balance refresh once the batch settles.
 * Start/poll/parse rules live in lib/design-image-run.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCreditPreflight } from '@/hooks/use-credit-preflight';
import { useCredits } from '@/contexts/CreditsContext';
import { DESIGN_IMAGE_WORKFLOW, type DesignImageResult, type DesignImageStartParams } from '@/lib/design-image-api';
import { DesignImageRunError, runDesignImage } from '@/lib/design-image-run';
import { DESIGN_IMAGE_BACKEND_LIVE, previewDesignImage } from '@/lib/design-image-preview';

export type DesignImageOutcome =
  | { ok: true; result: DesignImageResult }
  | { ok: false; message: string; retryable: boolean };

export interface UseDesignImageRun {
  /**
   * Resolves with one outcome per request, in order, or null when the batch
   * never started (not enough credits) or the component unmounted.
   */
  generate: (
    requests: DesignImageStartParams[],
    options?: GenerateOptions,
  ) => Promise<DesignImageOutcome[] | null>;
  /** True while any batch is running. */
  running: boolean;
}

interface GenerateOptions {
  onOutcome?: (index: number, outcome: DesignImageOutcome) => void;
  /** Preview mode only (backend not live): a picture to show for request i when it has none. */
  previewFallbacks?: (string | null)[];
}

const GENERIC = "We couldn't make that picture. Please try again.";

export function useDesignImageRun(): UseDesignImageRun {
  const { checkCredits } = useCreditPreflight();
  const { refreshCredits } = useCredits();
  const controllers = useRef(new Set<AbortController>());
  const [inFlight, setInFlight] = useState(0);

  useEffect(() => {
    const live = controllers.current;
    return () => {
      live.forEach((c) => c.abort());
      live.clear();
    };
  }, []);

  const generate = useCallback(async (
    requests: DesignImageStartParams[],
    options: GenerateOptions = {},
  ): Promise<DesignImageOutcome[] | null> => {
    if (requests.length === 0) return [];
    // Preview mode: no backend call and no credits until design_image_v1 is live.
    const run = DESIGN_IMAGE_BACKEND_LIVE
      ? (r: DesignImageStartParams, _i: number, signal: AbortSignal) => runDesignImage(r, signal)
      : (r: DesignImageStartParams, i: number, signal: AbortSignal) => previewDesignImage(r, options.previewFallbacks?.[i] ?? null, signal);
    if (DESIGN_IMAGE_BACKEND_LIVE) {
      const approved = await checkCredits(DESIGN_IMAGE_WORKFLOW, requests.length);
      if (!approved) return null;
    }

    const ctrl = new AbortController();
    controllers.current.add(ctrl);
    setInFlight((n) => n + 1);
    try {
      const toOutcome = (s: PromiseSettledResult<DesignImageResult | null>): DesignImageOutcome => {
        if (s.status === 'fulfilled' && s.value) return { ok: true, result: s.value };
        const err = s.status === 'rejected' ? s.reason : null;
        return {
          ok: false,
          message: err instanceof Error && err.message ? err.message : GENERIC,
          retryable: err instanceof DesignImageRunError ? err.retryable : true,
        };
      };
      // Each picture is reported as soon as it lands, so slots can fill one by one.
      const settled = await Promise.allSettled(requests.map(async (r, i) => {
        const result = await run(r, i, ctrl.signal).then(
          (value) => ({ status: 'fulfilled', value }) as const,
          (reason) => ({ status: 'rejected', reason }) as const,
        );
        if (!ctrl.signal.aborted) options.onOutcome?.(i, toOutcome(result));
        if (result.status === 'rejected') throw result.reason;
        return result.value;
      }));
      if (ctrl.signal.aborted) return null;
      return settled.map(toOutcome);
    } finally {
      controllers.current.delete(ctrl);
      if (!ctrl.signal.aborted) {
        setInFlight((n) => Math.max(0, n - 1));
        if (DESIGN_IMAGE_BACKEND_LIVE) refreshCredits().catch(() => {});
      }
    }
  }, [checkCredits, refreshCredits]);

  return { generate, running: inFlight > 0 };
}
