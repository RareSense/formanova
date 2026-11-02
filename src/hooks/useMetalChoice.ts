/**
 * Which metal a model's weight is shown in.
 *
 * In order: the metal the user picked for this model (kept across reloads),
 * the target's alloy, the alloy the request asked for, the user's last pick
 * from any model, and 14K Yellow Gold. Every candidate goes through findAlloy,
 * so a stored or payload id without a cited density can never be shown; a
 * request for one falls back and says so.
 *
 * Picks live in localStorage when it can and in memory when it cannot
 * (private mode, blocked storage): the page works either way. Per-model picks
 * are an ordered list of [model, alloy] pairs, newest last, capped at 100.
 */
import { useCallback, useState } from 'react';

import { DEFAULT_ALLOY_ID, findAlloy, type MetalAlloy } from '@/lib/metal-weight/alloys';
import type { MetalWeightInput } from '@/lib/metal-weight/source';

export const METAL_CHOICE_STORAGE_KEY = 'formanova_metal_alloy';
export const MODEL_PICKS_STORAGE_KEY = 'formanova_metal_alloy_by_model';
const MAX_MODEL_PICKS = 100;

type ModelPicks = Array<[string, string]>;

/** Stored per-model picks; anything that is not a list of [string, cited alloy id] pairs is dropped. */
function readModelPicks(): ModelPicks {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(MODEL_PICKS_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((pair): pair is [string, string] =>
      Array.isArray(pair) && pair.length === 2 && typeof pair[0] === 'string' && findAlloy(pair[1]) !== null);
  } catch {
    return [];
  }
}

function withPick(picks: ModelPicks, key: string, id: string): ModelPicks {
  return [...picks.filter(([k]) => k !== key), [key, id] as [string, string]].slice(-MAX_MODEL_PICKS);
}

function storeModelPicks(picks: ModelPicks) {
  try {
    window.localStorage.setItem(MODEL_PICKS_STORAGE_KEY, JSON.stringify(picks));
  } catch {
    // Storage unavailable: the in-memory picks still hold for this page.
  }
}

function readStoredPick(): string | null {
  try {
    return window.localStorage.getItem(METAL_CHOICE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storePick(id: string) {
  try {
    window.localStorage.setItem(METAL_CHOICE_STORAGE_KEY, id);
  } catch {
    // Storage unavailable: the in-memory pick still holds for this page.
  }
}

export interface MetalChoice {
  alloy: MetalAlloy;
  /** Ignores ids that are not in the alloy table. */
  setAlloyId: (id: string) => void;
  /** The target or request named a metal with no cited density, so the default is shown instead. */
  requestedUnavailable: boolean;
}

export function useMetalChoice({ key, target, requestedAlloyId }: Pick<MetalWeightInput, 'key' | 'target' | 'requestedAlloyId'>): MetalChoice {
  const [lastPick, setLastPick] = useState<string | null>(readStoredPick);
  const [modelPicks, setModelPicks] = useState<ModelPicks>(readModelPicks);

  const preferredId = target?.alloyId ?? requestedAlloyId ?? null;
  const preferred = findAlloy(preferredId);
  const pickedHere = key === null ? null : findAlloy(modelPicks.find(([k]) => k === key)?.[1]);
  const alloy = pickedHere ?? preferred ?? findAlloy(lastPick) ?? (findAlloy(DEFAULT_ALLOY_ID) as MetalAlloy);

  const setAlloyId = useCallback((id: string) => {
    const chosen = findAlloy(id);
    if (!chosen) return;
    if (key !== null) {
      // Merged with what is stored now, so another card's picks are kept.
      setModelPicks((current) => {
        const next = withPick([...readModelPicks().filter(([k]) => !current.some(([c]) => c === k)), ...current], key, chosen.id);
        storeModelPicks(next);
        return next;
      });
    }
    setLastPick(chosen.id);
    storePick(chosen.id);
  }, [key]);

  return { alloy, setAlloyId, requestedUnavailable: preferredId !== null && !preferred };
}
