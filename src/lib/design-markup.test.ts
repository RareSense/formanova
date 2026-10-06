import { describe, expect, it } from 'vitest';
import {
  hitsMark,
  isMeaningfulMark,
  markBounds,
  markHandles,
  moveMark,
  resizeMark,
  topMarkAt,
  visibleMarkIndexes,
  type Mark,
} from './design-markup';

const box: Mark = { kind: 'box', points: [{ x: 20, y: 20 }, { x: 40, y: 50 }], width: 5 };
const arrow: Mark = { kind: 'arrow', points: [{ x: 10, y: 90 }, { x: 30, y: 70 }], width: 5 };
const brush: Mark = { kind: 'brush', points: [{ x: 60, y: 60 }, { x: 70, y: 60 }], width: 6 };
const erase: Mark = { kind: 'erase', points: [{ x: 65, y: 55 }, { x: 65, y: 65 }], width: 8 };

describe('visibleMarkIndexes', () => {
  it('numbers only real marks, never eraser strokes', () => {
    expect(visibleMarkIndexes([box, erase, arrow])).toEqual([0, 2]);
  });
});

describe('markBounds', () => {
  it('pads a brush stroke by half its width and stays inside the picture', () => {
    expect(markBounds(brush)).toEqual({ x0: 57, y0: 57, x1: 73, y1: 63 });
    expect(markBounds({ kind: 'brush', points: [{ x: 1, y: 99 }], width: 10 })).toEqual({ x0: 0, y0: 94, x1: 6, y1: 100 });
  });
});

describe('hitsMark / topMarkAt', () => {
  it('hits inside a box and near a stroke or arrow', () => {
    expect(hitsMark(box, { x: 30, y: 30 })).toBe(true);
    expect(hitsMark(box, { x: 80, y: 80 })).toBe(false);
    expect(hitsMark(arrow, { x: 20, y: 80 })).toBe(true);
    expect(hitsMark(brush, { x: 65, y: 61 })).toBe(true);
  });

  it('never selects an eraser stroke', () => {
    expect(hitsMark(erase, { x: 65, y: 60 })).toBe(false);
  });

  it('picks the topmost mark', () => {
    const lower: Mark = { kind: 'box', points: [{ x: 0, y: 0 }, { x: 100, y: 100 }], width: 5 };
    expect(topMarkAt([lower, box], { x: 30, y: 30 })).toBe(1);
    expect(topMarkAt([box], { x: 90, y: 5 })).toBeNull();
  });
});

describe('isMeaningfulMark', () => {
  it('drops a click with Box or Arrow but keeps a brush dab', () => {
    expect(isMeaningfulMark({ kind: 'box', points: [{ x: 5, y: 5 }, { x: 5.5, y: 5.5 }], width: 5 })).toBe(false);
    expect(isMeaningfulMark({ kind: 'brush', points: [{ x: 5, y: 5 }], width: 5 })).toBe(true);
  });
});

describe('moveMark', () => {
  it('moves every point and stops at the picture edge', () => {
    expect(moveMark(box, 10, -5).points).toEqual([{ x: 30, y: 15 }, { x: 50, y: 45 }]);
    const pushed = moveMark(box, -50, 0);
    expect(markBounds(pushed).x0).toBe(0);
  });
});

describe('markHandles / resizeMark', () => {
  it('offers four corners on a box and two ends on an arrow, none on a brush', () => {
    expect(markHandles(box).map((h) => h.at)).toEqual([{ x: 20, y: 20 }, { x: 40, y: 20 }, { x: 20, y: 50 }, { x: 40, y: 50 }]);
    expect(markHandles(arrow)).toHaveLength(2);
    expect(markHandles(brush)).toEqual([]);
  });

  it('drags a box corner and keeps the opposite corner fixed', () => {
    expect(resizeMark(box, 3, { x: 60, y: 70 }).points).toEqual([{ x: 20, y: 20 }, { x: 60, y: 70 }]);
    expect(resizeMark(box, 0, { x: 10, y: 5 }).points).toEqual([{ x: 10, y: 5 }, { x: 40, y: 50 }]);
  });

  it('drags either end of an arrow, clamped to the picture', () => {
    expect(resizeMark(arrow, 1, { x: 120, y: 50 }).points[1]).toEqual({ x: 100, y: 50 });
    expect(resizeMark(arrow, 0, { x: 5, y: 95 }).points[0]).toEqual({ x: 5, y: 95 });
  });

  it('leaves a brush stroke unchanged', () => {
    expect(resizeMark(brush, 0, { x: 0, y: 0 })).toBe(brush);
  });
});
