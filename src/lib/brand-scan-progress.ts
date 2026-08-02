export type BrandScanPhase =
  | 'queued'
  | 'discovery'
  | 'product_probes'
  | 'browser'
  | 'images'
  | 'processing'
  | 'ai_analysis';

export interface BrandScanProgress {
  currentPhase: BrandScanPhase | null;
  completedPhases: BrandScanPhase[];
  progressPercent: number;
  queuePosition: number | null;
  productCount: number | null;
  productTitles: string[];
  imageCount: number | null;
  sitePalette: string[];
  photoPalette: string[];
  fonts: string[];
  screenshotReady: boolean;
  brandReadReady: boolean;
  elapsedMs: number;
}

export const EMPTY_BRAND_SCAN_PROGRESS: BrandScanProgress = {
  currentPhase: null,
  completedPhases: [],
  progressPercent: 2,
  queuePosition: null,
  productCount: null,
  productTitles: [],
  imageCount: null,
  sitePalette: [],
  photoPalette: [],
  fonts: [],
  screenshotReady: false,
  brandReadReady: false,
  elapsedMs: 0,
};

type JsonRecord = Record<string, unknown>;

const SCAN_PHASES: BrandScanPhase[] = [
  'discovery',
  'product_probes',
  'browser',
  'images',
  'processing',
  'ai_analysis',
];

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function textValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function listValue(value: unknown): string[] {
  if (Array.isArray(value)) return unique(value.map(textValue));
  const text = textValue(value);
  return text ? unique(text.split(/[,;|]/)) : [];
}

function colors(value: unknown): string[] {
  return unique(listValue(value).flatMap((item) => {
    const match = item.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!match) return [];
    const raw = match[1];
    return ['#' + (raw.length === 3
      ? raw.split('').map((part) => part + part).join('')
      : raw).toUpperCase()];
  }));
}

function scanEvents(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.map(asRecord).filter((item): item is JsonRecord => Boolean(item));
  const record = asRecord(value);
  if (!record) return [];

  for (const key of ['events', 'phases', 'items', 'history']) {
    if (Array.isArray(record[key])) {
      const events = scanEvents(record[key]);
      if (events.length > 0) return events;
    }
  }

  const progress = asRecord(record.progress);
  const runtime = asRecord(record.runtime);
  for (const candidate of [record.scan_progress_events, progress?.phases, runtime?.phases]) {
    const events = scanEvents(candidate);
    if (events.length > 0) return events;
  }
  return [];
}

function phaseValue(value: unknown): BrandScanPhase | null {
  const normalized = textValue(value).toLowerCase();
  return ['queued', ...SCAN_PHASES].includes(normalized)
    ? normalized as BrandScanPhase
    : null;
}

export function mergeBrandScanProgress(previous: BrandScanProgress, value: unknown): BrandScanProgress {
  const next: BrandScanProgress = {
    ...previous,
    completedPhases: [...previous.completedPhases],
    productTitles: [...previous.productTitles],
    sitePalette: [...previous.sitePalette],
    photoPalette: [...previous.photoPalette],
    fonts: [...previous.fonts],
  };

  for (const event of scanEvents(value)) {
    const payload = asRecord(event.payload) ?? event;
    const eventType = textValue(event.event_type || event.type).toLowerCase();
    const phase = phaseValue(payload.phase ?? event.phase);
    const elapsed = Number(event.t_ms ?? payload.t_ms ?? 0);
    if (Number.isFinite(elapsed)) next.elapsedMs = Math.max(next.elapsedMs, elapsed);

    if (phase && (eventType === 'phase' || !eventType || payload.phase !== undefined)) {
      next.currentPhase = phase;
      if (!next.completedPhases.includes(phase)) next.completedPhases.push(phase);
      if (phase === 'queued') {
        const position = Number(payload.position);
        next.queuePosition = Number.isFinite(position) ? position : null;
      } else {
        next.queuePosition = null;
      }
    }

    const kind = textValue(event.kind ?? payload.kind).toLowerCase();
    if (kind === 'products_found') {
      const count = Number(payload.count);
      next.productCount = Number.isFinite(count) ? count : next.productCount;
      next.productTitles = listValue(payload.titles).slice(0, 5);
    } else if (kind === 'images_selected') {
      const count = Number(payload.count);
      next.imageCount = Number.isFinite(count) ? count : next.imageCount;
    } else if (kind === 'palette_extracted') {
      next.sitePalette = colors(payload.site);
      next.photoPalette = colors(payload.photo);
    } else if (kind === 'fonts_detected') {
      next.fonts = listValue(payload.families).slice(0, 6);
    } else if (kind === 'screenshot_ready') {
      next.screenshotReady = true;
    } else if (kind === 'interpretation_ready') {
      next.brandReadReady = true;
    }
  }

  const visibleCompleted = next.completedPhases.filter((phase) => phase !== 'queued').length;
  const computedPercent = next.currentPhase === 'queued' ? 4 : Math.min(92, 8 + visibleCompleted * 14);
  next.progressPercent = Math.max(previous.progressPercent, computedPercent);
  return next;
}
