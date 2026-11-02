/**
 * The CAD page's one metal choice. The weight table and the Material panel's
 * "All metal parts" both set it: a pick in the table changes the look of every
 * metal part, and a look picked in the panel changes the metal the weight is
 * shown in (see appearance.ts for how karat and colour map to a look).
 */
import { useCallback } from 'react';

import { alloyForAppearance, appearanceForAlloy } from '@/components/metal-weight/appearance';
import type { WeightViewProps } from '@/components/metal-weight/types';
import { useMetalChoice } from '@/hooks/useMetalChoice';
import { findAlloy } from '@/lib/metal-weight/alloys';
import type { MetalWeightInput } from '@/lib/metal-weight/source';

export function useCadMetal(input: MetalWeightInput, applyMetalToAll: (materialId: string) => void): {
  view: WeightViewProps;
  /** For the Material panel's "All metal parts". */
  chooseLook: (materialId: string) => void;
} {
  const { alloy, setAlloyId, requestedUnavailable } = useMetalChoice(input);

  const chooseAlloy = useCallback((id: string) => {
    const chosen = findAlloy(id);
    if (!chosen) return;
    setAlloyId(chosen.id);
    applyMetalToAll(appearanceForAlloy(chosen).id);
  }, [setAlloyId, applyMetalToAll]);

  const chooseLook = useCallback((materialId: string) => {
    applyMetalToAll(materialId);
    const id = alloyForAppearance(materialId, alloy);
    if (id) setAlloyId(id);
  }, [alloy, setAlloyId, applyMetalToAll]);

  return {
    view: { source: input.source, target: input.target, alloy, setAlloyId: chooseAlloy, requestedUnavailable },
    chooseLook,
  };
}
