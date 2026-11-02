/**
 * "25.4 g · 10K": the small weight tag on version and history cards, with the
 * full figure in its tooltip. A version without a measured volume gets no tag:
 * an empty corner on an old card says nothing false.
 */
import { Scale } from 'lucide-react';

import { alloyShortLabel, type MetalAlloy } from '@/lib/metal-weight/alloys';
import { formatTagWeight, formatWeight } from '@/lib/metal-weight/format';
import type { WeightSource } from '@/lib/metal-weight/source';
import { gramsFromVolume } from '@/lib/metal-weight/weight';
import { cn } from '@/lib/utils';

export function WeightTag({ source, alloy, className }: { source: WeightSource; alloy: MetalAlloy; className?: string }) {
  const grams = source.available ? gramsFromVolume(source.volumeMm3, alloy) : null;
  if (grams === null) return null;
  return (
    <span
      title={`${formatWeight(grams)}, ${alloy.label}`}
      className={cn('inline-flex items-center gap-1 whitespace-nowrap font-mono text-[10px] tracking-wider text-muted-foreground', className)}
    >
      <Scale aria-hidden="true" className="h-3 w-3 shrink-0" />
      <span>{`${formatTagWeight(grams)} · ${alloyShortLabel(alloy)}`}</span>
    </span>
  );
}

export default WeightTag;
