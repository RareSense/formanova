// Fetches the backend-estimated credit cost for a workflow + resolution.
// Updates whenever workflowName or resolution changes.
// Falls back to the static RESOLUTION_COSTS if the request fails or the user is unauthenticated.

import { useState, useEffect, useRef } from 'react';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { RESOLUTION_COSTS, type Resolution } from '@/components/studio/OutputSettingsPills';
import { AuthExpiredError } from '@/lib/authenticated-fetch';

export function useGenerationCost(workflowName: string, resolution: Resolution): { cost: number; loading: boolean } {
  const [cost, setCost] = useState<number>(RESOLUTION_COSTS[resolution]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Cancel any in-flight request from a previous render
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let cancelled = false;
    setLoading(true);

    authenticatedFetch('/api/credits/estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflow_name: workflowName,
        num_variations: 1,
        pricing_context: { resolution },
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setCost(RESOLUTION_COSTS[resolution]);
          return;
        }
        const data = await res.json();
        const serverCost = data.projected_max_hold ?? data.estimated_credits;
        setCost(serverCost && serverCost > 0 ? serverCost : RESOLUTION_COSTS[resolution]);
      })
      .catch((err) => {
        if (cancelled || err instanceof AuthExpiredError) return;
        if (err?.name === 'AbortError') return;
        setCost(RESOLUTION_COSTS[resolution]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [workflowName, resolution]); // eslint-disable-line react-hooks/exhaustive-deps
  // resolution and workflowName are the only inputs that should trigger a re-fetch.
  // RESOLUTION_COSTS is a module-level constant — stable reference, safe to omit.

  return { cost, loading };
}
