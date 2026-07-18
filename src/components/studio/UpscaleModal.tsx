import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuthenticatedImage } from '@/hooks/useAuthenticatedImage';
import { computeUpscaleFactors, estimateUpscaleCostCached, maxUpscaleFactorForTier } from '@/lib/upscale-api';
import type { Resolution } from '@/components/studio/OutputSettingsPills';
import creditCoinIcon from '@/assets/icons/credit-coin.png';

interface UpscaleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The generation result to enlarge. */
  resultImageUrl: string | null;
  /** The original generation tier - drives billing and estimates, NOT the output. */
  resolution: Resolution;
  /** Selecting a size starts the upscale immediately. */
  onUpscale: (factor: number) => void;
}

type EstimateStatus = 'loading' | 'success' | 'error';

/**
 * Size picker for the results-screen "Upscale" action. One tap on a size row
 * starts the upscale and closes the modal - there is no separate confirm step.
 */
export function UpscaleModal({ open, onOpenChange, resultImageUrl, resolution, onUpscale }: UpscaleModalProps) {
  const resolvedSrc = useAuthenticatedImage(resultImageUrl);

  // Decode the real source pixels so the size list uses the true long edge and
  // each row can show its exact target dimensions.
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
    img.onerror = () => { /* leave null -> empty state shown */ };
    img.src = resolvedSrc;
    return () => { cancelled = true; };
  }, [resolvedSrc]);

  const longestSide = dims ? Math.max(dims.w, dims.h) : null;
  const tierMaxFactor = maxUpscaleFactorForTier(resolution);
  const availableFactors = useMemo(
    () => (longestSide ? computeUpscaleFactors(longestSide).filter(f => f <= tierMaxFactor) : []),
    [longestSide, tierMaxFactor],
  );

  const [estimates, setEstimates] = useState<Record<number, number>>({});
  const [estimateStatus, setEstimateStatus] = useState<Record<number, EstimateStatus>>({});
  const inFlight = useRef<Set<number>>(new Set());
  const factorsKey = availableFactors.join(',');
  useEffect(() => {
    if (!open) return;
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
    // Excluded: estimateStatus (read as a guard only; including it would refetch
    // on every status write). Safe: open + factorsKey + resolution fully determine
    // which factors need fetching, and inFlight prevents duplicate requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, factorsKey, resolution]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-foreground sm:max-w-sm">
        <div className="flex flex-col items-center gap-2 pt-2 text-center">
          <DialogTitle className="font-display text-2xl uppercase tracking-wide leading-none text-foreground">
            Upscale
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Pick a size. Upscaling starts right away.
          </DialogDescription>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {availableFactors.length === 0 ? (
            <p className="py-6 text-center font-mono text-xs tracking-wider text-muted-foreground">
              {longestSide ? 'This image is already at the maximum size.' : 'Reading image size...'}
            </p>
          ) : (
            availableFactors.map((factor) => (
              <button
                key={factor}
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  onUpscale(factor);
                }}
                className="grid h-12 grid-cols-[3rem_1fr_auto] items-center gap-3 border border-border bg-background px-4 font-mono text-sm text-foreground transition-colors hover:border-[hsl(var(--formanova-hero-accent))] hover:bg-[hsl(var(--formanova-hero-accent))]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="text-left font-semibold">x{factor}</span>
                <span className="text-left text-xs tabular-nums text-muted-foreground">
                  {dims ? `${dims.w * factor} x ${dims.h * factor}` : ''}
                </span>
                <span className="flex items-center gap-1 text-xs">
                  {estimateStatus[factor] === 'success' ? (
                    <>
                      <img src={creditCoinIcon} alt="" className="h-3.5 w-3.5 object-contain" />
                      {estimates[factor]}
                    </>
                  ) : estimateStatus[factor] === 'error' ? null : (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  )}
                </span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
