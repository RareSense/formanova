// Credit Preflight Validation
// Mandatory estimation + balance check before any generation workflow

import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { TOOL_COSTS } from '@/lib/credits-api';

export interface PreflightResult {
  approved: boolean;
  estimatedCredits: number;
  currentBalance: number;
}

/**
 * Mandatory credit preflight check.
 * 1. Estimates cost via POST /credits/estimate → reads projected_max_hold
 * 2. Fetches current balance via GET /credits/balance/me → reads available (or balance)
 * 3. Compares and returns approval status
 */
export async function performCreditPreflight(
  workflowName: string,
  numVariations: number = 1,
  metadata?: { model?: string; pricingContext?: Record<string, unknown> }
): Promise<PreflightResult> {
  // 1️⃣ Estimate required credits — use model-specific fallback if available
  const fallbackKey = metadata?.model
    ? `${workflowName}:${metadata.model}`
    : workflowName;
  let estimatedCredits = TOOL_COSTS[fallbackKey] ?? TOOL_COSTS[workflowName] ?? 5;

  try {
    const estimateRes = await authenticatedFetch('/api/credits/estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflow_name: workflowName,
        num_variations: numVariations,
        ...(metadata?.pricingContext ? { pricing_context: metadata.pricingContext } : {}),
      }),
    });

    if (estimateRes.ok) {
      const data = await estimateRes.json();
      // Backend returns projected_max_hold, NOT estimated_credits
      const serverCost = data.projected_max_hold ?? data.estimated_credits;
      if (serverCost && serverCost > 0) {
        estimatedCredits = serverCost;
      }
    }
  } catch {
    // Estimate failed — use client-side fallback
  }

  // 2️⃣ Fetch current balance, 3️⃣ compare
  return preflightForCredits(estimatedCredits);
}

/**
 * Balance check for a cost the caller already knows (e.g. a shoot that mixes
 * several workflows and resolutions). GET /credits/balance/me → available (or balance).
 */
export async function preflightForCredits(estimatedCredits: number): Promise<PreflightResult> {
  const balanceRes = await authenticatedFetch('/api/credits/balance/me');

  if (!balanceRes.ok) {
    throw new Error(`Balance fetch failed (${balanceRes.status})`);
  }

  const balanceData = await balanceRes.json();
  // Use "available" (balance minus reserved holds), fall back to "balance"
  const currentBalance = balanceData.available ?? balanceData.balance ?? 0;

  return {
    approved: currentBalance >= estimatedCredits,
    estimatedCredits,
    currentBalance,
  };
}
