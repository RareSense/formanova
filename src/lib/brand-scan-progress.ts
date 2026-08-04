import { colorListValue } from '@/lib/brand-colors';

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

interface NormalizedBrandScanEvent {
  key: string;
  name: string;
  phase: BrandScanPhase | null;
  payload: JsonRecord;
  tMs: number;
}

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

/**
 * Palette entries arrive either as hex strings or as weighted records such as
 * `{ hex, weight, source }`. Both are normalized by the shared colour reader.
 */
function colors(value: unknown): string[] {
  return colorListValue(value);
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

/**
 * Names that describe the *envelope* rather than what was discovered. The
 * deployed scanner sends `{ event: 'data', data: { kind: 'products_found' } }`,
 * so the outer field must never win over an inner `kind`.
 */
const ENVELOPE_EVENT_NAMES = new Set(['data', 'phase', 'event', 'progress', 'message']);

function discoveryName(...candidates: unknown[]): string {
  const names = candidates.map((candidate) => textValue(candidate).toLowerCase()).filter(Boolean);
  return names.find((name) => !ENVELOPE_EVENT_NAMES.has(name)) ?? names[0] ?? '';
}

function phaseValue(value: unknown): BrandScanPhase | null {
  const normalized = textValue(value).toLowerCase();
  return ['queued', ...SCAN_PHASES].includes(normalized)
    ? normalized as BrandScanPhase
    : null;
}

function normalizedEvents(value: unknown): NormalizedBrandScanEvent[] {
  return scanEvents(value).map((event, index) => {
    const data = asRecord(event.data);
    const nestedPayload = asRecord(data?.payload);
    const payload = asRecord(event.payload) ?? nestedPayload ?? data ?? event;
    const directName = discoveryName(
      event.kind,
      data?.kind,
      payload.kind,
      event.event,
      data?.event,
    );
    const phase = phaseValue(
      payload.phase
      ?? data?.phase
      ?? event.phase
      ?? (directName === 'queued' || SCAN_PHASES.includes(directName as BrandScanPhase)
        ? directName
        : undefined),
    );
    const name = directName && directName !== 'phase'
      ? directName
      : phase ?? textValue(event.event_type ?? data?.event_type ?? event.type).toLowerCase();
    const elapsed = Number(data?.t_ms ?? event.t_ms ?? payload.t_ms ?? 0);
    const tMs = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
    const eventId = textValue(event.id ?? data?.id ?? event.seq ?? data?.seq);
    const scanId = textValue(event.scan_id ?? data?.scan_id);
    const fallbackKey = `${name || 'event'}:${tMs}:${JSON.stringify(payload)}:${index}`;

    return {
      key: eventId ? `${scanId}:${eventId}` : fallbackKey,
      name,
      phase,
      payload,
      tMs,
    };
  });
}

function applyEvent(previous: BrandScanProgress, event: NormalizedBrandScanEvent): BrandScanProgress {
  const next: BrandScanProgress = {
    ...previous,
    completedPhases: [...previous.completedPhases],
    productTitles: [...previous.productTitles],
    sitePalette: [...previous.sitePalette],
    photoPalette: [...previous.photoPalette],
    fonts: [...previous.fonts],
  };

  next.elapsedMs = Math.max(next.elapsedMs, event.tMs);

  if (event.phase) {
    next.currentPhase = event.phase;
    if (!next.completedPhases.includes(event.phase)) next.completedPhases.push(event.phase);
    if (event.phase === 'queued') {
      const position = Number(event.payload.position);
      next.queuePosition = Number.isFinite(position) ? position : null;
    } else {
      next.queuePosition = null;
    }
  }

  if (event.name === 'products_found') {
    const count = Number(event.payload.count);
    next.productCount = Number.isFinite(count) ? count : next.productCount;
    next.productTitles = listValue(event.payload.titles).slice(0, 5);
  } else if (event.name === 'images_selected') {
    const count = Number(event.payload.count);
    next.imageCount = Number.isFinite(count) ? count : next.imageCount;
  } else if (event.name === 'palette_extracted') {
    const combined = colors(event.payload.hexes);
    next.sitePalette = combined.length > 0 ? combined : colors(event.payload.site);
    next.photoPalette = colors(event.payload.photo);
  } else if (event.name === 'fonts_detected') {
    next.fonts = listValue(event.payload.families).slice(0, 6);
  } else if (event.name === 'screenshot_ready') {
    next.screenshotReady = true;
  } else if (event.name === 'interpretation_ready') {
    next.brandReadReady = true;
  }

  // Phase events carry the scanner's own `ordinal` of `total`, which is more
  // honest than counting the phases this client happens to have seen.
  const ordinal = Number(event.payload.ordinal);
  const total = Number(event.payload.total);
  const measuredPercent = event.phase && event.phase !== 'queued'
    && Number.isFinite(ordinal) && Number.isFinite(total) && total > 0
    ? Math.round((ordinal / total) * 100)
    : null;
  const visibleCompleted = next.completedPhases.filter((phase) => phase !== 'queued').length;
  const computedPercent = next.currentPhase === 'queued'
    ? 4
    : measuredPercent ?? Math.min(92, 8 + visibleCompleted * 14);
  next.progressPercent = Math.max(previous.progressPercent, Math.min(96, computedPercent));
  return next;
}

export function mergeBrandScanProgress(previous: BrandScanProgress, value: unknown): BrandScanProgress {
  return normalizedEvents(value).reduce(applyEvent, previous);
}

export interface BrandScanProgressTimeline {
  ingest: (value: unknown) => void;
  stop: () => void;
}

/**
 * Longest pause allowed between two reveals from the same batch. A poll can
 * return a whole scan at once (a rejoined or slow-flushing workflow), and
 * replaying that on the raw t_ms timeline would stretch reveals across minutes
 * the merchant no longer has to wait.
 */
const MAX_REVEAL_GAP_MS = 1_200;

/**
 * Replays newly observed events on their scanner-authored t_ms timeline.
 * Late events reveal immediately, coalesced events keep their relative order and
 * spacing up to `MAX_REVEAL_GAP_MS`, and anything still queued when the scan
 * ends is flushed rather than dropped.
 */
export function createBrandScanProgressTimeline(
  onProgress: (progress: BrandScanProgress) => void,
  initial: BrandScanProgress = EMPTY_BRAND_SCAN_PROGRESS,
): BrandScanProgressTimeline {
  let progress = initial;
  let stopped = false;
  let lastTMs: number | null = null;
  let lastDueAt = Date.now();
  const seen = new Set<string>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const pending: NormalizedBrandScanEvent[] = [];

  const reveal = (event: NormalizedBrandScanEvent) => {
    const index = pending.indexOf(event);
    if (index >= 0) pending.splice(index, 1);
    progress = applyEvent(progress, event);
  };

  return {
    ingest(value) {
      const now = Date.now();
      const fresh = normalizedEvents(value)
        .filter((event) => {
          if (seen.has(event.key)) return false;
          seen.add(event.key);
          return true;
        })
        .sort((left, right) => left.tMs - right.tMs);

      for (const event of fresh) {
        const gap = lastTMs === null ? 0 : Math.min(MAX_REVEAL_GAP_MS, Math.max(0, event.tMs - lastTMs));
        const dueAt = Math.max(now, lastDueAt + gap);
        lastTMs = event.tMs;
        lastDueAt = dueAt;
        pending.push(event);
        const timer = setTimeout(() => {
          timers.delete(timer);
          if (stopped) return;
          reveal(event);
          onProgress(progress);
        }, Math.max(0, dueAt - Date.now()));
        timers.add(timer);
      }
    },
    stop() {
      stopped = true;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      if (pending.length === 0) return;
      for (const event of [...pending]) reveal(event);
      onProgress(progress);
    },
  };
}
