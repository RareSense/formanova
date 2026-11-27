import { describe, expect, it } from 'vitest';
import { batchCost, generateLabels, planBatch } from './bulk-plan';
import { initialShotListState, shotListReducer, type ShotAngle, type ShotAssignee, type ShotListAction } from './shot-list';

const angle = (id: string): ShotAngle => ({ id, previewUrl: `blob:${id}` });
const model = (id: string): ShotAssignee => ({ id, kind: 'model', name: id, imageUrl: `u-${id}`, source: 'preset', refId: id });
const run = (...a: ShotListAction[]) => a.reduce(shotListReducer, initialShotListState);

const state = () => run(
  { type: 'addPieces', pieces: [[angle('a')], [angle('b'), angle('c')], [angle('d')]], rowIds: ['r1', 'r2', 'r3'] },
  { type: 'setAssignees', rowIds: ['r1'], kind: 'model', assignees: [model('m1'), model('m2')] },
  { type: 'setAssignees', rowIds: ['r2'], kind: 'model', assignees: [model('m1')] },
);

describe('planBatch', () => {
  it('makes one shot per piece x model and skips pieces without a model', () => {
    const plan = planBatch(state(), 'model');
    expect(plan.shots.map((s) => s.key)).toEqual(['r1::m1', 'r1::m2', 'r2::m1']);
    expect(plan.shots.map((s) => s.pieceNumber)).toEqual([1, 1, 2]);
    expect(plan.missingPieces).toBe(1);
  });

  it('routes 2-3 angle pieces to the high tier with all angles in order', () => {
    const plan = planBatch(state(), 'model');
    expect(plan.shots.map((s) => s.tier)).toEqual(['low', 'low', 'high']);
    expect(plan.shots[2].angles.map((a) => a.id)).toEqual(['b', 'c']);
    expect([plan.lowCount, plan.highCount]).toEqual([2, 1]);
  });

  it('plans scenes separately from models', () => {
    expect(planBatch(state(), 'scene').shots).toEqual([]);
    expect(planBatch(state(), 'scene').missingPieces).toBe(3);
  });
});

describe('batchCost', () => {
  it('sums per-tier estimates and waits for both', () => {
    const plan = planBatch(state(), 'model');
    expect(batchCost(plan, 8, 20)).toBe(36);
    expect(batchCost(plan, 8, null)).toBeNull();
    expect(batchCost(planBatch(run(), 'model'), null, null)).toBe(0);
  });
});

describe('generateLabels', () => {
  it('counts ready shots and names skipped pieces', () => {
    expect(generateLabels(planBatch(state(), 'model'), 'model')).toEqual({
      cta: 'Generate 3 Ready Shots', hint: '1 piece needs a model · skipped',
    });
    const all = run(
      { type: 'addPieces', pieces: [[angle('a')]], rowIds: ['r1'] },
      { type: 'setAssignees', rowIds: ['r1'], kind: 'model', assignees: [model('m1')] },
    );
    expect(generateLabels(planBatch(all, 'model'), 'model')).toEqual({ cta: 'Generate 1 Shot', hint: null });
    expect(generateLabels(planBatch(run(), 'model'), 'model').hint).toBe('Add jewelry to start');
    expect(generateLabels(planBatch(state(), 'scene'), 'scene').hint).toBe('Choose a scene for at least one piece');
  });
});
