import { describe, expect, it } from 'vitest';

import { castingCheckNote, castingDownloadOffer } from './casting-check-note';

describe('castingCheckNote', () => {
  it('says nothing for a ready file, or when there is no status', () => {
    expect(castingCheckNote('ready', ['thin_walls'])).toBeNull();
    expect(castingCheckNote(null, ['thin_walls'])).toBeNull();
    expect(castingCheckNote(undefined, undefined)).toBeNull();
  });

  it('turns flag codes into plain words', () => {
    expect(castingCheckNote('flagged', ['separate_pieces', 'thin_walls'])).toBe(
      'Your manufacturer may want to check: made as separate pieces (for example a pair or chain links); some walls are thin.',
    );
  });

  it('has words for every known code', () => {
    const codes: Record<string, string> = {
      multiple_shells: 'more than one piece',
      separate_pieces: 'made as separate pieces (for example a pair or chain links)',
      floating_parts: 'a small part is not attached',
      self_intersections: 'some surfaces cross each other',
      self_intersections_not_checked: 'not every surface could be checked',
      metal_left_out: 'a part could not be included',
      stones_not_held: 'a stone may not be held by metal',
      touching_edges: 'some parts only touch along a line',
      thin_walls: 'some walls are thin',
      size_outside_mm_range: 'the size looks unusual',
    };
    for (const [code, words] of Object.entries(codes)) {
      expect(castingCheckNote('flagged', [code])).toBe(`Your manufacturer may want to check: ${words}.`);
    }
  });

  it('shows at most three reasons, without repeats', () => {
    expect(castingCheckNote('flagged', ['thin_walls', 'thin_walls', 'floating_parts', 'touching_edges', 'size_outside_mm_range'])).toBe(
      'Your manufacturer may want to check: some walls are thin; a small part is not attached; some parts only touch along a line.',
    );
  });

  it('hides unknown codes, and falls back to a generic line when none are known', () => {
    expect(castingCheckNote('flagged', ['mystery_code', 'thin_walls'])).toBe(
      'Your manufacturer may want to check: some walls are thin.',
    );
    expect(castingCheckNote('flagged', ['mystery_code'])).toBe('Your manufacturer may want to give it a quick check.');
    expect(castingCheckNote('flagged', [])).toBe('Your manufacturer may want to give it a quick check.');
  });
});

describe('castingDownloadOffer', () => {
  const casting = { castingStlUrl: '/c.stl', stonesUrl: '/s.json', status: 'flagged' as const, flags: ['thin_walls'] };

  it('offers nothing when the run has no casting files', () => {
    expect(castingDownloadOffer(null)).toEqual({ castingStlUrl: null, stonesUrl: null, note: null });
  });

  it('offers both files with the note for a flagged run', () => {
    expect(castingDownloadOffer(casting)).toEqual({
      castingStlUrl: '/c.stl',
      stonesUrl: '/s.json',
      note: 'Your manufacturer may want to check: some walls are thin.',
    });
  });

  it('does not offer a failed casting STL, but keeps the stone list', () => {
    expect(castingDownloadOffer({ ...casting, status: 'failed' })).toEqual({
      castingStlUrl: null,
      stonesUrl: '/s.json',
      note: null,
    });
  });
});
