/**
 * Which metal a model's weight is shown in.
 *
 * In order: the metal the user picked for this model in this session, the
 * target's alloy, the alloy the request asked for, the user's last pick from
 * any model, and 14K Yellow Gold. Every candidate goes through findAlloy, so a
 * stored or payload id without a cited density can never be shown; a request
 * for one falls back and says so.
 *
 * The last pick lives in localStorage when it can and in memory when it
 * cannot (private mode, blocked storage): the page works either way.
 */
import { useCallback, useState } from 'react';

import { DEFAULT_ALLOY_ID, findAlloy, type MetalAlloy } from '@/lib/metal-weight/alloys';
import type { MetalWeightInput } from '@/lib/metal-weight/source';

export const METAL_CHOICE_STORAGE_KEY = 'formanova_metal_alloy';

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
  const [picked, setPicked] = useState<{ key: string | null; id: string } | null>(null);

  const preferredId = target?.alloyId ?? requestedAlloyId ?? null;
  const preferred = findAlloy(preferredId);
  const pickedHere = picked && picked.key === key ? findAlloy(picked.id) : null;
  const alloy = pickedHere ?? preferred ?? findAlloy(lastPick) ?? (findAlloy(DEFAULT_ALLOY_ID) as MetalAlloy);

  const setAlloyId = useCallback((id: string) => {
    const chosen = findAlloy(id);
    if (!chosen) return;
    setPicked({ key, id: chosen.id });
    setLastPick(chosen.id);
    storePick(chosen.id);
  }, [key]);

  return { alloy, setAlloyId, requestedUnavailable: preferredId !== null && !preferred };
}
