import type { MetalAlloy } from '@/lib/metal-weight/alloys';
import type { WeightSource } from '@/lib/metal-weight/source';
import type { WeightTarget } from '@/lib/metal-weight/weight';

/** What the weight bar and card share: the model's volume, its target, and the metal on screen. */
export interface WeightViewProps {
  source: WeightSource;
  target: WeightTarget | null;
  alloy: MetalAlloy;
  setAlloyId: (id: string) => void;
  requestedUnavailable?: boolean;
  /** More than one metal body: the total is shown in the one chosen metal. */
  twoTone?: boolean;
}
