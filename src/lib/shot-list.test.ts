import { describe, expect, it } from 'vitest';
import {
  MAX_ANGLES_PER_PIECE,
  ShotAngle,
  ShotListAction,
  ShotListState,
  canAddAngle,
  initialShotListState,
  rowPrecision,
  shotListReducer,
  totalShotCount,
} from './shot-list';

const angle = (id: string): ShotAngle => ({ id, previewUrl: `blob:${id}` });

function run(...actions: ShotListAction[]): ShotListState {
  return actions.reduce(shotListReducer, initialShotListState);
}

const angleIds = (s: ShotListState, rowId: string) =>
  s.rows.find((r) => r.id === rowId)?.angles.map((a) => a.id);

describe('shotListReducer', () => {
  it('adds each piece as its own row with no assignees', () => {
    const s = run({ type: 'addPieces', pieces: [[angle('a')], [angle('b')]], rowIds: ['r1', 'r2'] });
    expect(s.rows.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(s.rows.every((r) => r.assignees.length === 0)).toBe(true);
  });

  it('caps angles at 3 on add, addAngles and merge', () => {
    let s = run({
      type: 'addPieces',
      pieces: [[angle('a'), angle('b'), angle('c'), angle('d')]],
      rowIds: ['r1'],
    });
    expect(angleIds(s, 'r1')).toEqual(['a', 'b', 'c']);
    expect(canAddAngle(s.rows[0])).toBe(false);

    s = shotListReducer(s, { type: 'addAngles', rowId: 'r1', angles: [angle('e')] });
    expect(angleIds(s, 'r1')).toHaveLength(MAX_ANGLES_PER_PIECE);

    s = run(
      { type: 'addPieces', pieces: [[angle('a'), angle('b')], [angle('c'), angle('d')]], rowIds: ['r1', 'r2'] },
      { type: 'mergeRows', sourceId: 'r2', targetId: 'r1' },
    );
    expect(s.rows).toHaveLength(2); // refused: 4 > 3
  });

  it('keeps angles in upload order with no cover slot, and reorders equally', () => {
    let s = run(
      { type: 'addPieces', pieces: [[angle('a')]], rowIds: ['r1'] },
      { type: 'addAngles', rowId: 'r1', angles: [angle('b'), angle('c')] },
    );
    expect(angleIds(s, 'r1')).toEqual(['a', 'b', 'c']);
    s = shotListReducer(s, { type: 'moveAngle', rowId: 'r1', from: 2, to: 0 });
    expect(angleIds(s, 'r1')).toEqual(['c', 'a', 'b']);
    const same = shotListReducer(s, { type: 'moveAngle', rowId: 'r1', from: 0, to: 9 });
    expect(same).toBe(s);
  });

  it('auto-upgrades a row to multi-angle at 2+ photos and back at 1', () => {
    let s = run({ type: 'addPieces', pieces: [[angle('a')]], rowIds: ['r1'] });
    expect(rowPrecision(s.rows[0])).toBe('standard');
    s = shotListReducer(s, { type: 'addAngles', rowId: 'r1', angles: [angle('b')] });
    expect(rowPrecision(s.rows[0])).toBe('multi-angle');
    s = shotListReducer(s, { type: 'removeAngle', rowId: 'r1', angleId: 'a' });
    expect(rowPrecision(s.rows[0])).toBe('standard');
    expect(angleIds(s, 'r1')).toEqual(['b']);
  });

  it('removing the last photo removes the piece and its selection', () => {
    const s = run(
      { type: 'addPieces', pieces: [[angle('a')]], rowIds: ['r1'] },
      { type: 'toggleSelect', rowId: 'r1' },
      { type: 'removeAngle', rowId: 'r1', angleId: 'a' },
    );
    expect(s.rows).toHaveLength(0);
    expect(s.selectedIds).toEqual([]);
  });

  it('merges source into target and drops the source row', () => {
    const s = run(
      { type: 'addPieces', pieces: [[angle('a')], [angle('b')], [angle('c')]], rowIds: ['r1', 'r2', 'r3'] },
      { type: 'toggleSelect', rowId: 'r3' },
      { type: 'mergeRows', sourceId: 'r3', targetId: 'r1' },
    );
    expect(s.rows.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(angleIds(s, 'r1')).toEqual(['a', 'c']);
    expect(s.selectedIds).toEqual([]);
  });

  it('splits a multi-angle row in place into single pieces', () => {
    const s = run(
      { type: 'addPieces', pieces: [[angle('x')], [angle('a'), angle('b'), angle('c')], [angle('y')]], rowIds: ['r0', 'r1', 'r2'] },
      { type: 'splitRow', rowId: 'r1', newRowIds: ['n1', 'n2'] },
    );
    expect(s.rows.map((r) => r.id)).toEqual(['r0', 'r1', 'n1', 'n2', 'r2']);
    expect(s.rows.every((r) => r.angles.length === 1)).toBe(true);
    // Single row cannot split
    expect(shotListReducer(s, { type: 'splitRow', rowId: 'r0', newRowIds: [] })).toBe(s);
  });

  it('selects, toggles and clears rows', () => {
    let s = run(
      { type: 'addPieces', pieces: [[angle('a')], [angle('b')]], rowIds: ['r1', 'r2'] },
      { type: 'selectAll' },
    );
    expect(s.selectedIds).toEqual(['r1', 'r2']);
    s = shotListReducer(s, { type: 'toggleSelect', rowId: 'r1' });
    expect(s.selectedIds).toEqual(['r2']);
    s = shotListReducer(s, { type: 'clearSelection' });
    expect(s.selectedIds).toEqual([]);
    expect(shotListReducer(s, { type: 'toggleSelect', rowId: 'nope' })).toBe(s);
  });

  it('counts one shot per assignee', () => {
    const s: ShotListState = {
      selectedIds: [],
      rows: [
        { id: 'r1', angles: [angle('a')], assignees: [
          { id: 'm1', kind: 'model', name: 'A', imageUrl: '' },
          { id: 'm2', kind: 'model', name: 'B', imageUrl: '' },
        ] },
        { id: 'r2', angles: [angle('b')], assignees: [] },
      ],
    };
    expect(totalShotCount(s)).toBe(2);
  });
});
