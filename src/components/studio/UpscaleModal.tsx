import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Maximize2 } from 'lucide-react';
import { useAuthenticatedImage } from '@/hooks/useAuthenticatedImage';
import { computeUpscaleFactors, estimateUpscaleCost } from '@/lib/upscale-api';
import type { Resolution } from '@/components/studio/OutputSettingsPills';
import { cn } from '@/lib/utils';
import creditCoinIcon from '@/assets/icons/credit-coin.png';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called with the chosen integer multiplier (2..9). */
  onConfirm: (factor: number) => void;
  /** The generation result to enlarge. */
  resultImageUrl: string | null;
  /** The generation's tier — drives billing, not the output size. */
  resolution: Resolution;
}

function CoinCost({ cost, loading }: { cost: number | null | undefined; loading: boolean }) {
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <img src={creditCoinIcon} alt="" className="h-3.5 w-3.5 object-contain" />
      {loading || cost === undefined ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <span>{cost ?? '--'}</span>
      )}
    </span>
  );
}

export function UpscaleModal({
  open,
  onClose,
  onConfirm,
  resultImageUrl,
  resolution,
}: Props) {
  const resolvedSrc = useAuthenticatedImage(resultImageUrl);

  // Source pixel dimensions — measured from the actual image so the factor menu
  // uses the real long edge (aspect ratio changes it), not the tier label.
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [measureFailed, setMeasureFailed] = useState(false);

  const [prices, setPrices] = useState<Record<number, number | null>>({});
  const [pricesLoading, setPricesLoading] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  // Measure the source image once it has resolved.
  useEffect(() => {
    if (!open) return;
    setDims(null);
    setMeasureFailed(false);
    if (!resolvedSrc) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setDims({ w: img.naturalWidth, h: img.naturalHeight });
      } else {
        setMeasureFailed(true);
      }
    };
    img.onerror = () => { if (!cancelled) setMeasureFailed(true); };
    img.src = resolvedSrc;
    return () => { cancelled = true; };
  }, [open, resolvedSrc]);

  const longestSide = dims ? Math.max(dims.w, dims.h) : null;
  const factors = useMemo(
    () => (longestSide ? computeUpscaleFactors(longestSide) : []),
    [longestSide],
  );

  // Default-select the smallest multiplier whenever the menu changes.
  useEffect(() => {
    setSelected(factors.length > 0 ? factors[0] : null);
  }, [factors]);

  // Fetch the price for every offered factor in parallel. The estimate uses the
  // same grid as the real charge, so the preview can never disagree with the bill.
  useEffect(() => {
    if (!open || factors.length === 0) { setPrices({}); return; }
    let cancelled = false;
    setPricesLoading(true);
    Promise.all(
      factors.map(f => estimateUpscaleCost({ resolution, factor: f }).then(c => [f, c] as const)),
    )
      .then(entries => { if (!cancelled) setPrices(Object.fromEntries(entries)); })
      .finally(() => { if (!cancelled) setPricesLoading(false); });
    return () => { cancelled = true; };
  }, [open, factors, resolution]);

  const handleClose = () => {
    setDims(null);
    setMeasureFailed(false);
    setPrices({});
    setSelected(null);
    onClose();
  };

  const handleConfirm = () => {
    if (selected == null) return;
    onConfirm(selected);
    handleClose();
  };

  const measuring = !measureFailed && (!resolvedSrc || !dims);
  const atMax = !!dims && factors.length === 0;
  const selectedCost = selected != null ? prices[selected] : null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md w-full shadow-none">
        <div className="space-y-5">
          {/* Header */}
          <div>
            <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-1">
              Make it bigger
            </p>
            <DialogTitle className="font-display text-2xl tracking-wide [text-shadow:none]">
              Upscale this image
            </DialogTitle>
            <DialogDescription className="text-sm text-justify leading-relaxed text-muted-foreground mt-1">
              Pick how much larger you want it. We multiply the original size and keep the same proportions.
            </DialogDescription>
          </div>

          {/* Preview + factor picker */}
          <div className="flex gap-4">
            <div className="flex w-24 flex-shrink-0 flex-col items-center gap-1.5">
              <div className="flex aspect-square w-full items-center justify-center overflow-hidden border border-border bg-muted/30">
                {resolvedSrc ? (
                  <img src={resolvedSrc} alt="Image to upscale" className="h-full w-full object-contain" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/50" />
                )}
              </div>
              {dims && (
                <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                  {dims.w} x {dims.h}
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              {measuring && (
                <div className="flex h-full min-h-[6rem] items-center justify-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              )}

              {measureFailed && (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  We couldn't read this image's size. Please close and try again.
                </p>
              )}

              {atMax && (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  This image is already at the largest size we can produce.
                </p>
              )}

              {!measuring && !measureFailed && factors.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {factors.map((f) => {
                    const active = selected === f;
                    return (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setSelected(f)}
                        aria-pressed={active}
                        className={cn(
                          'flex flex-col items-center justify-center gap-0.5 rounded-md border px-2 py-2 transition-colors',
                          active
                            ? 'border-2 border-[hsl(var(--formanova-hero-accent))] bg-[hsl(var(--formanova-hero-accent))]/10'
                            : 'border-border hover:border-[hsl(var(--formanova-hero-accent))]/60',
                        )}
                      >
                        <span className="font-display text-lg leading-none tracking-wide text-foreground">
                          x{f}
                        </span>
                        <CoinCost cost={prices[f]} loading={pricesLoading} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Output size + slow-job note */}
          {selected != null && dims && (
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Output approx {dims.w * selected} x {dims.h * selected} px
            </p>
          )}
          {factors.length > 0 && (
            <p className="text-xs leading-relaxed text-justify text-muted-foreground">
              Upscaling runs in the background and can take several minutes, longer for bigger
              multipliers. You can leave this page and we'll let you know when it's ready.
            </p>
          )}

          {/* CTA */}
          <Button
            className="w-full gap-2"
            disabled={selected == null}
            onClick={handleConfirm}
          >
            <Maximize2 className="h-4 w-4" />
            {selected != null ? `Upscale x${selected}` : 'Upscale'}
            {selected != null && (
              <span className="ml-1 flex items-center gap-1 text-xs normal-case tracking-normal opacity-70">
                <img src={creditCoinIcon} alt="" className="h-4 w-4 object-contain" />
                {selectedCost ?? '--'}
              </span>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
