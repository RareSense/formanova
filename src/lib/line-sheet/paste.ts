import type { Product } from './layout';

/** The text columns of the pieces table, in the order they appear on screen. */
export const TABLE_FIELDS = ['name', 'sku', 'metal', 'stone', 'size', 'wholesale', 'retail'] as const;
export type TableField = (typeof TABLE_FIELDS)[number];

/** Header words people use in their own spreadsheets, matched to our columns. */
const HEADER_WORDS: Record<TableField, RegExp> = {
  name: /^(name|product|product name|item|item name|title|description|style name)$/,
  sku: /^(sku|style|style #|style no\.?|style number|item #|item no\.?|code|ref|reference)$/,
  metal: /^(metal|material|materials|metal type)$/,
  stone: /^(stone|stones|gem|gems|gemstone|gemstones)$/,
  size: /^(size|sizes|ring size|length|dimensions)$/,
  wholesale: /^(wholesale|wholesale price|ws|ws price|cost|trade price|price)$/,
  retail: /^(retail|retail price|msrp|rrp|srp|suggested retail)$/,
};

/** True when the clipboard holds more than one cell (a spreadsheet copy), not plain typing. */
export function isMultiCell(text: string): boolean {
  return /[\t\n]/.test(text.replace(/\r?\n$/, ''));
}

function splitRows(text: string): string[][] {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\n$/, '')
    .split('\n')
    .map((line) => line.split('\t').map((c) => c.trim()));
}

/** Column order from a header row, or null when the first row is data. */
function headerMap(cells: string[]): (TableField | null)[] | null {
  const mapped = cells.map((c) => {
    const word = c.toLowerCase().replace(/\s+/g, ' ').trim();
    return (Object.keys(HEADER_WORDS) as TableField[]).find((f) => HEADER_WORDS[f].test(word)) ?? null;
  });
  return mapped.filter(Boolean).length >= 2 ? mapped : null;
}

/**
 * Turns a spreadsheet copy into row patches. With a header row (Name, SKU,
 * Wholesale…) columns are matched by name, in any order, and unknown columns
 * are ignored. Without one, cells fill the table from `startField` onward,
 * left to right, exactly as a spreadsheet paste would.
 */
export function parsePaste(text: string, startField: TableField = 'name'): Partial<Product>[] {
  const rows = splitRows(text).filter((r) => r.some((c) => c !== ''));
  if (rows.length === 0) return [];
  const header = headerMap(rows[0]);
  const columns: (TableField | null)[] = header ?? (() => {
    const start = TABLE_FIELDS.indexOf(startField);
    return rows[0].map((_, i) => TABLE_FIELDS[start + i] ?? null);
  })();
  const data = header ? rows.slice(1) : rows;
  return data.map((cells) => {
    const patch: Partial<Product> = {};
    cells.forEach((value, i) => {
      const field = columns[i];
      if (field) patch[field] = value;
    });
    return patch;
  });
}
