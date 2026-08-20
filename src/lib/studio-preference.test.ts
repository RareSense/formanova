import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CAD_STUDIO_PATH,
  DEFAULT_STUDIO_PATH,
  clearStudioVisits,
  getPreferredStudioPath,
  recordStudioVisit,
} from './studio-preference';

beforeEach(() => {
  localStorage.clear();
});

function visit(studio: 'photo' | 'cad', times: number) {
  for (let i = 0; i < times; i += 1) recordStudioVisit(studio);
}

describe('getPreferredStudioPath', () => {
  it('sends a first-time user to Photo Studio', () => {
    expect(getPreferredStudioPath()).toBe(DEFAULT_STUDIO_PATH);
  });

  it('moves someone who has settled into CAD', () => {
    visit('cad', 5);
    expect(getPreferredStudioPath()).toBe(CAD_STUDIO_PATH);
  });

  it('does not move anyone on one or two stray visits', () => {
    // A single click through CAD should not redirect every future session.
    visit('cad', 2);
    expect(getPreferredStudioPath()).toBe(DEFAULT_STUDIO_PATH);
  });

  it('keeps a heavier Photo user on Photo Studio despite real CAD use', () => {
    visit('cad', 4);
    visit('photo', 9);
    expect(getPreferredStudioPath()).toBe(DEFAULT_STUDIO_PATH);
  });

  it('follows the balance back when Photo overtakes CAD', () => {
    visit('cad', 4);
    expect(getPreferredStudioPath()).toBe(CAD_STUDIO_PATH);

    visit('photo', 5);
    expect(getPreferredStudioPath()).toBe(DEFAULT_STUDIO_PATH);
  });

  it('breaks an exact tie towards Photo Studio', () => {
    visit('cad', 4);
    visit('photo', 4);
    expect(getPreferredStudioPath()).toBe(DEFAULT_STUDIO_PATH);
  });
});

describe('storage handling', () => {
  it('ignores corrupt stored data rather than throwing', () => {
    localStorage.setItem('formanova_studio_visits', 'not json');
    expect(getPreferredStudioPath()).toBe(DEFAULT_STUDIO_PATH);
    expect(() => recordStudioVisit('cad')).not.toThrow();
  });

  it('ignores negative or non-numeric counts', () => {
    localStorage.setItem('formanova_studio_visits', JSON.stringify({ cad: -50, photo: 'lots' }));
    expect(getPreferredStudioPath()).toBe(DEFAULT_STUDIO_PATH);
  });

  it('survives storage being unavailable, as in private mode', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => recordStudioVisit('cad')).not.toThrow();
    setItem.mockRestore();
  });

  it('forgets everything on clear', () => {
    visit('cad', 5);
    clearStudioVisits();
    expect(getPreferredStudioPath()).toBe(DEFAULT_STUDIO_PATH);
  });
});
