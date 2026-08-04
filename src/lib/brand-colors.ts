/**
 * Colour normalization shared by the brand scan's live progress stream and its
 * final result parser.
 *
 * The scanner emits palettes in several shapes depending on the stage: bare hex
 * strings, `rgb()` strings, and weighted records such as
 * `{ hex: '#F8F8F7', weight: 0.5, source: 'product_image' }`. Both readers must
 * agree on how those become swatches, so the logic lives here rather than being
 * duplicated per caller.
 */

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function uniqueColors(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

/** Expands `#abc` / `#abcd` / `#aabbcc` / `#aabbccdd` and `rgb()` into `#RRGGBB`. */
export function normalizeHexColor(value: string): string[] {
  const colors: string[] = [];
  for (const match of value.matchAll(/#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})(?![0-9a-f])/gi)) {
    const raw = match[1];
    const rgb = raw.length === 3 || raw.length === 4
      ? raw.slice(0, 3).split('').map((part) => `${part}${part}`).join('')
      : raw.slice(0, 6);
    colors.push(`#${rgb.toUpperCase()}`);
  }

  const rgb = value.match(/rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/i);
  if (rgb) {
    const hex = rgb.slice(1, 4)
      .map((channel) => Math.min(255, Number(channel)).toString(16).padStart(2, '0'))
      .join('');
    colors.push(`#${hex.toUpperCase()}`);
  }
  return colors;
}

function channels(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const raw = match[1];
  return [
    parseInt(raw.slice(0, 2), 16),
    parseInt(raw.slice(2, 4), 16),
    parseInt(raw.slice(4, 6), 16),
  ];
}

/**
 * Mixes `hex` toward white (or toward black on dark surfaces) by `amount`.
 * Brand palettes are frequently saturated, and painting a card with them at
 * full strength buries the text. The lightened tint keeps the brand's colour
 * identity while leaving the ink layer legible.
 */
export function tintColor(hex: string, amount: number, towardDark = false): string {
  const rgb = channels(hex);
  if (!rgb) return hex;
  const target = towardDark ? 0 : 255;
  const mixed = rgb.map((channel) =>
    Math.round(channel + (target - channel) * Math.min(1, Math.max(0, amount))),
  );
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** Collects every colour in `value`, whatever shape the scanner used. */
export function colorListValue(value: unknown): string[] {
  if (typeof value === 'string') return normalizeHexColor(value);
  if (Array.isArray(value)) return uniqueColors(value.flatMap(colorListValue));

  const record = asRecord(value);
  if (!record) return [];
  if (typeof record.r === 'number' && typeof record.g === 'number' && typeof record.b === 'number') {
    return colorListValue(`rgb(${record.r}, ${record.g}, ${record.b})`);
  }

  for (const key of ['hex', 'hex_code', 'value', 'color', 'colour']) {
    const colors = colorListValue(record[key]);
    if (colors.length > 0) return colors;
  }
  return uniqueColors(Object.values(record).flatMap(colorListValue));
}
