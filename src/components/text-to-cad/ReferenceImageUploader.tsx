import { useRef, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Diamond, X, ImageIcon } from "lucide-react";
import { MAX_RING_CAD_REFERENCE_IMAGES } from "@/lib/ring-cad-nurbs-api";

interface ReferenceImageUploaderProps {
  /** Ordered previews; index 0 is the primary reference. Length 0..MAX_RING_CAD_REFERENCE_IMAGES. */
  referenceImagePreviewUrls: string[];
  /** Appends images, respecting the max. Caller owns File state and object-URL lifetime. */
  onAddReferenceImages: (files: File[]) => void;
  onRemoveReferenceImage: (index: number) => void;
  primaryLabel?: string;
  primaryHint?: string;
  /** Allows Image-to-CAD to use the same tall upload canvas as Photo Studio. */
  canvasClassName?: string;
  /** Uses Photo Studio's full-size empty drop affordance. */
  photoStudioEmptyState?: boolean;
}

/**
 * Shared image reference drop zone: primary drop target, progressive
 * "additional angles" grid, drag/drop/paste handling, and a lightbox.
 * Used by both the text-first (InitialPromptScreen) and image-first
 * (ImagePromptScreen) entry screens so the interaction pattern — and any
 * future change to it — lives in exactly one place.
 */
export default function ReferenceImageUploader({
  referenceImagePreviewUrls,
  onAddReferenceImages,
  onRemoveReferenceImage,
  primaryLabel = "Drop your ring image or sketch here",
  primaryHint = "Drag & drop · click to browse · paste (Ctrl+V)",
  canvasClassName = "h-[150px] sm:h-[170px]",
  photoStudioEmptyState = false,
}: ReferenceImageUploaderProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const extraInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const primaryPreviewUrl = referenceImagePreviewUrls[0] ?? null;
  const imageCount = referenceImagePreviewUrls.length;
  const remainingSlots = MAX_RING_CAD_REFERENCE_IMAGES - imageCount;

  /** Filters to images and clamps to the remaining slots, telling the user when it clamps. */
  const acceptFiles = useCallback((fileList: FileList | File[] | null) => {
    const images = Array.from(fileList ?? []).filter(f => f.type.startsWith("image/"));
    if (images.length === 0) return;
    if (remainingSlots <= 0) {
      toast.error(`You can use up to ${MAX_RING_CAD_REFERENCE_IMAGES} reference images`);
      return;
    }
    if (images.length > remainingSlots) {
      toast.error(`Only ${remainingSlots} more ${remainingSlots === 1 ? 'image' : 'images'} can be added (max ${MAX_RING_CAD_REFERENCE_IMAGES})`);
    }
    onAddReferenceImages(images.slice(0, remainingSlots));
  }, [remainingSlots, onAddReferenceImages]);

  const handleImageInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    acceptFiles(e.target.files);
    e.target.value = "";
  }, [acceptFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!dropZoneRef.current?.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    acceptFiles(e.dataTransfer.files);
  }, [acceptFiles]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.items ?? [])
        .filter(i => i.type.startsWith("image/"))
        .map(i => i.getAsFile())
        .filter((f): f is File => f !== null);
      if (files.length) acceptFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [acceptFiles]);

  return (
    <div>
      <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageInputChange} />
      <input ref={extraInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageInputChange} />

      {primaryPreviewUrl && (
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Reference images
          </h3>
          <span className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground/60 tabular-nums">
            {imageCount}/{MAX_RING_CAD_REFERENCE_IMAGES}
          </span>
        </div>
      )}

      {/* Empty state mirrors Photo Studio's upload canvas. Once an image is
          selected, the canvas becomes five stable, equal slots. */}
      {!primaryPreviewUrl && photoStudioEmptyState ? (
        <div
          ref={dropZoneRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => imageInputRef.current?.click()}
          className={`relative flex flex-col items-center justify-center border border-dashed text-center transition-all cursor-pointer ${canvasClassName} ${
            isDragging
              ? "border-foreground/60 bg-foreground/5"
              : "border-border/40 hover:border-foreground/40 hover:bg-foreground/5"
          }`}
        >
          <div className="relative mx-auto mb-6 h-20 w-20">
            <div
              className="absolute inset-0 rounded-full bg-primary/10 animate-ping motion-reduce:animate-none"
              style={{ animationDuration: "2.5s" }}
            />
            <div className="absolute inset-0 flex items-center justify-center rounded-full border-2 border-primary/20 bg-primary/5">
              <Diamond className="h-9 w-9 text-primary" />
            </div>
          </div>
          <p className="mb-1.5 font-display text-lg font-medium">{primaryLabel}</p>
          <p className="mb-6 text-sm text-muted-foreground">{primaryHint}</p>
          <Button variant="outline" size="lg" className="gap-2 pointer-events-none">
            <ImageIcon className="h-4 w-4" />
            Browse ring files
          </Button>
        </div>
      ) : (
        <div className={`${canvasClassName} overflow-hidden border border-border/30`}>
          <div
            className="grid h-full min-h-0 gap-2 p-2"
            style={{ gridTemplateColumns: `repeat(${primaryPreviewUrl ? MAX_RING_CAD_REFERENCE_IMAGES : 1}, minmax(0, 1fr))` }}
          >
            {!primaryPreviewUrl ? (
              <div
                ref={dropZoneRef}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => imageInputRef.current?.click()}
                className={`relative flex h-full min-h-0 min-w-0 items-center justify-center border-2 border-dashed transition-all duration-200 cursor-pointer ${
                  isDragging
                    ? "border-foreground/60 bg-foreground/5"
                    : "border-foreground/40 bg-muted/10 hover:border-foreground/60 hover:bg-foreground/5"
                }`}
              >
                <div className="flex flex-col items-center gap-1.5 px-4 text-center">
                  <div className="relative mx-auto h-9 w-9">
                    <div
                      className="absolute inset-0 rounded-full bg-primary/10 animate-ping motion-reduce:animate-none"
                      style={{ animationDuration: "2.5s" }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center rounded-full border-2 border-primary/20 bg-primary/5">
                      <Diamond className="h-4 w-4 text-primary" />
                    </div>
                  </div>
                  <p className="font-display text-sm uppercase tracking-[0.08em] text-foreground">{primaryLabel}</p>
                  <p className="text-xs text-muted-foreground">{primaryHint}</p>
                </div>
              </div>
            ) : Array.from({ length: MAX_RING_CAD_REFERENCE_IMAGES }, (_, index) => {
              const url = referenceImagePreviewUrls[index];

              if (url) {
                return (
                  <div key={index} className="relative h-full min-h-0 min-w-0 overflow-hidden border border-border bg-muted/10">
                    <img src={url} alt={index === 0 ? "Primary reference ring" : `Reference angle ${index}`} className="h-full w-full object-contain p-1" />
                    <button
                      onClick={() => onRemoveReferenceImage(index)}
                      className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center bg-card/80 border border-border hover:bg-accent/60 transition-colors"
                      aria-label={index === 0 ? "Remove primary image" : `Remove reference angle ${index}`}
                    >
                      <X className="w-3 h-3 text-foreground/70" />
                    </button>
                  </div>
                );
              }

              // The first empty slot is the add target; later ones stay inert placeholders
              // so the row keeps a stable layout with no shift as images are added.
              const isNextSlot = index === imageCount;
              return (
                <button
                  key={index}
                  type="button"
                  disabled={!isNextSlot}
                  onClick={() => extraInputRef.current?.click()}
                  aria-label={`Add reference angle ${index}`}
                  className={`h-full min-h-0 min-w-0 border border-dashed flex flex-col items-center justify-center gap-1 transition-colors duration-200 ${
                    isNextSlot
                      ? "border-foreground/40 hover:border-foreground/60 hover:bg-foreground/5 bg-muted/10"
                      : "border-border/40 bg-muted/5"
                  }`}
                >
                  <Diamond className={`h-5 w-5 ${isNextSlot ? "text-primary" : "text-muted-foreground/30"}`} />
                  {isNextSlot && (
                    <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                      Add
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {primaryPreviewUrl && (
        <p className="mt-2 text-[11px] text-muted-foreground/70 leading-relaxed">
          Optional. More angles of the same ring give the model a better read on depth and profile.
        </p>
      )}
    </div>
  );
}
