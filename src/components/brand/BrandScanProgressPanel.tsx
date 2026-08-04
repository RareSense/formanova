import { Check, Loader2 } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { DARK_THEMES } from '@/components/ThemeLogo';
import { BrandFindingRow } from '@/components/brand/BrandFindingRow';
import { type InsightFeedKey } from '@/components/brand/brand-insight-meta';
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

/** Strips the scheme and trailing slash so a URL reads as a page, not a link. */
function readablePage(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
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

  // Name the page actually being read where the scanner told us one. A
  // concrete "Reading catbirdnyc.com/collections/rings" beats a stage label.
  const phaseLabel = progress.currentPhase ? PHASE_COPY[progress.currentPhase] : fallbackStatus;
  const liveLabel = progress.currentPhase === 'queued' && progress.queuePosition !== null
    ? `Waiting to start, position ${progress.queuePosition} in line`
    : progress.lastPageUrl && progress.currentPhase !== 'ai_analysis'
      ? `Reading ${readablePage(progress.lastPageUrl)}`
      : phaseLabel;

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
      {/* Phase label only. The findings below are the real progress signal -
          a percentage bar just competed with them for attention. */}
      <div className="flex items-center gap-3">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-foreground" />
        <span className="min-w-0 flex-1 font-medium text-foreground">{liveLabel}</span>
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
          {rows.map((row) => {
            const found = Boolean(row.value || row.swatches?.length);
            return (
              <BrandFindingRow
                key={row.key}
                data-testid={`scan-finding-${row.key}`}
                finding={row.key}
                value={row.value}
                swatches={row.swatches}
                accent={accent}
                isDark={isDark}
                trailing={found
                  ? <Check className="h-4 w-4 text-formanova-success" aria-label="Found" />
                  : <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Analyzing" />}
              />
            );
          })}
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
