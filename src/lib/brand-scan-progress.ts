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
  /** Most recent real page the scanner reported working on, if any. */
  lastPageUrl: string | null;
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
  lastPageUrl: null,
  elapsedMs: 0,
};

type JsonRecord = Record<string, unknown>;

interface NormalizedBrandScanEvent {
  key: string;
  name: string;
  phase: BrandScanPhase | null;
  payload: JsonRecord;
  tMs: number;
  /** Monotonic within a scan and immutable once emitted. Ordering authority. */
  seq: number | null;
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
    // `seq` is monotonic within a scan and immutable once emitted, so it is the
    // identity. `scan_id` must NOT appear in the key: it legitimately changes
    // over a scan's life (pending-xxx, then the stored run id, then null once
    // the activity ends), which made the same event look new each time it
    // changed and re-applied it. The timeline instance is already scoped to one
    // workflow, so `seq` alone is unique.
    const rawSeq = Number(data?.seq ?? event.seq ?? payload.seq);
    const seq = Number.isFinite(rawSeq) ? rawSeq : null;
    const eventId = textValue(event.id ?? data?.id);
    const fallbackKey = `${name || 'event'}:${tMs}:${JSON.stringify(payload)}:${index}`;

    return {
      key: seq !== null ? `seq:${seq}` : eventId ? `id:${eventId}` : fallbackKey,
      name,
      phase,
      payload,
      tMs,
      seq,
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

  // Findings accumulate. The scanner revisits phases and can re-emit a stage
  // with an empty payload (observed: product_probes running twice, the second
  // reporting zero products). Overwriting unconditionally made findings the
  // merchant had already seen disappear mid-scan, so an empty field is only
  // ever treated as "nothing new here", never as "forget what you found".
  if (event.name === 'products_found') {
    const count = Number(event.payload.count);
    if (Number.isFinite(count) && (count > 0 || next.productCount === null)) {
      next.productCount = count;
    }
    const titles = listValue(event.payload.titles).slice(0, 5);
    if (titles.length > 0) next.productTitles = titles;
  } else if (event.name === 'images_selected') {
    const count = Number(event.payload.count);
    next.imageCount = Number.isFinite(count) ? count : next.imageCount;
  } else if (event.name === 'palette_extracted') {
    const combined = colors(event.payload.hexes);
    const site = combined.length > 0 ? combined : colors(event.payload.site);
    const photo = colors(event.payload.photo);
    if (site.length > 0) next.sitePalette = site;
    if (photo.length > 0) next.photoPalette = photo;
  } else if (event.name === 'fonts_detected') {
    const families = listValue(event.payload.families).slice(0, 6);
    if (families.length > 0) next.fonts = families;
  } else if (event.name === 'screenshot_ready') {
    next.screenshotReady = true;
    // Lets the status line name the page actually being read instead of a
    // generic stage label.
    const pageUrl = textValue(event.payload.page_url);
    if (pageUrl) next.lastPageUrl = pageUrl;
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
 * Applies newly observed events the moment they are seen.
 *
 * Reveals used to be queued behind timers and spaced out to look like a live
 * drip. That was a lie the merchant paid for: the scanner already emits its
 * findings on its own schedule (products land within seconds, palette and
 * fonts only in the final phase), so the stagger added lag on top of a wait
 * that was already backend-bound, and a batch arriving late replayed slowly
 * enough to look like everything rendered at the end.
 *
 * Events are deduplicated by key and applied in t_ms order, so a poll that
 * returns the whole scan at once is still applied in the order it happened.
 */
export function createBrandScanProgressTimeline(
  onProgress: (progress: BrandScanProgress) => void,
  initial: BrandScanProgress = EMPTY_BRAND_SCAN_PROGRESS,
): BrandScanProgressTimeline {
  let progress = initial;
  let stopped = false;
  const seen = new Set<string>();

  return {
    ingest(value) {
      if (stopped) return;
      const fresh = normalizedEvents(value)
        .filter((event) => {
          if (seen.has(event.key)) return false;
          seen.add(event.key);
          return true;
        })
        // Order by seq where present: it is the authority, and t_ms ties are
        // common (palette and fonts are emitted at the same millisecond).
        .sort((left, right) => (
          left.seq !== null && right.seq !== null
            ? left.seq - right.seq
            : left.tMs - right.tMs
        ));

      if (fresh.length === 0) return;
      progress = fresh.reduce(applyEvent, progress);
      onProgress(progress);
    },
    stop() {
      stopped = true;
    },
  };
}
