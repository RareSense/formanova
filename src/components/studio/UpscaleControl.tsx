import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Loader2, Maximize2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useAuthenticatedImage } from '@/hooks/useAuthenticatedImage';
import { computeUpscaleFactors, estimateUpscaleCostCached, maxUpscaleFactorForTier } from '@/lib/upscale-api';
import type { Resolution } from '@/components/studio/OutputSettingsPills';
import { cn } from '@/lib/utils';
import creditCoinIcon from '@/assets/icons/credit-coin.png';

/** Run lifecycle for the upscale job, owned by the parent (start + polling). */
export type UpscaleRunStatus = 'idle' | 'starting' | 'processing' | 'completed' | 'error';

type EstimateStatus = 'idle' | 'loading' | 'success' | 'error';

/** Factors at/above this run the slower 2-pass path — grouped in the menu. */
const HIGHER_FACTOR_THRESHOLD = 4;

interface Props {
  /** The generation result to enlarge. */
  resultImageUrl: string | null;
  /** The original generation tier — drives billing and estimates, NOT the output. */
  resolution: Resolution;
  /** Start the upscale with the chosen integer factor. */
  onUpscale: (factor: number) => void;
  /** Lifecycle reported by the parent hook. */
  runStatus: UpscaleRunStatus;
  /** Concise retryable error to show near the control. */
  error?: string | null;
  /** Tight layout for narrow contexts (history cards): no icon, slimmer widths. */
  compact?: boolean;
  /** Pre-select this factor on mount/when it changes (e.g. resuming after a credits purchase). */
  initialFactor?: number;
}

function CoinPrice({ status, cost }: { status: EstimateStatus; cost?: number }) {
  if (status === 'loading' || status === 'idle') {
    return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
  }
  if (status === 'error' || cost == null) {
    return <span className="text-xs text-muted-foreground">Unavailable</span>;
  }
  return (
    <span className="flex items-center gap-1 text-sm font-medium text-foreground">
      <img src={creditCoinIcon} alt="" className="h-4 w-4 object-contain" />
      {cost}
    </span>
  );
}

export function UpscaleControl({
  resultImageUrl,
  resolution,
  onUpscale,
  runStatus,
  error,
  compact = false,
  initialFactor,
}: Props) {
  const resolvedSrc = useAuthenticatedImage(resultImageUrl);

  // Decode the real source pixels so the factor menu uses the true long edge
  // (aspect ratio changes it), not the tier label, and so each factor can show
  // its exact target dimensions (base WxH multiplied by the factor).
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    setDims(null);
    if (!resolvedSrc) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled && img.naturalWidth > 0 && img.naturalHeight > 0) {
        setDims({ w: img.naturalWidth, h: img.naturalHeight });
      }
    };
    img.onerror = () => { /* leave null -> control hidden */ };
    img.src = resolvedSrc;
    return () => { cancelled = true; };
  }, [resolvedSrc]);

  const longestSide = dims ? Math.max(dims.w, dims.h) : null;
  // Offer only factors that are BOTH physically possible (16K long-edge cap) and
  // priced by the policy for this source tier (1k<=x9, 2k<=x6, 4k<=x3).
  const tierMaxFactor = maxUpscaleFactorForTier(resolution);
  const availableFactors = useMemo(
    () => (longestSide ? computeUpscaleFactors(longestSide).filter(f => f <= tierMaxFactor) : []),
    [longestSide, tierMaxFactor],
  );

  const [selectedFactor, setSelectedFactor] = useState<number>(initialFactor ?? 2);
  const [estimates, setEstimates] = useState<Record<number, number>>({});
  const [estimateStatus, setEstimateStatus] = useState<Record<number, EstimateStatus>>({});

  // Apply a resumed factor that arrives after mount (e.g. PhotoCard re-arms it
  // once the result thumbnail enriches). The validity effect below still clamps
  // it to an available factor if the resumed value isn't offered for this image.
  useEffect(() => {
    if (initialFactor != null) setSelectedFactor(initialFactor);
  }, [initialFactor]);

  // Keep the selected factor valid: default to x2, reset to the lowest available
  // factor whenever it leaves the menu (e.g. the source image changed).
  useEffect(() => {
    if (availableFactors.length === 0) return;
    setSelectedFactor(prev => (availableFactors.includes(prev) ? prev : availableFactors[0]));
  }, [availableFactors]);

  // Fetch (cached) price for each available factor. Re-fetch only the keys we
  // don't already have a status for, so caching survives re-renders.
  const factorsKey = availableFactors.join(',');
  const inFlight = useRef<Set<number>>(new Set());
  useEffect(() => {
    let cancelled = false;
    for (const factor of availableFactors) {
      if (estimateStatus[factor] === 'success' || inFlight.current.has(factor)) continue;
      inFlight.current.add(factor);
      setEstimateStatus(prev => ({ ...prev, [factor]: 'loading' }));
      estimateUpscaleCostCached({ resolution, factor })
        .then(cost => {
          if (cancelled) return;
          if (cost != null) {
            setEstimates(prev => ({ ...prev, [factor]: cost }));
            setEstimateStatus(prev => ({ ...prev, [factor]: 'success' }));
          } else {
            setEstimateStatus(prev => ({ ...prev, [factor]: 'error' }));
          }
        })
        .finally(() => { inFlight.current.delete(factor); });
    }
    return () => { cancelled = true; };
    // Excluded: estimateStatus + availableFactors (read as guards only; including
    // them would re-run on every status write and refetch). Safe: factorsKey +
    // resolution fully determine which factors need fetching, and the in-flight
    // guard prevents duplicate requests.
    // Watch: if estimates stop loading after the image changes, verify factorsKey updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factorsKey, resolution]);

  const busy = runStatus === 'starting' || runStatus === 'processing';
  const selectedStatus = estimateStatus[selectedFactor] ?? 'idle';
  const selectedCost = estimates[selectedFactor];
  const canUpscale = !busy && selectedStatus === 'success' && availableFactors.includes(selectedFactor);

  // If maxFactor < 2 there is nothing to offer — hide the control entirely.
  if (longestSide && availableFactors.length === 0) return null;
  // While decoding we don't yet know the factors; render nothing to avoid jank.
  if (!longestSide) return null;

  const lowerFactors = availableFactors.filter(f => f < HIGHER_FACTOR_THRESHOLD);
  const higherFactors = availableFactors.filter(f => f >= HIGHER_FACTOR_THRESHOLD);

  const renderItem = (factor: number) => (
    <DropdownMenuItem
      key={factor}
      onClick={() => setSelectedFactor(factor)}
      className={cn(
        'grid grid-cols-[2.25rem_1fr_auto] items-center gap-3 font-mono text-sm',
        factor === selectedFactor ? 'bg-muted text-foreground' : 'text-muted-foreground',
      )}
    >
      <span className="font-medium">x{factor}</span>
      <span className="text-xs tabular-nums text-foreground/70">
        {dims ? `${dims.w * factor}x${dims.h * factor}` : ''}
      </span>
      <CoinPrice status={estimateStatus[factor] ?? 'idle'} cost={estimates[factor]} />
    </DropdownMenuItem>
  );

  const buttonLabel = () => {
    if (runStatus === 'starting') return 'Starting';
    if (runStatus === 'processing') return 'Upscaling';
    return 'Upscale';
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex w-full items-stretch gap-2">
        {/* Multiplier dropdown (left) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-haspopup="listbox"
              disabled={busy}
              className={cn(
                'flex h-11 items-center justify-between gap-1.5 rounded-md border border-primary/60 bg-background',
                compact ? 'w-16 px-2' : 'w-24 px-3',
                'font-mono text-sm transition-colors hover:border-primary',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              <span className="flex-1 text-center font-medium text-foreground">x{selectedFactor}</span>
              <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 bg-popover border-border">
            {lowerFactors.map(renderItem)}
            {higherFactors.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                  Higher upscale
                </DropdownMenuLabel>
                {higherFactors.map(renderItem)}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Upscale button (right) */}
        <Button
          size="lg"
          disabled={!canUpscale}
          onClick={() => {
            // Re-validate the selection right before submission.
            if (!availableFactors.includes(selectedFactor)) {
              setSelectedFactor(availableFactors[0]);
              return;
            }
            onUpscale(selectedFactor);
          }}
          className={cn(
            'h-11 flex-1 gap-2 border-0 bg-gradient-to-r from-[hsl(var(--formanova-hero-accent))] to-[hsl(var(--formanova-glow))] font-display uppercase tracking-wide text-background transition-opacity hover:opacity-90',
            compact ? 'px-3 text-sm' : 'px-6 text-base',
          )}
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {buttonLabel()}
            </>
          ) : (
            <>
              {!compact && <Maximize2 className="h-4 w-4" />}
              {buttonLabel()}
              <span className="ml-1 flex items-center gap-1 text-sm normal-case tracking-normal opacity-90">
                {selectedStatus === 'success' ? (
                  <>
                    <img src={creditCoinIcon} alt="" className="h-4 w-4 object-contain" />
                    {selectedCost}
                  </>
                ) : selectedStatus === 'error' ? null : (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
              </span>
            </>
          )}
        </Button>
      </div>

      {/* Inline status: retryable error near the control. */}
      {runStatus === 'error' && error && (
        <p className="text-xs text-destructive text-center">{error}</p>
      )}
    </div>
  );
}
