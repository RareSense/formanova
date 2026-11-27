import { describe, expect, it } from 'vitest';
import {
  AssigneeKind,
  ShotAngle,
  ShotAssignee,
  ShotListAction,
  ShotListState,
  canApplyToAll,
  initialShotListState,
  rowAssignees,
  shotListReducer,
  totalShotCount,
} from './shot-list';

const angle = (id: string): ShotAngle => ({ id, previewUrl: `blob:${id}` });
const make = (kind: AssigneeKind) => (id: string): ShotAssignee =>
  ({ id, kind, name: id, imageUrl: '', source: 'preset', refId: id });
const model = make('model');
const scene = make('scene');

const run = (...actions: ShotListAction[]): ShotListState => actions.reduce(shotListReducer, initialShotListState);
const three = (): ShotListAction => ({
  type: 'addPieces', pieces: [[angle('a')], [angle('b')], [angle('c')]], rowIds: ['r1', 'r2', 'r3'],
});
const ids = (s: ShotListState, rowId: string, kind: AssigneeKind = 'model') =>
  rowAssignees(s.rows.find((r) => r.id === rowId)!, kind).map((a) => a.id);

describe('pairing', () => {
  it('sets models on a row without duplicates and without touching scenes', () => {
    const s = run(
      three(),
      { type: 'setAssignees', rowIds: ['r1'], kind: 'scene', assignees: [scene('s1')] },
      { type: 'setAssignees', rowIds: ['r1'], kind: 'model', assignees: [model('m1'), model('m1'), model('m2')] },
    );
    expect(ids(s, 'r1')).toEqual(['m1', 'm2']);
    expect(ids(s, 'r1', 'scene')).toEqual(['s1']);
    expect(totalShotCount(s, 'model')).toBe(2);
    expect(totalShotCount(s, 'scene')).toBe(1);
  });

  it("applies one row's models to every piece", () => {
    let s = run(three(), { type: 'setAssignees', rowIds: ['r1'], kind: 'model', assignees: [model('m1'), model('m2')] });
    expect(canApplyToAll(s, 'r1', 'model')).toBe(true);
    expect(canApplyToAll(s, 'r2', 'model')).toBe(false); // nothing to copy
    s = shotListReducer(s, { type: 'applyToAll', fromRowId: 'r1', kind: 'model' });
    expect(['r1', 'r2', 'r3'].map((r) => ids(s, r))).toEqual([['m1', 'm2'], ['m1', 'm2'], ['m1', 'm2']]);
    expect(totalShotCount(s, 'model')).toBe(6);
    expect(canApplyToAll(s, 'r1', 'model')).toBe(false);
  });

  it('assigns to selected rows only, then swaps one model on one row', () => {
    const s = run(
      three(),
      { type: 'setAssignees', rowIds: ['r1', 'r2', 'r3'], kind: 'model', assignees: [model('m1')] },
      { type: 'setAssignees', rowIds: ['r2', 'r3'], kind: 'model', assignees: [model('m9')] },
      { type: 'replaceAssignee', rowId: 'r3', oldId: 'm9', assignee: model('m5') },
    );
    expect(['r1', 'r2', 'r3'].map((r) => ids(s, r))).toEqual([['m1'], ['m9'], ['m5']]);
  });

  it('replacing with a model already on the row drops the old one', () => {
    const s = run(
      three(),
      { type: 'setAssignees', rowIds: ['r1'], kind: 'model', assignees: [model('m1'), model('m2')] },
      { type: 'replaceAssignee', rowId: 'r1', oldId: 'm2', assignee: model('m1') },
    );
    expect(ids(s, 'r1')).toEqual(['m1']);
  });

  it('removes one assignee', () => {
    const s = run(
      three(),
      { type: 'setAssignees', rowIds: ['r1'], kind: 'model', assignees: [model('m1'), model('m2')] },
      { type: 'removeAssignee', rowId: 'r1', assigneeId: 'm1' },
    );
    expect(ids(s, 'r1')).toEqual(['m2']);
  });

  it('removes selected rows', () => {
    const s = run(three(), { type: 'toggleSelect', rowId: 'r2' }, { type: 'removeSelected' });
    expect(s.rows.map((r) => r.id)).toEqual(['r1', 'r3']);
    expect(s.selectedIds).toEqual([]);
  });

  it('split pieces keep their pairing', () => {
    const s = run(
      { type: 'addPieces', pieces: [[angle('a'), angle('b')]], rowIds: ['r1'] },
      { type: 'setAssignees', rowIds: ['r1'], kind: 'model', assignees: [model('m1')] },
      { type: 'splitRow', rowId: 'r1', newRowIds: ['n1'] },
    );
    expect(ids(s, 'n1')).toEqual(['m1']);
    expect(totalShotCount(s, 'model')).toBe(2);
  });
});
