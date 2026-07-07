/**
 * HighEffortUploadCanvas
 *
 * Step 1 upload canvas shown when Effort = High. Lets the user add up to 3 images
 * of the SAME piece: one primary + two supporting angles.
 *
 * Layout (per spec):
 *   +----------------+  +--------+
 *   |                |  | slot 1 |
 *   |    primary     |  +--------+
 *   |   (col-span-2) |  | slot 2 |
 *   +----------------+  +--------+
 * Horizontal and vertical gaps are equal (single `gap-4` on both grids) so the
 * three slots read as one evenly-spaced block, top- and bottom-aligned.
 *
 * Behaviour:
 * - Primary drop zone accepts multi-select: dropping/browsing several files fills
 *   primary then the supporting slots in order. More than 3 files are rejected.
 * - Each supporting slot can also be filled individually.
 * - Empty supporting slots show the flickering Diamond + "Add supporting image of
 *   same {piece}".
 * - Previews use object-contain so the whole image is visible (never cropped/zoomed).
 */
import React from 'react';
import { Diamond, X, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MAX_SUPPORTING_IMAGES, type SupportingImage } from '@/hooks/useSupportingImages';

const MAX_SUPPORTING = MAX_SUPPORTING_IMAGES;

interface HighEffortUploadCanvasProps {
  singular: string;
  canvasH: string;
  primaryImage: string | null;          // raw jewelryImage (presence check)
  resolvedPrimaryImage: string | null;  // resolved for <img> src
  primaryInputRef: React.RefObject<HTMLInputElement>;
  onPrimaryFiles: (files: File[]) => void;
  onPrimaryClear: () => void;
  supporting: SupportingImage[];         // 0..2 entries
  onSupportingFile: (index: number, file: File) => void;
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
  onSupportingFile,
  onSupportingRemove,
}: HighEffortUploadCanvasProps) {
  const supportingInputRefs = React.useRef<Array<HTMLInputElement | null>>([]);

  return (
    <div className="grid grid-cols-3 gap-4">
      {/* Primary slot (col-span-2) - fixed full canvas height, image object-contain */}
      <div className={`col-span-2 ${canvasH}`}>
        {!primaryImage ? (
          <div
            onDrop={(e) => { e.preventDefault(); const fs = Array.from(e.dataTransfer.files); if (fs.length) onPrimaryFiles(fs); }}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => primaryInputRef.current?.click()}
            className="relative h-full border-2 border-dashed border-border/70 text-center cursor-pointer
                       hover:border-foreground/70 hover:bg-foreground/5 transition-all
                       flex flex-col items-center justify-center"
          >
            <FlickerDiamond size="lg" />
            <p className="text-lg font-display font-medium mb-1.5">Drop your {singular} image here</p>
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
            <img src={resolvedPrimaryImage ?? undefined} alt={`${singular} primary`} className="max-w-full max-h-full object-contain" />
            <button
              onClick={onPrimaryClear}
              aria-label="Remove primary image"
              className="absolute top-3 right-3 w-7 h-7 bg-background/80 backdrop-blur-sm flex items-center justify-center
                         border border-border/40 hover:bg-destructive hover:text-destructive-foreground transition-colors z-10"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Supporting slots (right column) - same fixed height, two equal halves */}
      <div className={`flex flex-col gap-4 ${canvasH}`}>
        {Array.from({ length: MAX_SUPPORTING }).map((_, i) => {
          const item = supporting[i];
          return (
            <div key={i} className="relative flex-1 min-h-0">
              {!item ? (
                <button
                  type="button"
                  onClick={() => supportingInputRefs.current[i]?.click()}
                  className="h-full w-full border-2 border-dashed border-border/70 text-center cursor-pointer
                             hover:border-foreground/70 hover:bg-foreground/5 transition-all
                             flex flex-col items-center justify-center px-3"
                >
                  <FlickerDiamond size="sm" />
                  <p className="text-xs text-muted-foreground leading-snug">
                    Add supporting image of same {singular}
                  </p>
                </button>
              ) : (
                <div className="relative h-full border-2 border-border/70 overflow-hidden flex items-center justify-center bg-muted/20">
                  <img src={item.preview} alt={`${singular} angle ${i + 1}`} className="max-w-full max-h-full object-contain" />
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
              <input
                ref={(el) => { supportingInputRefs.current[i] = el; }}
                type="file"
                accept="image/*,.jfif,.pjpeg,.jpe"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onSupportingFile(i, f); e.currentTarget.value = ''; }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
