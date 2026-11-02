/**
 * The weight section of the CAD inspector (right panel), first and open by
 * default, the way CAD properties panels show it:
 *
 *   METAL WEIGHT                    Target 28 g ±5%
 *   Metal                 Grams    DWT   After polish ⓘ
 *   (●) ● 14K Yellow Gold  27.98  17.99   26.58
 *   ( ) ● 10K Yellow Gold  24.64  15.85   23.41
 *   More metals ▾
 *   ✓ On target
 *   Metal only. Stones not included.      How we calculate ⓘ
 *
 * The rows are the metal picker: native radios sharing one name (arrow keys
 * move the choice), and a click anywhere on a row picks it. One line per row:
 * number columns are sized in ch to their longest figure, the name takes the
 * rest and truncates only in a very narrow panel (full detail in the row
 * tooltip). Collapsed, the header still reads "27.98 g · 14K Yellow Gold".
 * Every figure is the measured volume times that row's cited density.
 */
import { useId, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronUp, Info } from 'lucide-react';

import MaterialSphere from '@/components/cad-studio/MaterialSphere';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ALLOY_GROUPS, COMMON_ALLOYS, type MetalAlloy } from '@/lib/metal-weight/alloys';
import { FINISHING_TOOLTIP, formatFixed2, formatGrams, formatTargetChip, targetSummary } from '@/lib/metal-weight/format';
import { dwtFromGrams, finishedGrams, gramsFromVolume } from '@/lib/metal-weight/weight';
import { cn } from '@/lib/utils';

import { appearanceForAlloy } from './appearance';
import type { WeightViewProps } from './types';

export const WEIGHT_HINT_STORAGE_KEY = 'formanova_metal_weight_hint';

function hintSeen(): boolean {
  try {
    return window.localStorage.getItem(WEIGHT_HINT_STORAGE_KEY) === 'seen';
  } catch {
    return false;
  }
}

function rememberHintSeen() {
  try {
    window.localStorage.setItem(WEIGHT_HINT_STORAGE_KEY, 'seen');
  } catch {
    // Storage unavailable: the hint just shows again next visit.
  }
}

const INFO_BUTTON = 'inline-flex shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const NUM = 'whitespace-nowrap pl-3 text-right tabular-nums';
/** Padding inside a number column (pl-3). */
const COL_PAD = '0.75rem';

interface Row {
  alloy: MetalAlloy;
  g: string;
  dwt: string;
  after: string;
}

export function WeightCard({ source, target, alloy, setAlloyId, requestedUnavailable = false, twoTone = false }: WeightViewProps) {
  const [open, setOpen] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [showHint, setShowHint] = useState(() => !hintSeen());
  const ids = useId();

  const volume = source.available ? source.volumeMm3 : null;
  const grams = volume === null ? null : gramsFromVolume(volume, alloy);
  const summary = grams === null ? null : targetSummary(grams, target, alloy);
  const onTarget = summary?.status.kind === 'on';

  const headerNote = !open
    ? (grams === null ? 'Not available' : `${formatGrams(grams)} · ${alloy.name}`)
    : (target && grams !== null ? formatTargetChip(target) : '');

  const pick = (id: string) => {
    if (showHint) {
      setShowHint(false);
      rememberHintSeen();
    }
    if (id !== alloy.id) setAlloyId(id);
  };

  // The common five, plus the shown metal when it is not one of them.
  const common = COMMON_ALLOYS.some((a) => a.id === alloy.id) ? COMMON_ALLOYS : [...COMMON_ALLOYS, alloy];
  const groups: Array<{ label: string | null; alloys: readonly MetalAlloy[] }> = showAll
    ? ALLOY_GROUPS.map((g) => ({ label: g.label, alloys: g.alloys }))
    : [{ label: null, alloys: common }];
  const toRow = (item: MetalAlloy): Row | null => {
    const g = gramsFromVolume(volume, item);
    return g === null ? null : { alloy: item, g: formatFixed2(g), dwt: formatFixed2(dwtFromGrams(g)), after: formatFixed2(finishedGrams(g)) };
  };
  const rowGroups = groups.map((group) => ({ label: group.label, rows: group.alloys.map(toRow).filter((r): r is Row => r !== null) }));
  const allRows = rowGroups.flatMap((g) => g.rows);
  // Number columns fit their longest figure (or header), in ch of this mono font.
  const widest = (key: 'g' | 'dwt' | 'after', header: number) => Math.max(header, ...allRows.map((r) => r[key].length));

  const row = (item: Row) => {
    const selected = item.alloy.id === alloy.id;
    return (
      <tr
        key={item.alloy.id}
        data-selected={selected ? 'true' : undefined}
        title={`${item.alloy.name}: ${item.alloy.alloy}, ${item.alloy.density_cited} g/cm³`}
        onClick={() => pick(item.alloy.id)}
        className={cn(
          'h-8 cursor-pointer transition-colors focus-within:outline focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-ring',
          selected ? 'bg-accent font-semibold text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
        )}
      >
        <td className="min-w-0 pr-2">
          <span className="flex min-w-0 items-center gap-2">
            <input
              type="radio"
              name={`${ids}-metal`}
              value={item.alloy.id}
              checked={selected}
              onChange={() => pick(item.alloy.id)}
              aria-label={item.alloy.name}
              className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-foreground"
            />
            <MaterialSphere category="metal" preview={appearanceForAlloy(item.alloy).preview} size={10} className="shrink-0" />
            <span className="min-w-0 truncate">{item.alloy.name}</span>
          </span>
        </td>
        <td className={NUM}>{item.g}</td>
        <td className={NUM}>{item.dwt}</td>
        <td className={NUM}>{item.after}</td>
      </tr>
    );
  };

  return (
    // Its own provider, so the card works wherever it is mounted (nested providers are fine).
    <TooltipProvider delayDuration={200}>
    <section aria-label="Metal weight" className="max-h-[60%] flex-shrink-0 overflow-y-auto overflow-x-hidden border-b border-l border-border bg-card scrollbar-thin">
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
        <div id={`${ids}-body`} className="px-4 pb-3 pt-2 font-mono text-[11px] text-foreground">
          {grams === null ? (
            <p className="py-1 text-muted-foreground" title={'reason' in source ? source.reason : undefined}>
              Weight not available for this model.
            </p>
          ) : (
            <>
              <table className="w-full table-fixed border-collapse">
                <caption className="sr-only">Metal weight in each metal</caption>
                <colgroup>
                  <col />
                  <col style={{ width: `calc(${widest('g', 5)}ch + ${COL_PAD})` }} />
                  <col style={{ width: `calc(${widest('dwt', 3)}ch + ${COL_PAD})` }} />
                  <col style={{ width: `calc(max(${widest('after', 0)}ch, 12ch + 1rem) + ${COL_PAD})` }} />
                </colgroup>
                <thead className="text-muted-foreground">
                  <tr className="h-8">
                    <th scope="col" className="pl-[calc(0.875rem+0.5rem+10px+0.5rem)] text-left font-normal">Metal</th>
                    <th scope="col" className={cn(NUM, 'font-normal')}>Grams</th>
                    <th scope="col" className={cn(NUM, 'font-normal')}>DWT</th>
                    <th scope="col" className={cn(NUM, 'font-normal')}>
                      <span className="inline-flex items-center justify-end gap-1">
                        After polish
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" aria-label="About After polish" className={cn(INFO_BUTTON, 'h-3.5 w-3.5')}>
                              <Info className="h-3 w-3" aria-hidden="true" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="font-mono text-[11px]">{FINISHING_TOOLTIP}</TooltipContent>
                        </Tooltip>
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody role="radiogroup" aria-label="Metal">
                  {rowGroups.map((group) => [
                    group.label && (
                      <tr key={`group-${group.label}`} className="h-7">
                        <th scope="rowgroup" colSpan={4} className="pt-1 text-left align-bottom text-[10px] font-normal uppercase tracking-[0.12em] text-muted-foreground">
                          {group.label}
                        </th>
                      </tr>
                    ),
                    ...group.rows.map(row),
                  ])}
                </tbody>
              </table>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-expanded={showAll}
                onClick={() => setShowAll((s) => !s)}
                className="-ml-3 mt-1 font-mono text-[11px] text-muted-foreground"
              >
                {showAll ? 'Fewer metals' : 'More metals'}
                {showAll ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
              </Button>

              {showHint && <p className="mt-1 text-muted-foreground">Pick a metal to see its weight</p>}

              {summary && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p
                      tabIndex={0}
                      className={cn(
                        'mt-2 flex w-fit items-center gap-1.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        onTarget ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400',
                      )}
                    >
                      {onTarget ? <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /> : <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />}
                      {summary.text}
                    </p>
                  </TooltipTrigger>
                  <TooltipContent className="font-mono text-[11px]">{summary.detail}</TooltipContent>
                </Tooltip>
              )}

              {twoTone && <p className="mt-2 text-muted-foreground">{`Two-tone: total of all metal parts, weighed in ${alloy.name}.`}</p>}

              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                <span>Metal only. Stones not included.</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className={cn(INFO_BUTTON, 'gap-1 underline-offset-2 hover:underline')}>
                      How we calculate
                      <Info className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-64 font-mono text-[11px] leading-relaxed">
                    Weight = model volume × alloy density. Density from{' '}
                    <a href={alloy.source_url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                      {alloy.alloy}
                    </a>
                    {` (${alloy.density_cited} g/cm³).`}
                  </PopoverContent>
                </Popover>
              </div>
            </>
          )}
          {requestedUnavailable && <p className="mt-2 text-muted-foreground">Requested metal unavailable</p>}
        </div>
      )}
    </section>
    </TooltipProvider>
  );
}

export default WeightCard;
