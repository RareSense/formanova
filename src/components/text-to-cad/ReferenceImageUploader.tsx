import { useRef, useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Diamond, X, Maximize2, ImageIcon } from "lucide-react";
import { MAX_RING_CAD_REFERENCE_IMAGES } from "@/lib/ring-cad-nurbs-api";

interface ReferenceImageUploaderProps {
  /** Ordered previews; index 0 is the primary reference. Length 0..MAX_RING_CAD_REFERENCE_IMAGES. */
  referenceImagePreviewUrls: string[];
  /** Appends images, respecting the max. Caller owns File state and object-URL lifetime. */
  onAddReferenceImages: (files: File[]) => void;
  onRemoveReferenceImage: (index: number) => void;
  primaryLabel?: string;
  primaryHint?: string;
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
}: ReferenceImageUploaderProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const extraInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const lightboxCloseButtonRef = useRef<HTMLButtonElement>(null);
  const lightboxTriggerRef = useRef<HTMLElement | null>(null);

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

  // Escape closes the lightbox (WCAG 2.2 - dismissible overlay)
  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLightboxIndex(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex]);

  // Move focus into the dialog on open, and back to the "Expand" button that
  // triggered it on close, so keyboard/screen-reader users aren't dropped.
  useEffect(() => {
    if (lightboxIndex !== null) lightboxCloseButtonRef.current?.focus();
    else lightboxTriggerRef.current?.focus();
  }, [lightboxIndex]);

  return (
    <div>
      {/* Lightbox */}
      <AnimatePresence>
        {lightboxIndex !== null && referenceImagePreviewUrls[lightboxIndex] && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Reference image preview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setLightboxIndex(null)}
          >
            <motion.img
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              src={referenceImagePreviewUrls[lightboxIndex]}
              alt={`Reference image ${lightboxIndex + 1} of ${imageCount}, full view`}
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              ref={lightboxCloseButtonRef}
              onClick={() => setLightboxIndex(null)}
              aria-label="Close full view"
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-card/80 border border-border hover:bg-accent/60 transition-colors"
            >
              <X className="w-4 h-4 text-foreground/70" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

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

      {/* Same fixed-height single-row canvas as Photo Studio's High Effort
          upload (HighEffortUploadCanvas): one full-width drop zone when
          empty (reads as the plain low-effort canvas), all slots equal size
          in a single row once any image exists — cover and every angle get
          identical treatment, none reads as more or less important. */}
      <div className="mb-3 h-[260px] overflow-hidden border border-border/30 sm:h-[300px]">
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
              className={`relative h-full min-h-0 min-w-0 flex items-center justify-center border-2 border-dashed transition-all duration-200 cursor-pointer ${
                isDragging
                  ? "border-foreground/60 bg-foreground/5"
                  : "border-foreground/40 hover:border-foreground/60 hover:bg-foreground/5 bg-muted/10"
              }`}
            >
              <div className="flex flex-col items-center text-center px-6">
                <div className="relative mx-auto w-16 h-16 mb-4">
                  <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping motion-reduce:animate-none" style={{ animationDuration: '2.5s' }} />
                  <div className="absolute inset-0 rounded-full bg-primary/5 border-2 border-primary/20 flex items-center justify-center">
                    <Diamond className="h-7 w-7 text-primary" />
                  </div>
                </div>
                <p className="font-display text-lg tracking-[0.1em] text-foreground uppercase mb-1.5">
                  {primaryLabel}
                </p>
                <p className="text-sm text-muted-foreground mb-5">
                  {primaryHint}
                </p>
                <Button variant="outline" size="lg" className="gap-2 pointer-events-none">
                  <ImageIcon className="h-4 w-4" />
                  Browse ring files
                </Button>
              </div>
            </div>
          ) : (
            Array.from({ length: MAX_RING_CAD_REFERENCE_IMAGES }, (_, index) => {
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
                    <button
                      onClick={(e) => { lightboxTriggerRef.current = e.currentTarget; setLightboxIndex(index); }}
                      className="absolute bottom-1 right-1 w-6 h-6 flex items-center justify-center bg-card/80 border border-border hover:bg-accent/60 transition-colors"
                      aria-label={index === 0 ? "Expand primary image" : `Expand reference angle ${index}`}
                    >
                      <Maximize2 className="w-3 h-3 text-foreground/70" />
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
            })
          )}
        </div>
      </div>

      {primaryPreviewUrl && (
        <p className="mt-2 mb-3 text-[11px] text-muted-foreground/70 leading-relaxed">
          Optional. More angles of the same ring give the model a better read on depth and profile.
        </p>
      )}
    </div>
  );
}
