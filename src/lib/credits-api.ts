// Credits API client — relative paths only

import { authenticatedFetch } from '@/lib/authenticated-fetch';

// Client-side fallback costs used by performCreditPreflight when the backend
// /api/credits/estimate call fails or returns a non-positive value.
// The backend estimate is always preferred; these are last-resort guards only.
// Keys must match the workflow_name sent to the backend.
export const TOOL_COSTS: Record<string, number> = {
  // Photoshoot workflows — confirmed fallback: 10 credits each
  jewelry_photoshoots_generator: 10,      // model-shot 1K
  jewelry_photoshoots_generator_2k: 15,   // model-shot 2K
  jewelry_photoshoots_generator_4k: 25,   // model-shot 4K
  Product_shot_pipeline: 10,              // product-shot 1K
  Product_shot_pipeline_2k: 15,           // product-shot 2K
  Product_shot_pipeline_4k: 25,           // product-shot 4K
  cad_generation: 85,
  ring_full_pipeline: 85,
  ring_generate_v1: 85,
  ring_edit_v1: 85,
  // Model-specific costs for ring_generate_v1
  'ring_generate_v1:gemini': 85,
  'ring_generate_v1:claude-sonnet': 120,
  'ring_generate_v1:claude-opus': 150,
};

export interface CreditBalance {
  balance: number;
  reserved_balance?: number;
  available?: number;
}

/**
 * Single source of truth for credit balance.
 * Calls GET /credits/balance/me with JWT auth.
 * Throws AuthExpiredError on 401 (handled by authenticatedFetch).
 */
export async function fetchBalance(): Promise<CreditBalance> {
  const response = await authenticatedFetch('/api/credits/balance/me');

  if (!response.ok) {
    throw new Error('Failed to fetch credits');
  }

  return await response.json();
}

