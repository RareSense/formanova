import { describe, expect, it } from 'vitest';
import { countShoot, guessCategory, initialQueue, nextPiece, planPictures, progress, queueReducer, type QueueState, type ShootSettings } from './cad-to-catalog-queue';

const ANGLES = [{ name: 'Front', dir: [0, 0.12, 1] }, { name: 'Top', dir: [0, 1, 0] }];
const SETTINGS: ShootSettings = { metals: ['Yellow Gold', 'White Gold'], backgrounds: ['white', 'bg-silk'], aspect: '1:1' };

const withPieces = (): QueueState => queueReducer(initialQueue, {
  type: 'add',
  pieces: [{ id: 'a', name: 'FFR ENG-172.3dm', category: 'ring' }, { id: 'b', name: 'FFE-083.3dm', category: 'earring' }],
});
const started = () => queueReducer(withPieces(), { type: 'start', pieceIds: ['a', 'b'], settings: SETTINGS, anglesFor: () => ANGLES });

describe('planPictures', () => {
  it('makes one picture per metal x angle x background, named like the tool', () => {
    const pics = planPictures({ id: 'a', name: 'x', category: 'ring', status: 'waiting' }, SETTINGS, ANGLES);
    expect(pics.map((p) => p.name)).toEqual([
      '01_Front_Yellow_Gold_White', '02_Front_Yellow_Gold_bg-silk', '03_Top_Yellow_Gold_White', '04_Top_Yellow_Gold_bg-silk',
      '05_Front_White_Gold_White', '06_Front_White_Gold_bg-silk', '07_Top_White_Gold_White', '08_Top_White_Gold_bg-silk',
    ]);
    expect(new Set(pics.map((p) => p.id)).size).toBe(8);
  });

  it("keeps the file's own colours when no metal is ticked", () => {
    const pics = planPictures({ id: 'a', name: 'x', category: 'ring', status: 'waiting' }, { ...SETTINGS, metals: [], backgrounds: ['transparent'] }, ANGLES);
    expect(pics.map((p) => [p.name, p.metal])).toEqual([['01_Front_Transparent', null], ['02_Top_Transparent', null]]);
  });
});

describe('queueReducer', () => {
  it('adds each file once', () => {
    const s = queueReducer(withPieces(), { type: 'add', pieces: [{ id: 'a', name: 'dup', category: 'ring' }] });
    expect(s.pieces.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('plans every chosen piece and starts', () => {
    const s = started();
    expect(s.running).toBe(true);
    expect(s.pictures).toHaveLength(16);
    expect(nextPiece(s)?.id).toBe('a');
    expect(queueReducer(s, { type: 'start', pieceIds: ['a'], settings: SETTINGS, anglesFor: () => ANGLES })).toBe(s); // one shoot at a time
  });

  it('moves on to the next piece once one is done', () => {
    let s = started();
    for (const p of s.pictures.filter((x) => x.pieceId === 'a')) s = queueReducer(s, { type: 'picture', pictureId: p.id, status: 'done', url: 'blob:x' });
    s = queueReducer(s, { type: 'piece', pieceId: 'a', status: 'done' });
    expect(nextPiece(s)?.id).toBe('b');
    expect(progress(s, 'a')).toEqual({ done: 8, failed: 0, total: 8 });
    expect(progress(s)).toEqual({ done: 8, failed: 0, total: 16 });
  });

  it('stop keeps finished and placing pictures, drops the rest', () => {
    let s = started();
    const [first, second] = s.pictures;
    s = queueReducer(s, { type: 'picture', pictureId: first.id, status: 'done', url: 'blob:1' });
    s = queueReducer(s, { type: 'picture', pictureId: second.id, status: 'placing' });
    s = queueReducer(s, { type: 'piece', pieceId: 'a', status: 'shooting' });
    s = queueReducer(s, { type: 'stop' });
    expect(s.pictures.map((p) => p.status)).toEqual(['done', 'placing']);
    expect(s.pieces.map((p) => p.status)).toEqual(['stopped', 'stopped']);
    expect(nextPiece(s)).toBeNull();
  });

  it('retry puts a failed piece and its failed pictures back in line', () => {
    let s = started();
    const pic = s.pictures[0];
    s = queueReducer(s, { type: 'picture', pictureId: pic.id, status: 'failed', error: 'busy' });
    s = queueReducer(s, { type: 'piece', pieceId: 'a', status: 'failed', error: 'could not open' });
    s = queueReducer(s, { type: 'finished' });
    s = queueReducer(s, { type: 'retry', pieceId: 'a' });
    expect(s.pieces[0]).toMatchObject({ status: 'waiting', error: undefined });
    expect(s.pictures[0]).toMatchObject({ status: 'waiting', error: undefined });
  });

  it('does not remove a piece that is being shot', () => {
    let s = started();
    s = queueReducer(s, { type: 'piece', pieceId: 'a', status: 'shooting' });
    expect(queueReducer(s, { type: 'remove', pieceId: 'a' })).toBe(s);
    expect(queueReducer(s, { type: 'remove', pieceId: 'b' }).pieces.map((p) => p.id)).toEqual(['a']);
  });

  it('a new shoot of a piece replaces its earlier pictures', () => {
    let s = started();
    s = queueReducer(s, { type: 'finished' });
    s = queueReducer(s, { type: 'start', pieceIds: ['b'], settings: { ...SETTINGS, metals: [] }, anglesFor: () => ANGLES });
    expect(s.pictures.filter((x) => x.pieceId === 'b')).toHaveLength(4);
    expect(s.pictures.filter((x) => x.pieceId === 'a')).toHaveLength(8);
  });
});

describe('guessCategory', () => {
  it('reads Facets of Fire names', () => {
    expect(guessCategory('FFR ENG-172 _RO-046-E_.3dm')).toBe('ring');
    expect(guessCategory('FFE-FASH-083.3dm')).toBe('earring');
    expect(guessCategory('FFN-FASH-024.3dm')).toBe('necklace');
    expect(guessCategory('FFB BRAC-002.3dm')).toBe('bracelet');
    expect(guessCategory('Halo pendant.glb')).toBe('pendant');
    expect(guessCategory('unknown.stl')).toBe('ring');
  });
});

describe('countShoot', () => {
  it('counts photo and drawn pictures for every piece, angle and metal', () => {
    const pieces = [{ category: 'ring' as const }, { category: 'earring' as const }];
    // 2 pieces x 2 angles x 2 metals = 8 shots; one white and one photo background each
    expect(countShoot(pieces, SETTINGS, () => ANGLES)).toEqual({ photos: 8, drawn: 8 });
    expect(countShoot(pieces, { metals: [], backgrounds: ['white', 'transparent'] }, () => ANGLES)).toEqual({ photos: 0, drawn: 8 });
  });
});
