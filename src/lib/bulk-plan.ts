/**
 * Bulk Studio batch planning: which shots are ready, which pieces still need a
 * model/scene, and what the batch costs. Pure, no I/O.
 *
 * One shot = one (piece x model/scene) pair. A piece with 1 angle runs the
 * standard workflow; 2-3 angles run the High Effort ('high' tier) workflow with
 * every angle in jewelry_image_urls[] (current backend contract, max 3).
 */
import {
  rowAssignees, rowPrecision,
  type AssigneeKind, type ShotAngle, type ShotAssignee, type ShotListState,
} from './shot-list';

export type ShotTier = 'low' | 'high';

export interface PlannedShot {
  /** Stable within a batch: `${rowId}::${assigneeId}`. */
  key: string;
  rowId: string;
  /** 1-based position in the Shot List, for labels ("Piece 2"). */
  pieceNumber: number;
  angles: ShotAngle[];
  assignee: ShotAssignee;
  tier: ShotTier;
}

export interface BatchPlan {
  shots: PlannedShot[];
  /** Pieces with no model/scene of the active kind: skipped, never blocking. */
  missingPieces: number;
  lowCount: number;
  highCount: number;
}

export function planBatch(state: ShotListState, kind: AssigneeKind): BatchPlan {
  const shots: PlannedShot[] = [];
  let missingPieces = 0;
  state.rows.forEach((row, i) => {
    const assignees = rowAssignees(row, kind);
    if (!assignees.length) { missingPieces += 1; return; }
    const tier: ShotTier = rowPrecision(row) === 'multi-angle' ? 'high' : 'low';
    for (const assignee of assignees) {
      shots.push({ key: `${row.id}::${assignee.id}`, rowId: row.id, pieceNumber: i + 1, angles: row.angles, assignee, tier });
    }
  });
  return {
    shots,
    missingPieces,
    lowCount: shots.filter((s) => s.tier === 'low').length,
    highCount: shots.filter((s) => s.tier === 'high').length,
  };
}

/** Batch total from the two per-shot estimates (null while either is unknown). */
export function batchCost(plan: BatchPlan, lowCost: number | null, highCost: number | null): number | null {
  if (plan.lowCount && lowCost == null) return null;
  if (plan.highCount && highCost == null) return null;
  return plan.lowCount * (lowCost ?? 0) + plan.highCount * (highCost ?? 0);
}

/** "Generate 6 Shots" / "Generate 6 Ready Shots" + the hint under it. */
export function generateLabels(plan: BatchPlan, kind: AssigneeKind): { cta: string; hint: string | null } {
  const n = plan.shots.length;
  const noun = kind === 'model' ? 'model' : 'scene';
  const shots = `${n} ${n === 1 ? 'Shot' : 'Shots'}`;
  if (n === 0) {
    return { cta: 'Generate', hint: plan.missingPieces ? `Choose a ${noun} for at least one piece` : 'Add jewelry to start' };
  }
  if (!plan.missingPieces) return { cta: `Generate ${shots}`, hint: null };
  const p = plan.missingPieces;
  return {
    cta: `Generate ${n} Ready ${n === 1 ? 'Shot' : 'Shots'}`,
    hint: `${p} ${p === 1 ? 'piece needs' : 'pieces need'} a ${noun} · skipped`,
  };
}
