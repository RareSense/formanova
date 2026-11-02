/**
 * The weight table as a CSV, for the caster or the quote: model, version,
 * measured volume and target, then one row per listed metal with grams, dwt,
 * after-polish grams and the cited density with its source. Nothing is added
 * that is not on screen or in the cited table.
 */
import { findAlloy, type MetalAlloy } from './alloys';
import { formatFixed2, formatGramsShort } from './format';
import { dwtFromGrams, finishedGrams, gramsFromVolume, type WeightTarget } from './weight';

/** One CSV cell: quoted when needed, and a leading = + - @ defused so a spreadsheet never runs it. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const row = (cells: string[]) => cells.map(csvCell).join(',');

export function weightCsv({ modelName, versionLabel, volumeMm3, target, alloys }: {
  modelName: string | null;
  versionLabel: string | null;
  volumeMm3: number;
  target: WeightTarget | null;
  alloys: readonly MetalAlloy[];
}): string {
  const targetAlloy = target?.alloyId ? findAlloy(target.alloyId) : null;
  const targetText = target
    ? `${formatGramsShort(target.grams)} ±${target.tolerancePct}%${targetAlloy ? ` in ${targetAlloy.name}` : ''}`
    : '';
  const lines = [
    row(['Model', modelName ?? '']),
    row(['Version', versionLabel ?? '']),
    row(['Metal volume (mm³)', String(volumeMm3)]),
    row(['Target', targetText]),
    '',
    row(['Metal', 'Grams', 'DWT', 'After polish (g)', 'Density (g/cm³)', 'Density source', 'Source URL']),
  ];
  for (const alloy of alloys) {
    const grams = gramsFromVolume(volumeMm3, alloy);
    if (grams === null) continue;
    lines.push(row([
      alloy.name,
      formatFixed2(grams),
      formatFixed2(dwtFromGrams(grams)),
      formatFixed2(finishedGrams(grams)),
      alloy.density_cited,
      alloy.alloy,
      alloy.source_url,
    ]));
  }
  return `${lines.join('\r\n')}\r\n`;
}

/** "<model>_v<version>_metal_weight.csv", with anything but letters and digits made "_". */
export function weightCsvFilename(modelName: string | null, versionLabel: string | null): string {
  const slug = (modelName ?? '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'model';
  const version = versionLabel?.match(/\d+/)?.[0];
  return version ? `${slug}_v${version}_metal_weight.csv` : `${slug}_metal_weight.csv`;
}

/** Hands the CSV to the browser as a file; no network involved. */
export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
