// Live credit estimate hook — calls POST /api/credits/estimate
// whenever workflow_name, model, numVariations, or pricing context changes.

import { useState, useEffect, useRef } from 'react';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { TOOL_COSTS } from '@/lib/credits-api';

interface UseEstimatedCostOptions {
  workflowName: string;
  model?: string;
  numVariations?: number;
  pricingContext?: Record<string, unknown>;
}

interface EstimatedCostState {
  cost: number | null;
  loading: boolean;
}

/**
 * Fetches `projected_max_hold` from the backend estimate endpoint
 * every time inputs change. Falls back to client-side TOOL_COSTS
 * only if the fetch fails.
 */
export function useEstimatedCost({
  workflowName,
  model,
  numVariations = 1,
  pricingContext,
}: UseEstimatedCostOptions): EstimatedCostState {
  const [cost, setCost] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const pricingContextKey = JSON.stringify(pricingContext ?? {});

  useEffect(() => {
    // Abort previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const res = await authenticatedFetch('/api/credits/estimate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workflow_name: workflowName,
            num_variations: numVariations,
            ...(pricingContext ? { pricing_context: pricingContext } : {}),
          }),
          signal: controller.signal,
        });

        if (cancelled) return;

        if (res.ok) {
          const data = await res.json();
          const serverCost = data.projected_max_hold ?? data.estimated_credits;
          if (serverCost && serverCost > 0) {
            setCost(serverCost);
            setLoading(false);
            return;
          }
        }
      } catch {
        // Network error or aborted — fall through to fallback
      }

      if (cancelled) return;

      // Fallback to client-side constants
      const fallbackKey = model ? `${workflowName}:${model}` : workflowName;
      setCost(TOOL_COSTS[fallbackKey] ?? TOOL_COSTS[workflowName] ?? null);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [workflowName, model, numVariations, pricingContextKey]);

  return { cost, loading };
}
