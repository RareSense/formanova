/**
 * HighEffortUploadCanvas
 *
 * Step 1 upload canvas shown when Effort = High. Lets the user add up to 3 images
 * of the SAME piece: one cover + up to two supporting angles.
 *
 * Layout: a fixed-height canvas containing a single row of EQUAL-SIZE boxes.
 *   - Nothing uploaded -> one full-width drop zone (looks like low effort; copy
 *     says up to 3).
 *   - As soon as one image is added -> all three equal boxes show: the cover plus
 *     two supporting slots. Empty supporting slots show the "(optional)" text, so
 *     removing an image returns that box to the same empty supporting state.
 *
 * Behaviour:
 * - Every box accepts multi-select via browse or drag-drop; paste (Ctrl+V) is
 *   handled globally by the studio page, so all three input methods work.
 * - Empty supporting box shows the flickering Diamond + "Add supporting image of
 *   same {piece} (optional)".
 * - Vault entries (a grouped set clicked in My Products) carry no File; their
 *   thumbnail is auth-resolved for display. Fresh uploads use their data-URL preview.
 * - Previews use object-contain so the whole image is visible (never cropped/zoomed).
 */
import React from 'react';
import { Diamond, X, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MAX_SUPPORTING_IMAGES, type SupportingImage } from '@/hooks/useSupportingImages';
import { useAuthenticatedImage } from '@/hooks/useAuthenticatedImage';

const MAX_SUPPORTING = MAX_SUPPORTING_IMAGES;
const MAX_TOTAL = MAX_SUPPORTING + 1; // cover + supporting = 3

interface HighEffortUploadCanvasProps {
  singular: string;
  canvasH: string;
  primaryImage: string | null;          // raw jewelryImage (presence check)
  resolvedPrimaryImage: string | null;  // resolved for <img> src
  primaryInputRef: React.RefObject<HTMLInputElement>;
  onPrimaryFiles: (files: File[]) => void;
  onPrimaryClear: () => void;
  supporting: SupportingImage[];         // 0..2 entries
  onSupportingFiles: (files: File[]) => void;
  onSupportingRemove: (index: number) => void;
}

// Flickering Diamond used across empty slots (matches the original drop zone).
function FlickerDiamond({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  const box = size === 'lg' ? 'w-20 h-20 mb-6' : 'w-14 h-14 mb-3';
  const icon = size === 'lg' ? 'h-9 w-9' : 'h-6 w-6';
  return (
    <div className={`relative mx-auto ${box}`}>
      <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" style={{ animationDuration: '2.5s' }} />
      <div className="absolute inset-0 rounded-full bg-primary/5 flex items-center justify-center border-2 border-primary/20">
        <Diamond className={`${icon} text-primary`} />
      </div>
    </div>
  );
}

export function HighEffortUploadCanvas({
  singular,
  canvasH,
  primaryImage,
  resolvedPrimaryImage,
  primaryInputRef,
  onPrimaryFiles,
  onPrimaryClear,
  supporting,
  onSupportingFiles,
  onSupportingRemove,
}: HighEffortUploadCanvasProps) {
  const supportingInputRefs = React.useRef<Array<HTMLInputElement | null>>([]);

  // Vault entries (assetId set) carry no data-URL preview; auth-resolve their
  // thumbnail for display. Fresh uploads use `preview` directly. Hooks run at a
  // fixed count, so resolve each of the MAX_SUPPORTING (2) slots unconditionally.
  const resolvedSlot0 = useAuthenticatedImage(supporting[0]?.assetId ? supporting[0].url : null);
  const resolvedSlot1 = useAuthenticatedImage(supporting[1]?.assetId ? supporting[1].url : null);
  const resolvedSupporting = [resolvedSlot0, resolvedSlot1];

  // Nothing uploaded -> one full-width drop zone (low-effort look). As soon as any
  // image exists -> all three equal boxes (cover + two supporting slots), empty
  // slots showing the "(optional)" text. Canvas height stays canvasH throughout.
  const hasAnyImage = !!primaryImage || supporting.length > 0;
  const visibleCount = hasAnyImage ? MAX_TOTAL : 1;

  return (
    <div className={`border border-border/30 overflow-hidden ${canvasH}`}>
      <div
        className="grid h-full min-h-0 gap-3 p-2 sm:gap-4 sm:p-3"
        style={{ gridTemplateColumns: `repeat(${visibleCount}, minmax(0, 1fr))` }}
      >
        {/* Cover box - drop zone when empty, image when filled. Full width when it is
            the only box (empty state), which reads like the low-effort canvas. */}
        <div className="relative h-full min-h-0 min-w-0 overflow-hidden">
          {!primaryImage ? (
            <div
              onDrop={(e) => { e.preventDefault(); const fs = Array.from(e.dataTransfer.files); if (fs.length) onPrimaryFiles(fs); }}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => primaryInputRef.current?.click()}
              className="relative h-full border-2 border-dashed border-border/70 text-center cursor-pointer
                         hover:border-foreground/70 hover:bg-foreground/5 transition-all
                         flex flex-col items-center justify-center px-4"
            >
              <FlickerDiamond size="lg" />
              <p className="text-lg font-display font-medium mb-1.5">Drop your {singular} images here</p>
              <p className="text-sm text-muted-foreground mb-1.5">Add up to 3 photos of the same {singular} (different angles)</p>
              <p className="text-sm text-muted-foreground mb-6">Drag &amp; drop &middot; click to browse &middot; paste (Ctrl+V)</p>
              <Button variant="outline" size="lg" className="gap-2 pointer-events-none">
                <ImageIcon className="h-4 w-4" />
                Browse {singular} files
              </Button>
              <input
                ref={primaryInputRef}
                type="file"
                multiple
                accept="image/*,.jfif,.pjpeg,.jpe"
                className="hidden"
                onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) onPrimaryFiles(fs); e.currentTarget.value = ''; }}
              />
            </div>
          ) : (
            <div className="relative h-full border-2 border-border/70 overflow-hidden flex items-center justify-center bg-muted/20">
              <img src={resolvedPrimaryImage ?? undefined} alt={`${singular} cover`} className="max-w-full max-h-full object-contain" />
              <button
                onClick={onPrimaryClear}
                aria-label="Remove cover image"
                className="absolute top-3 right-3 w-7 h-7 bg-background/80 backdrop-blur-sm flex items-center justify-center
                           border border-border/40 hover:bg-destructive hover:text-destructive-foreground transition-colors z-10"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Two supporting slots - shown as soon as any image exists. Each is either a
            filled angle or an empty "(optional)" box; removing an image returns the
            box to the empty state. All boxes are the same size as the cover. */}
        {hasAnyImage && Array.from({ length: MAX_SUPPORTING }).map((_, i) => {
          const item = supporting[i];
          return (
            <div key={i} className="relative h-full min-h-0 min-w-0 overflow-hidden">
              {!item ? (
                <>
                  <button
                    type="button"
                    onDrop={(e) => { e.preventDefault(); const fs = Array.from(e.dataTransfer.files); if (fs.length) onSupportingFiles(fs); }}
                    onDragOver={(e) => e.preventDefault()}
                    onClick={() => supportingInputRefs.current[i]?.click()}
                    className="h-full w-full border-2 border-dashed border-border/70 text-center cursor-pointer
                               hover:border-foreground/70 hover:bg-foreground/5 transition-all
                               flex flex-col items-center justify-center px-3"
                  >
                    <FlickerDiamond size="sm" />
                    <p className="text-xs text-muted-foreground leading-snug">
                      Add supporting image of same {singular} (optional)
                    </p>
                  </button>
                  <input
                    ref={(el) => { supportingInputRefs.current[i] = el; }}
                    type="file"
                    multiple
                    accept="image/*,.jfif,.pjpeg,.jpe"
                    className="hidden"
                    onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) onSupportingFiles(fs); e.currentTarget.value = ''; }}
                  />
                </>
              ) : (
                <div className="relative h-full border-2 border-border/70 overflow-hidden flex items-center justify-center bg-muted/20">
                  <img
                    src={(item.assetId ? resolvedSupporting[i] : item.preview) ?? undefined}
                    alt={`${singular} angle ${i + 1}`}
                    className="max-w-full max-h-full object-contain"
                  />
                  <button
                    onClick={() => onSupportingRemove(i)}
                    aria-label={`Remove supporting image ${i + 1}`}
                    className="absolute top-2 right-2 w-6 h-6 bg-background/80 backdrop-blur-sm flex items-center justify-center
                               border border-border/40 hover:bg-destructive hover:text-destructive-foreground transition-colors z-10"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
