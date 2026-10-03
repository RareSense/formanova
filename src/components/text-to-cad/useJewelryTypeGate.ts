/**
 * Generate is refused until a jewelry type is chosen. Nothing is preselected,
 * so the first attempt without a choice shows an inline error on the cards,
 * scrolls them into view and focuses the first one. The error clears as soon
 * as a card is chosen.
 */

import { useCallback, useRef, useState } from 'react';

import type { CadJewelryType } from '@/lib/ring-cad-nurbs-api';

export const JEWELRY_TYPE_REQUIRED = 'Choose what you are making to continue.';

export function useJewelryTypeGate(jewelryType: CadJewelryType | null, onGenerate: () => void) {
  const [attempted, setAttempted] = useState(false);
  const cardsRef = useRef<HTMLDivElement>(null);

  const guardedGenerate = useCallback(() => {
    if (!jewelryType) {
      setAttempted(true);
      const firstCard = cardsRef.current?.querySelector<HTMLElement>('[role="radio"]');
      firstCard?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      firstCard?.focus({ preventScroll: true });
      return;
    }
    onGenerate();
  }, [jewelryType, onGenerate]);

  return {
    cardsRef,
    guardedGenerate,
    typeError: attempted && !jewelryType ? JEWELRY_TYPE_REQUIRED : null,
  };
}
