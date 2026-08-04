import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import { DARK_THEMES } from '@/components/ThemeLogo';
import { tintColor } from '@/lib/brand-colors';
import { INSIGHT_META, type InsightFeedKey } from '@/components/brand/brand-insight-meta';
import {
  EMPTY_BRAND_SCAN_PROGRESS,
  type BrandScanPhase,
  type BrandScanProgress,
} from '@/lib/brand-scan-api';

const PHASE_COPY: Record<BrandScanPhase, string> = {
  queued: 'Waiting to start',
  discovery: 'Finding your pages',
  product_probes: 'Reading your products',
  browser: 'Rendering your storefront',
  images: 'Selecting your images',
  processing: 'Extracting colors and fonts',
  ai_analysis: 'Writing your brand read',
};

/** Findings the scanner only resolves in its final interpretation pass. */
const INTERPRETED_KEYS: InsightFeedKey[] = ['identity', 'targetMarkets'];

interface FeedRow {
  key: InsightFeedKey;
  /** Absent while the finding is still being worked out. */
  value?: string;
  swatches?: string[];
}

/**
 * One discovered fact. Renders the real value only - a row never exists to say
 * something was not found, so there is no placeholder copy to read past.
 */
function FindingRow({ row, accent, isDark }: { row: FeedRow; accent?: string; isDark: boolean }) {
  const meta = INSIGHT_META[row.key];
  const Icon = meta.icon;
  const found = Boolean(row.value || row.swatches?.length);

  return (
    <div
      data-testid={`scan-finding-${row.key}`}
      className="flex animate-fade-in items-center gap-3 border border-border bg-background/60 px-3.5 py-3 text-left"
    >
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        /* Tint toward the surface, not always toward white - a white disc
           under a light icon is invisible on the dark themes. */
        style={{ backgroundColor: accent ? tintColor(accent, 0.78, isDark) : 'hsl(var(--muted))' }}
      >
        <Icon className="h-4 w-4 text-foreground/70" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {meta.label} {found ? 'found' : ''}
        </p>
        {row.swatches?.length ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5" aria-label="Colors discovered so far">
            {row.swatches.slice(0, 6).map((hex, i) => (
              /* Square, never round - a colour chip, not a bullet. */
              <span
                key={`${hex}-${i}`}
                title={hex}
                className="h-5 w-5 shrink-0 border border-border"
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
        ) : (
          <p className={cn('mt-0.5 line-clamp-2 break-words text-sm', found ? 'text-foreground' : 'italic text-muted-foreground')}>
            {row.value || 'Analyzing...'}
          </p>
        )}
      </div>

      {found ? (
        <Check className="h-4 w-4 shrink-0 text-formanova-success" aria-label="Found" />
      ) : (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-label="Analyzing" />
      )}
    </div>
  );
}

interface BrandScanProgressPanelProps {
  progress?: BrandScanProgress;
  fallbackStatus: string;
}

export function BrandScanProgressPanel({
  progress = EMPTY_BRAND_SCAN_PROGRESS,
  fallbackStatus,
}: BrandScanProgressPanelProps) {
  const { theme } = useTheme();
  const isDark = DARK_THEMES.has(theme);

  const liveLabel = progress.currentPhase === 'queued' && progress.queuePosition !== null
    ? `Waiting to start, position ${progress.queuePosition} in line`
    : progress.currentPhase ? PHASE_COPY[progress.currentPhase] : fallbackStatus;

  const livePalette = progress.sitePalette.length > 0
    ? progress.sitePalette
    : progress.photoPalette;

  const rows: FeedRow[] = [];
  if (livePalette.length > 0) rows.push({ key: 'palette', swatches: livePalette });
  if (progress.productTitles.length > 0) {
    rows.push({ key: 'productFocus', value: progress.productTitles.join(', ') });
  } else if (progress.productCount !== null && progress.productCount > 0) {
    // Zero products is a failed read, not a finding - never badge it "found".
    rows.push({
      key: 'productFocus',
      value: `${progress.productCount} ${progress.productCount === 1 ? 'product' : 'products'}`,
    });
  }
  if (progress.fonts.length > 0) rows.push({ key: 'visualStyle', value: progress.fonts.join(', ') });

  // Interpreted findings only announce themselves once that pass is actually
  // running, so the merchant never faces a wall of spinners at the start.
  if (progress.currentPhase === 'ai_analysis' && !progress.brandReadReady) {
    for (const key of INTERPRETED_KEYS) rows.push({ key });
  }

  const accent = livePalette[0];

  return (
    <div
      data-testid="brand-scan-progress"
      role="status"
      aria-live="polite"
      className="space-y-3.5 border border-border p-4 text-sm text-muted-foreground"
    >
      <div className="flex items-center gap-3">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-foreground" />
        <span className="min-w-0 flex-1 font-medium text-foreground">{liveLabel}</span>
        <span className="text-xs tabular-nums">{progress.progressPercent} percent</span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={progress.progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Brand scan progress"
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full origin-left rounded-full bg-foreground transition-transform duration-700"
          style={{ transform: `scaleX(${progress.progressPercent / 100})` }}
        />
      </div>

      {progress.currentPhase === null && (
        <p className="text-xs leading-relaxed">Nova is starting your scan. This usually takes one to two minutes.</p>
      )}

      {progress.screenshotReady && (
        <p data-testid="brand-scan-screenshot-captured" className="animate-fade-in text-xs font-medium text-foreground">
          Storefront captured
        </p>
      )}

      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((row) => (
            <FindingRow key={row.key} row={row} accent={accent} isDark={isDark} />
          ))}
        </div>
      )}

      {/* The longest phase needs a positive end state. Without this the two
          "Analyzing" rows just blink out and nothing confirms completion. */}
      {progress.brandReadReady && (
        <p
          data-testid="brand-read-ready"
          className="flex animate-fade-in items-center gap-2 text-xs font-medium text-foreground"
        >
          <Check className="h-3.5 w-3.5 shrink-0 text-formanova-success" />
          Your brand read is ready
        </p>
      )}
    </div>
  );
}
