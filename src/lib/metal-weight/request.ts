/**
 * The request form's "Metal & weight" choice, and what it adds to the start
 * request: payload.material (the cited alloy) and payload.weight_target.
 */
import type { WeightTargetPayload } from '@/lib/ring-cad-nurbs-api';
import { findAlloy, type MetalAlloy } from './alloys';
import { isPositiveFinite } from './weight';

export interface MetalRequest {
  /** Null: no metal chosen, so no material is sent. */
  alloyId: string | null;
  /** Grams, whatever unit the user typed in. Null: no target. */
  target: { grams: number; tolerancePct: number } | null;
}

export const EMPTY_METAL_REQUEST: MetalRequest = { alloyId: null, target: null };

export function metalRequestPayload(request: MetalRequest): {
  material: MetalAlloy | null;
  weightTarget: WeightTargetPayload | null;
} {
  const material = findAlloy(request.alloyId);
  const target = request.target;
  const weightTarget = target && isPositiveFinite(target.grams)
    ? { grams: target.grams, tolerance_pct: target.tolerancePct, alloy_id: material?.id ?? null }
    : null;
  return { material, weightTarget };
}
