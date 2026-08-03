import { Loader2 } from 'lucide-react';
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

interface BrandScanProgressPanelProps {
  progress?: BrandScanProgress;
  fallbackStatus: string;
}

export function BrandScanProgressPanel({
  progress = EMPTY_BRAND_SCAN_PROGRESS,
  fallbackStatus,
}: BrandScanProgressPanelProps) {
  const liveLabel = progress.currentPhase === 'queued' && progress.queuePosition !== null
    ? `Waiting to start, position ${progress.queuePosition} in line`
    : progress.currentPhase ? PHASE_COPY[progress.currentPhase] : fallbackStatus;
  const livePalette = progress.sitePalette.length > 0
    ? progress.sitePalette
    : progress.photoPalette;

  return (
    <div data-testid="brand-scan-progress" className='space-y-3 border border-border p-4 text-sm text-muted-foreground'>
      <div className='flex items-center gap-3'>
        <Loader2 className='h-4 w-4 shrink-0 animate-spin text-foreground' />
        <span className='min-w-0 flex-1 font-medium text-foreground'>{liveLabel}</span>
        <span className='text-xs tabular-nums'>{progress.progressPercent} percent</span>
      </div>
      <div className='h-1.5 overflow-hidden rounded-full bg-muted'>
        <div
          className='h-full origin-left rounded-full bg-foreground transition-transform duration-700'
          style={{ transform: `scaleX(${progress.progressPercent / 100})` }}
        />
      </div>
      {progress.currentPhase === 'ai_analysis' && !progress.brandReadReady && (
        <p className='text-xs leading-relaxed'>This detailed step can take a little longer.</p>
      )}
      {progress.screenshotReady && (
        <div
          data-testid='brand-scan-screenshot-placeholder'
          className='overflow-hidden border border-border bg-muted/30 p-3 animate-fade-in'
        >
          <div className='h-12 animate-pulse bg-muted' />
          <p className='mt-2 text-xs font-medium text-foreground'>Storefront captured</p>
        </div>
      )}
      {livePalette.length > 0 && (
        <div className='flex gap-2' aria-label='Colors discovered so far'>
          {livePalette.slice(0, 8).map((color) => (
            <span
              key={color}
              className='h-6 w-6 rounded-full border border-border animate-fade-in'
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>
      )}
      <div className='space-y-1 text-xs'>
        {progress.productCount !== null && (
          <p>Found {progress.productCount} {progress.productCount === 1 ? 'product' : 'products'}</p>
        )}
        {progress.productTitles.length > 0 && <p>{progress.productTitles.join(', ')}</p>}
        {progress.imageCount !== null && <p>Selected {progress.imageCount} representative images</p>}
        {progress.fonts.length > 0 && <p>Type styles: {progress.fonts.join(', ')}</p>}
        {progress.brandReadReady && <p className='font-medium text-foreground'>Your brand read is ready</p>}
      </div>
    </div>
  );
}
