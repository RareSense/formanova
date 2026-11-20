import { useState } from 'react';
import type { FixLayout } from '@/lib/photo-check/fix';

/**
 * Before and after on one frame, split by a slider (the Squoosh pattern).
 * "Before" is the original placed exactly where the fix put it, so the two
 * line up; areas the original did not cover show as light grey.
 */
export function BeforeAfter({ beforeSrc, afterSrc, layout }: { beforeSrc: string; afterSrc: string; layout: FixLayout }) {
  const [split, setSplit] = useState(50);
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <figure className="m-0">
      <div className="relative mx-auto w-full overflow-hidden bg-white" style={{ aspectRatio: `${layout.outW} / ${layout.outH}`, maxHeight: '60vh' }}>
        <img src={afterSrc} alt="Fixed photo" className="absolute inset-0 h-full w-full object-contain" />
        <div className="absolute inset-0 bg-muted" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }} aria-hidden="true">
          <img
            src={beforeSrc}
            alt=""
            className="absolute max-w-none"
            style={{ left: pct(layout.drawX, layout.outW), top: pct(layout.drawY, layout.outH), width: pct(layout.drawW, layout.outW), height: pct(layout.drawH, layout.outH) }}
          />
        </div>
        <div className="pointer-events-none absolute inset-y-0 w-px bg-foreground/60" style={{ left: `${split}%` }} aria-hidden="true" />
        <span className="pointer-events-none absolute left-2 top-2 bg-background/90 px-2 py-0.5 font-body text-xs">Before</span>
        <span className="pointer-events-none absolute right-2 top-2 bg-background/90 px-2 py-0.5 font-body text-xs">After</span>
      </div>
      <label className="mt-3 block font-body text-xs text-muted-foreground">
        <span className="sr-only">Compare before and after</span>
        <input type="range" min={0} max={100} value={split} onChange={(e) => setSplit(Number(e.target.value))} className="w-full accent-foreground" />
      </label>
    </figure>
  );
}
