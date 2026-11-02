/**
 * The side-panel weight card, open by default: the weight, the finished
 * weight, the target, a chip per common metal, and a compare table (the
 * common five, or every metal on request). Every figure is the model's
 * measured volume times the cited density of that row's alloy.
 */
import { useId, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

import { COMMON_ALLOYS, METAL_ALLOYS } from '@/lib/metal-weight/alloys';
import { FINISHING_NOTE, formatDwt, formatFixed2, formatGrams, targetSummary } from '@/lib/metal-weight/format';
import { dwtFromGrams, finishedGrams, gramsFromVolume } from '@/lib/metal-weight/weight';
import { cn } from '@/lib/utils';

import type { WeightViewProps } from './types';

export function WeightCard({ source, target, alloy, setAlloyId, requestedUnavailable = false }: WeightViewProps) {
  const [open, setOpen] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const bodyId = useId();

  const volume = source.available ? source.volumeMm3 : null;
  const grams = volume === null ? null : gramsFromVolume(volume, alloy);
  const summary = grams === null ? null : targetSummary(grams, target, alloy);

  return (
    <section aria-label="Metal weight" className="max-h-[55%] flex-shrink-0 overflow-y-auto border-b border-l border-border bg-card scrollbar-thin">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between border-b border-border px-4 py-3 transition-colors duration-150 hover:bg-accent/20"
      >
        <span className="font-display text-sm font-bold uppercase tracking-[0.15em] text-foreground">Metal weight</span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-muted-foreground">{grams === null ? '—' : formatGrams(grams)}</span>
          {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </span>
      </button>

      {open && (
        <div id={bodyId} className="space-y-3 px-4 py-3 font-mono text-[11px] text-foreground">
          {grams === null ? (
            <p className="leading-relaxed text-muted-foreground">
              Weight not available for this model ({'reason' in source ? source.reason : 'no usable volume'}).
            </p>
          ) : (
            <>
              <div>
                <p className="font-display text-2xl tabular-nums">{formatGrams(grams)}</p>
                <p className="text-muted-foreground">{`${formatDwt(dwtFromGrams(grams))} · ${alloy.label}`}</p>
              </div>
              <p className="text-muted-foreground">{`≈ ${formatGrams(finishedGrams(grams))} ${FINISHING_NOTE}`}</p>
              {target && (
                <p>
                  {`Target ${formatGrams(target.grams)} ±${target.tolerancePct}%`}
                  {summary && (
                    <>
                      {' · '}
                      <span className={summary.status.kind === 'on' ? 'text-emerald-500' : 'text-amber-500'}>{summary.text}</span>
                    </>
                  )}
                </p>
              )}

              <div role="group" aria-label="Metal" className="flex flex-wrap gap-1.5">
                {COMMON_ALLOYS.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    aria-pressed={chip.id === alloy.id}
                    onClick={() => setAlloyId(chip.id)}
                    className={cn(
                      'min-h-8 border px-3 py-1 text-[10px] transition-colors',
                      chip.id === alloy.id ? 'border-foreground bg-foreground text-background' : 'border-border hover:border-foreground/50',
                    )}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              <table className="w-full text-left tabular-nums">
                <caption className="sr-only">Weight in each metal</caption>
                <thead className="text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-1 font-normal">Metal</th>
                    <th scope="col" className="py-1 pl-3 text-right font-normal">g</th>
                    <th scope="col" className="py-1 pl-3 text-right font-normal">dwt</th>
                    <th scope="col" className="py-1 pl-3 text-right font-normal">Finished</th>
                  </tr>
                </thead>
                <tbody>
                  {(showAll ? METAL_ALLOYS : COMMON_ALLOYS).map((row) => {
                    const rowGrams = gramsFromVolume(volume, row);
                    if (rowGrams === null) return null;
                    const current = row.id === alloy.id;
                    return (
                      <tr key={row.id} aria-current={current ? 'true' : undefined} className={current ? 'text-foreground' : 'text-muted-foreground'}>
                        <th scope="row" className="py-1 pr-2 font-normal">{row.label}</th>
                        <td className="py-1 pl-3 text-right">{formatFixed2(rowGrams)}</td>
                        <td className="py-1 pl-3 text-right">{formatFixed2(dwtFromGrams(rowGrams))}</td>
                        <td className="py-1 pl-3 text-right">{formatFixed2(finishedGrams(rowGrams))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <button
                type="button"
                aria-expanded={showAll}
                onClick={() => setShowAll((s) => !s)}
                className="text-[10px] uppercase tracking-wider text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                {showAll ? 'Show common metals' : 'Show all metals'}
              </button>

              <p className="leading-relaxed text-muted-foreground">
                {`Density ${alloy.density_g_cm3} g/cm³, `}
                <a href={alloy.source_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
                  {alloy.alloy}
                </a>
                . Gems are not included.
              </p>
            </>
          )}
          {requestedUnavailable && <p className="text-muted-foreground">Requested metal unavailable</p>}
        </div>
      )}
    </section>
  );
}

export default WeightCard;
