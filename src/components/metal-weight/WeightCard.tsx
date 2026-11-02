/**
 * The version's metal weight, a section of the CAD left panel right under
 * VERSIONS, open by default:
 *
 *   METAL WEIGHT                                 Target 28 g ±5%
 *   ┌──────┬──────────────────┬───────┬───────┬──────────┐
 *   │ Pick │ Metal            │ Grams │  DWT  │ Polished │
 *   ├──────┼──────────────────┼───────┼───────┼──────────┤
 *   │ (●)  │ ● 14K Yellow Gold│ 27.98 │ 17.99 │    26.58 │
 *   └──────┴──────────────────┴───────┴───────┴──────────┘
 *   [More metals ▾]                               [⤓ Download]
 *   ✓ On target
 *   Metal only. Stones not included.          How we calculate ⓘ
 *
 * A lined table (shadcn Table): the rows are the metal picker, native radios
 * sharing one name (arrow keys move the choice), and a click anywhere on a
 * row picks it. Short headers carry their full meaning in tooltips. Collapsed,
 * the header still reads "27.98 g · 14K Yellow Gold". Every figure is the
 * measured volume times that row's cited density; Download saves the listed
 * metals as CSV.
 */
import { useId, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronUp, Download, Info } from 'lucide-react';

import MaterialSphere from '@/components/cad-studio/MaterialSphere';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ALLOY_GROUPS, COMMON_ALLOYS, METAL_ALLOYS, type MetalAlloy } from '@/lib/metal-weight/alloys';
import { downloadCsv, weightCsv, weightCsvFilename } from '@/lib/metal-weight/csv';
import { FINISHING_TOOLTIP, castingCheckLine, formatFixed2, formatGrams, formatTargetChip, targetSummary } from '@/lib/metal-weight/format';
import { GRAMS_PER_DWT, dwtFromGrams, finishedGrams, gramsFromVolume } from '@/lib/metal-weight/weight';
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

/** The left panel's section label style (VERSIONS, REFERENCE IMAGES). */
export const SECTION_LABEL = 'font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground';
const HEAD = 'h-8 px-2 font-mono text-[10px] font-normal text-muted-foreground';
const NUM_HEAD = cn(HEAD, 'w-px whitespace-nowrap text-right');
const NUM = 'h-8 w-px whitespace-nowrap px-2 py-0 text-right font-mono text-[11px] tabular-nums';
const INFO_BUTTON = 'rounded-sm underline decoration-dotted underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function HeaderTip({ label, tip }: { label: string; tip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={`${label}: ${tip}`} className={INFO_BUTTON}>{label}</button>
      </TooltipTrigger>
      <TooltipContent className="font-mono text-[11px]">{tip}</TooltipContent>
    </Tooltip>
  );
}

const DWT_TIP = `pennyweight, 1 dwt = ${GRAMS_PER_DWT} g`;
const POLISHED_TIP = `after polish, ${FINISHING_TOOLTIP.charAt(0).toLowerCase()}${FINISHING_TOOLTIP.slice(1)}`;

export interface WeightCardProps extends WeightViewProps {
  /** For the CSV: the model's name and the version shown, e.g. "V2". */
  modelName?: string | null;
  versionLabel?: string | null;
}

export function WeightCard({
  source, target, alloy, setAlloyId, requestedUnavailable = false, twoTone = false, volumeFlags = [], modelName = null, versionLabel = null,
}: WeightCardProps) {
  const [open, setOpen] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [showHint, setShowHint] = useState(() => !hintSeen());
  const ids = useId();

  const volume = source.available ? source.volumeMm3 : null;
  const grams = volume === null ? null : gramsFromVolume(volume, alloy);
  const summary = grams === null ? null : targetSummary(grams, target, alloy);
  const onTarget = summary?.status.kind === 'on';
  const castingCheck = castingCheckLine(volumeFlags);

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

  const download = () => {
    if (volume === null) return;
    downloadCsv(
      weightCsvFilename(modelName, versionLabel),
      weightCsv({ modelName, versionLabel, volumeMm3: volume, target, alloys: showAll ? METAL_ALLOYS : common }),
    );
  };

  const row = (item: MetalAlloy) => {
    const rowGrams = gramsFromVolume(volume, item);
    if (rowGrams === null) return null;
    const selected = item.alloy === alloy.alloy && item.id === alloy.id;
    return (
      <TableRow
        key={item.id}
        data-state={selected ? 'selected' : undefined}
        title={`${item.name}: ${item.alloy}, ${item.density_cited} g/cm³`}
        onClick={() => pick(item.id)}
        className={cn(
          // The tint and the keyboard ring stay inside the table's lines.
          'h-8 cursor-pointer border-b border-border has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-ring',
          selected ? 'bg-foreground/[0.07] font-semibold text-foreground hover:bg-foreground/[0.07]' : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground',
        )}
      >
        <TableCell className="h-8 w-px px-2 py-0">
          <input
            type="radio"
            name={`${ids}-metal`}
            value={item.id}
            checked={selected}
            onChange={() => pick(item.id)}
            aria-label={item.name}
            className="block h-3.5 w-3.5 cursor-pointer accent-foreground"
          />
        </TableCell>
        <TableCell className="h-8 w-full max-w-0 px-2 py-0">
          <span className="flex min-w-0 items-center gap-1.5">
            <MaterialSphere category="metal" preview={appearanceForAlloy(item).preview} size={10} className="shrink-0" />
            <span className="min-w-0 truncate font-body text-[11px]">{item.name}</span>
          </span>
        </TableCell>
        <TableCell className={NUM}>{formatFixed2(rowGrams)}</TableCell>
        <TableCell className={NUM}>{formatFixed2(dwtFromGrams(rowGrams))}</TableCell>
        <TableCell className={NUM}>{formatFixed2(finishedGrams(rowGrams))}</TableCell>
      </TableRow>
    );
  };

  return (
    // Its own provider, so the section works wherever it is mounted (nested providers are fine).
    <TooltipProvider delayDuration={200}>
      <section aria-label="Metal weight" className="min-w-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${ids}-body`}
          onClick={() => setOpen((o) => !o)}
          className="mb-2 flex w-full min-w-0 items-baseline justify-between gap-3 text-left"
        >
          <span className={cn(SECTION_LABEL, 'flex shrink-0 items-center gap-1.5')}>
            Metal weight
            {open ? <ChevronUp className="h-3 w-3" aria-hidden="true" /> : <ChevronDown className="h-3 w-3" aria-hidden="true" />}
          </span>
          {headerNote && <span className="min-w-0 truncate font-mono text-[10px] tracking-[0.05em] text-muted-foreground tabular-nums">{headerNote}</span>}
        </button>

        {open && (
          <div id={`${ids}-body`} className="space-y-2 font-mono text-[11px] text-foreground">
            {grams === null ? (
              <p className="text-muted-foreground" title={'reason' in source ? source.reason : undefined}>
                Weight not available for this model.
              </p>
            ) : (
              <>
                <div data-weight-table className="border border-border">
                  <Table>
                    <caption className="sr-only">Metal weight in each metal</caption>
                    <TableHeader className="bg-muted/60">
                      <TableRow className="border-b border-border hover:bg-transparent">
                        <TableHead className={cn(HEAD, 'w-px')}><span className="sr-only">Pick</span></TableHead>
                        <TableHead className={cn(HEAD, 'w-full max-w-0 truncate text-left')}>Metal</TableHead>
                        <TableHead className={NUM_HEAD}>Grams</TableHead>
                        <TableHead className={NUM_HEAD}><HeaderTip label="DWT" tip={DWT_TIP} /></TableHead>
                        <TableHead className={NUM_HEAD}><HeaderTip label="Polished" tip={POLISHED_TIP} /></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody role="radiogroup" aria-label="Metal">
                      {groups.map((group) => [
                        group.label && (
                          <TableRow key={`group-${group.label}`} className="border-b border-border bg-muted/30 hover:bg-muted/30">
                            <th scope="rowgroup" colSpan={5} className="h-6 px-2 text-left font-mono text-[10px] font-normal uppercase tracking-[0.12em] text-muted-foreground">
                              {group.label}
                            </th>
                          </TableRow>
                        ),
                        ...group.alloys.map(row),
                      ])}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <Button type="button" variant="ghost" size="sm" aria-expanded={showAll} onClick={() => setShowAll((s) => !s)} className="-ml-3 font-mono text-[11px] text-muted-foreground">
                    {showAll ? 'Fewer metals' : 'More metals'}
                    {showAll ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={download} aria-label="Download weight table (CSV)" className="font-mono text-[11px]">
                    <Download aria-hidden="true" />
                    Download
                  </Button>
                </div>

                {showHint && <p className="text-muted-foreground">Pick a metal to see its weight</p>}

                {castingCheck && <p className="text-muted-foreground">{castingCheck}</p>}

                {summary && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p
                        tabIndex={0}
                        className={cn(
                          'flex w-fit items-center gap-1.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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

                {twoTone && <p className="text-muted-foreground">{`Two-tone: total of all metal parts, weighed in ${alloy.name}.`}</p>}

                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                  <span>Metal only. Stones not included.</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" className="inline-flex items-center gap-1 rounded-sm underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
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
            {requestedUnavailable && <p className="text-muted-foreground">Requested metal unavailable</p>}
          </div>
        )}
      </section>
    </TooltipProvider>
  );
}

export default WeightCard;
