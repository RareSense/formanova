/**
 * The CAD page's one metal choice. The weight table and the Material panel's
 * "All metal parts" both set it: a pick in the table changes the look of every
 * metal part, and a look picked in the panel changes the metal the weight is
 * shown in (see appearance.ts for how karat and colour map to a look).
 */
import { useCallback, useState } from 'react';

import { alloyForAppearance, appearanceForAlloy } from '@/components/metal-weight/appearance';
import type { WeightViewProps } from '@/components/metal-weight/types';
import { useMetalChoice } from '@/hooks/useMetalChoice';
import { findAlloy } from '@/lib/metal-weight/alloys';
import type { MetalWeightInput } from '@/lib/metal-weight/source';

export function useCadMetal(input: MetalWeightInput, applyMetalToAll: (materialId: string) => void): {
  view: WeightViewProps;
  /** For the Material panel's "All metal parts". */
  chooseLook: (materialId: string) => void;
  /** The look "All metal parts" shows: always the same metal as the weight table. */
  look: string;
} {
  const { alloy, setAlloyId, requestedUnavailable } = useMetalChoice(input);
  /** A look picked in the Material panel, kept while it still stands for the shown metal. */
  const [pickedLook, setPickedLook] = useState<string | null>(null);

  const chooseAlloy = useCallback((id: string) => {
    const chosen = findAlloy(id);
    if (!chosen) return;
    setAlloyId(chosen.id);
    setPickedLook(null);
    applyMetalToAll(appearanceForAlloy(chosen).id);
  }, [setAlloyId, applyMetalToAll]);

  const chooseLook = useCallback((materialId: string) => {
    applyMetalToAll(materialId);
    setPickedLook(materialId);
    const id = alloyForAppearance(materialId, alloy);
    if (id) setAlloyId(id);
  }, [alloy, setAlloyId, applyMetalToAll]);

  // Brushed Gold on 14K yellow stays Brushed Gold; a look without a cited
  // density (copper) stays as picked; anything else follows the metal.
  const pickedFor = pickedLook ? alloyForAppearance(pickedLook, alloy) : undefined;
  const look = pickedLook && (pickedFor === null || pickedFor === alloy.id) ? pickedLook : appearanceForAlloy(alloy).id;

  return {
    look,
    view: { source: input.source, target: input.target, alloy, setAlloyId: chooseAlloy, requestedUnavailable, twoTone: input.twoTone, volumeFlags: input.volumeFlags },
    chooseLook,
  };
}
