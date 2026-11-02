/**
 * The weight section of the CAD inspector (right panel), first and open by
 * default, the way CAD properties panels show it:
 *
 *   METAL WEIGHT                Target 28.00 g ±5%
 *       Metal                 g      dwt   Finished (−5%)
 *   (●) ● 14K Yellow Gold   27.98  17.99   26.58
 *   ( ) ● 10K Yellow Gold   24.64  15.85   23.41
 *       Show all metals
 *   ✓ On target (−0.1%)
 *
 * The rows are the metal picker: native radios sharing one name, so arrow keys
 * move the choice as in any radio group, and a click anywhere on a row picks
 * it. Collapsed, the header still reads "27.98 g · 14K Yellow Gold". Every
 * figure is the measured volume times that row's cited density.
 */
import { useId, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronUp } from 'lucide-react';

import MaterialSphere from '@/components/cad-studio/MaterialSphere';
import { Button } from '@/components/ui/button';
import { ALLOY_GROUPS, COMMON_ALLOYS, type MetalAlloy } from '@/lib/metal-weight/alloys';
import { FINISHING_NOTE_SHORT, formatFixed2, formatGrams, targetSummary } from '@/lib/metal-weight/format';
import { dwtFromGrams, finishedGrams, gramsFromVolume } from '@/lib/metal-weight/weight';
import { cn } from '@/lib/utils';

import { appearanceForAlloy } from './appearance';
import type { WeightViewProps } from './types';

// Number columns shrink to their figures, so the metal name gets the rest of a narrow panel.
const NUM = 'w-px whitespace-nowrap py-1.5 pl-3 text-right tabular-nums';

export function WeightCard({ source, target, alloy, setAlloyId, requestedUnavailable = false, twoTone = false }: WeightViewProps) {
  const [open, setOpen] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const ids = useId();

  const volume = source.available ? source.volumeMm3 : null;
  const grams = volume === null ? null : gramsFromVolume(volume, alloy);
  const summary = grams === null ? null : targetSummary(grams, target, alloy);
  const onTarget = summary?.status.kind === 'on';

  const headerNote = !open
    ? (grams === null ? 'Not available' : `${formatGrams(grams)} · ${alloy.label}`)
    : (target ? `Target ${formatGrams(target.grams)} ±${target.tolerancePct}%` : '');

  // The common five, plus the shown metal when it is not one of them.
  const common = COMMON_ALLOYS.some((a) => a.id === alloy.id) ? COMMON_ALLOYS : [...COMMON_ALLOYS, alloy];
  const groups: Array<{ label: string | null; alloys: readonly MetalAlloy[] }> = showAll
    ? ALLOY_GROUPS.map((g) => ({ label: g.label, alloys: g.alloys }))
    : [{ label: null, alloys: common }];

  const row = (item: MetalAlloy) => {
    const rowGrams = gramsFromVolume(volume, item);
    if (rowGrams === null) return null;
    const selected = item.id === alloy.id;
    return (
      <tr
        key={item.id}
        data-selected={selected ? 'true' : undefined}
        onClick={() => { if (!selected) setAlloyId(item.id); }}
        className={cn('cursor-pointer transition-colors', selected ? 'bg-accent/50 font-semibold text-foreground' : 'text-muted-foreground hover:bg-accent/20')}
      >
        <td className="py-1.5 pl-4 pr-2">
          <span className="flex min-w-0 items-center gap-2 leading-snug">
            <input
              type="radio"
              name={`${ids}-metal`}
              value={item.id}
              checked={selected}
              onChange={() => setAlloyId(item.id)}
              aria-label={item.label}
              className="h-3.5 w-3.5 shrink-0 accent-foreground"
            />
            <MaterialSphere category="metal" preview={appearanceForAlloy(item).preview} size={12} />
            <span className="min-w-0 break-words">{item.label}</span>
          </span>
        </td>
        <td className={NUM}>{formatFixed2(rowGrams)}</td>
        <td className={NUM}>{formatFixed2(dwtFromGrams(rowGrams))}</td>
        <td className={cn(NUM, 'pr-4')}>{formatFixed2(finishedGrams(rowGrams))}</td>
      </tr>
    );
  };

  return (
    <section aria-label="Metal weight" className="max-h-[60%] flex-shrink-0 overflow-y-auto border-b border-l border-border bg-card scrollbar-thin">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${ids}-body`}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 border-b border-border px-4 py-3 transition-colors duration-150 hover:bg-accent/20"
      >
        <span className="shrink-0 font-display text-sm font-bold uppercase tracking-[0.15em] text-foreground">Metal weight</span>
        <span className="flex min-w-0 items-center gap-2">
          {headerNote && <span className="truncate font-mono text-[10px] text-muted-foreground">{headerNote}</span>}
          {open ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        </span>
      </button>

      {open && (
        <div id={`${ids}-body`} className="space-y-2 pb-3 pt-1 font-mono text-[11px] text-foreground">
          {grams === null ? (
            <p className="px-4 pt-2 leading-relaxed text-muted-foreground">
              Weight not available for this model ({'reason' in source ? source.reason : 'no usable volume'}).
            </p>
          ) : (
            <>
              <table className="w-full">
                <caption className="sr-only">Metal weight in each metal</caption>
                <thead className="text-[10px] text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-1.5 pl-[3.25rem] text-left font-normal">Metal</th>
                    <th scope="col" className="w-px py-1.5 pl-3 text-right font-normal">g</th>
                    <th scope="col" className="w-px py-1.5 pl-3 text-right font-normal">dwt</th>
                    <th scope="col" className="w-px py-1.5 pl-3 pr-4 text-right font-normal">{`Finished ${FINISHING_NOTE_SHORT}`}</th>
                  </tr>
                </thead>
                <tbody role="radiogroup" aria-label="Metal">
                  {groups.map((group) => [
                    group.label && (
                      <tr key={`group-${group.label}`}>
                        <th scope="rowgroup" colSpan={4} className="pb-0.5 pl-4 pt-2 text-left text-[9px] font-normal uppercase tracking-[0.15em] text-muted-foreground">
                          {group.label}
                        </th>
                      </tr>
                    ),
                    ...group.alloys.map(row),
                  ])}
                </tbody>
              </table>

              <div className="px-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-expanded={showAll}
                  onClick={() => setShowAll((s) => !s)}
                  className="font-mono text-[11px] text-muted-foreground"
                >
                  {showAll ? 'Show common metals' : 'Show all metals'}
                  {showAll ? <ChevronUp /> : <ChevronDown />}
                </Button>
              </div>

              {summary && (
                <p className={cn('flex items-center gap-1.5 px-4', onTarget ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>
                  {onTarget ? <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /> : <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />}
                  {summary.text}
                </p>
              )}

              {twoTone && (
                <p className="px-4 text-muted-foreground">{`Two-tone: total of all metal parts, weighed in ${alloy.label}.`}</p>
              )}

              <p className="px-4 text-[10px] leading-relaxed text-muted-foreground">
                {`Density ${alloy.density_cited} g/cm³, `}
                <a href={alloy.source_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
                  {alloy.alloy}
                </a>
                . Gems not included.
              </p>
            </>
          )}
          {requestedUnavailable && <p className="px-4 text-muted-foreground">Requested metal unavailable</p>}
        </div>
      )}
    </section>
  );
}

export default WeightCard;
