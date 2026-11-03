import { describe, it, expect, vi } from 'vitest';
import { keepLocally, retryUnsavedCalls, saveCallRecord, saveOnPageHide, type SaveDeps } from './post-call-save';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size;
    },
  };
}

function deps(save: SaveDeps['save']) {
  const store = memoryStorage();
  return { store, d: { save, sleep: async () => {}, storage: () => store } satisfies SaveDeps };
}

const rec = (id: string) => ({ call_session_id: id, turns: [] });

describe('post-call save', () => {
  it('saves and leaves no local copy', async () => {
    const save = vi.fn(async () => {});
    const { store, d } = deps(save);
    expect(await saveCallRecord('u1', rec('a'), d)).toBe(true);
    expect(save).toHaveBeenCalledWith(rec('a'));
    expect(store.getItem('ruby_unsaved_calls')).toBeNull();
  });

  it('retries, then keeps the record for the next visit of the same user only', async () => {
    const save = vi.fn<SaveDeps['save']>(async () => {
      throw new Error('down');
    });
    const { d } = deps(save);
    expect(await saveCallRecord('u1', rec('a'), d)).toBe(false);
    expect(save).toHaveBeenCalledTimes(3);
    save.mockReset();
    save.mockResolvedValue(undefined);
    expect(await retryUnsavedCalls('u2', d)).toBe(0);
    expect(save).not.toHaveBeenCalled();
    expect(await retryUnsavedCalls('u1', d)).toBe(1);
    expect(await retryUnsavedCalls('u1', d)).toBe(0);
  });

  it('replaces an earlier copy of the same call (early copy, then the final one)', async () => {
    const save = vi.fn(async () => {});
    const { d } = deps(save);
    keepLocally('u1', { ...rec('a'), recording: null }, d);
    keepLocally('u1', { ...rec('a'), recording: { final_sha256: 'x' } }, d);
    await retryUnsavedCalls('u1', d);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ ...rec('a'), recording: { final_sha256: 'x' } });
  });

  it('sends with keepalive when the tab closes and keeps a copy', async () => {
    const save = vi.fn(async () => {});
    const { store, d } = deps(save);
    saveOnPageHide('u1', rec('a'), d);
    expect(save).toHaveBeenCalledWith(rec('a'), { keepalive: true });
    expect(store.getItem('ruby_unsaved_calls')).toContain('"a"');
  });

  it('works without storage', async () => {
    const save = vi.fn(async () => {});
    expect(await saveCallRecord('u1', rec('a'), { save, sleep: async () => {}, storage: () => null })).toBe(true);
  });
});
