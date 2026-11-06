/**
 * Saving a finished call (ruby_post_call) so that no call is ever lost: the record
 * is kept in localStorage until the server confirms it, retried a few times, sent
 * with keepalive when the tab closes, and retried on the next visit (Nova did the
 * same after losing a 9-minute call).
 */
import { savePostCall } from './sales-call-api';

const STORE_KEY = 'ruby_unsaved_calls';
const MAX_KEPT = 5;
const TRIES = 3;

export interface SaveDeps {
  save(payload: Record<string, unknown>, opts?: { keepalive?: boolean }): Promise<void>;
  sleep(ms: number): Promise<void>;
  storage(): Storage | null;
}

const defaultDeps: SaveDeps = {
  save: savePostCall,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  storage: () => {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
      return null;
    }
  },
};

interface Kept {
  owner: string;
  payload: Record<string, unknown>;
}

const keyOf = (payload: Record<string, unknown>) => String(payload.call_session_id ?? '');

function readKept(deps: SaveDeps): Kept[] {
  try {
    const raw = deps.storage()?.getItem(STORE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((k) => k && typeof k.owner === 'string' && k.payload) : [];
  } catch {
    return [];
  }
}

function writeKept(deps: SaveDeps, list: Kept[]) {
  try {
    const store = deps.storage();
    if (!store) return;
    if (list.length) store.setItem(STORE_KEY, JSON.stringify(list.slice(-MAX_KEPT)));
    else store.removeItem(STORE_KEY);
  } catch {
    /* storage full or blocked: the server save still runs */
  }
}

/** Keeps (or replaces) the local copy of a call record until it is saved. */
export function keepLocally(owner: string, payload: Record<string, unknown>, deps: SaveDeps = defaultDeps) {
  const key = keyOf(payload);
  writeKept(deps, [...readKept(deps).filter((k) => keyOf(k.payload) !== key), { owner, payload }]);
}

function dropLocal(payload: Record<string, unknown>, deps: SaveDeps) {
  const key = keyOf(payload);
  writeKept(
    deps,
    readKept(deps).filter((k) => keyOf(k.payload) !== key),
  );
}

/** Saves the record with retries; true once the server has it. */
export async function saveCallRecord(
  owner: string,
  payload: Record<string, unknown>,
  deps: SaveDeps = defaultDeps,
): Promise<boolean> {
  keepLocally(owner, payload, deps);
  for (let i = 0; i < TRIES; i++) {
    try {
      await deps.save(payload);
      dropLocal(payload, deps);
      return true;
    } catch (e) {
      if ((e as Error)?.name === 'AuthExpiredError') return false; // kept for the next visit
      if (i < TRIES - 1) await deps.sleep(800 * 2 ** i);
    }
  }
  return false;
}

/** The tab is closing mid-call: send what we have with keepalive, keep a copy for next time. */
export function saveOnPageHide(owner: string, payload: Record<string, unknown>, deps: SaveDeps = defaultDeps) {
  keepLocally(owner, payload, deps);
  void deps.save(payload, { keepalive: true }).catch(() => {});
}

/** Retries records an earlier visit of the same user could not save. */
export async function retryUnsavedCalls(owner: string, deps: SaveDeps = defaultDeps): Promise<number> {
  let saved = 0;
  for (const kept of readKept(deps)) {
    if (kept.owner !== owner) continue;
    try {
      await deps.save(kept.payload);
      dropLocal(kept.payload, deps);
      saved++;
    } catch {
      /* try again next time */
    }
  }
  return saved;
}
