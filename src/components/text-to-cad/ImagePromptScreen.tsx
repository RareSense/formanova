import { useRef, useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Diamond, X, Maximize2, ImageIcon } from "lucide-react";
import creditCoinIcon from "@/assets/icons/credit-coin.png";
import { useEstimatedCost } from "@/hooks/use-estimated-cost";
import { MAX_RING_CAD_REFERENCE_IMAGES } from "@/lib/ring-cad-nurbs-api";

import cadExample1 from "@/assets/examples/cad-example-1.webp";
import cadExample2 from "@/assets/examples/cad-example-2.webp";
import cadExample3 from "@/assets/examples/cad-example-3.webp";
import cadExample4 from "@/assets/examples/cad-example-4.webp";

const EXAMPLE_DESIGNS = [
  {
    image: cadExample1,
    prompt: "Oval center stone with ball-tip prong setting, flanked by marquise side stones and small round accent clusters, tapered rounded band",
  },
  {
    image: cadExample2,
    prompt: "Asymmetric botanical ring with two large leaf forms rising from a split flowing band, small round center stone nestled between the leaves, accent stones along leaf edges",
  },
  {
    image: cadExample3,
    prompt: "Large oval center stone in four-prong setting surrounded by round halo, split shank band with accent stones running along each shank",
  },
  {
    image: cadExample4,
    prompt: "Wide dome cluster ring, oval center stone surrounded by six oval accents, filigree openwork shoulders",
  },
];

interface ImagePromptScreenProps {
  model: string;
  prompt: string;
  setPrompt: (p: string) => void;
  isGenerating: boolean;
  onGenerate: () => void;
  creditBlock?: React.ReactNode;
  /** Ordered previews; index 0 is the primary reference. Length 0..MAX_RING_CAD_REFERENCE_IMAGES. */
  referenceImagePreviewUrls: string[];
  /** Appends images, respecting the max. Caller owns File state and object-URL lifetime. */
  onAddReferenceImages: (files: File[]) => void;
  onRemoveReferenceImage: (index: number) => void;
  /** Replaces the whole set (used by the example designs). */
  onReplaceReferenceImages: (files: File[]) => void;
  onGlbUpload?: (file: File) => void;
}

export default function ImagePromptScreen({
  model, prompt, setPrompt,
  isGenerating, onGenerate, creditBlock,
  referenceImagePreviewUrls,
  onAddReferenceImages, onRemoveReferenceImage, onReplaceReferenceImages,
  onGlbUpload,
}: ImagePromptScreenProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const extraInputRef = useRef<HTMLInputElement>(null);
  const glbInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredExample, setHoveredExample] = useState<number | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const primaryPreviewUrl = referenceImagePreviewUrls[0] ?? null;
  const imageCount = referenceImagePreviewUrls.length;
  const remainingSlots = MAX_RING_CAD_REFERENCE_IMAGES - imageCount;

  const activeWorkflow = primaryPreviewUrl ? 'sketch_generate_v1' : 'ring_generate_v1';
  const { cost: estimatedCost, loading: costLoading } = useEstimatedCost({ workflowName: activeWorkflow, model });

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

  const handleExampleClick = useCallback(async (example: typeof EXAMPLE_DESIGNS[0]) => {
    setPrompt(example.prompt);
    try {
      const res = await fetch(example.image);
      const blob = await res.blob();
      const file = new File([blob], "example-ring.webp", { type: "image/webp" });
      onReplaceReferenceImages([file]);
    } catch {
      // image load failed -- just set prompt
    }
  }, [setPrompt, onReplaceReferenceImages]);

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canGenerate && !isGenerating) onGenerate();
    }
  };

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [prompt]);

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

  const canGenerate = imageCount > 0;

  return (
    <div className="flex-1 flex items-center justify-center bg-background overflow-y-auto">
      {/* Lightbox */}
      <AnimatePresence>
        {lightboxIndex !== null && referenceImagePreviewUrls[lightboxIndex] && (
          <motion.div
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
              onClick={() => setLightboxIndex(null)}
              aria-label="Close full view"
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-card/80 border border-border hover:bg-accent/60 transition-colors"
            >
              <X className="w-4 h-4 text-foreground/70" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-[680px] px-4 sm:px-6 py-6"
      >
        {/* Title */}
        <div className="text-center mb-6">
          <h1 className="font-display text-4xl md:text-5xl tracking-[0.2em] text-foreground uppercase mb-2">
            Generate 3D Ring
          </h1>
          <p className="font-mono text-[11px] text-muted-foreground tracking-[0.15em] uppercase">
            Upload a photo or sketch of your design
          </p>
        </div>

        <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageInputChange} />
        <input ref={extraInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageInputChange} />

        {/* Image drop zone — primary */}
        <div
          ref={dropZoneRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !primaryPreviewUrl && imageInputRef.current?.click()}
          className={`relative w-full border flex items-center justify-center transition-all duration-200 mb-3 ${
            isDragging
              ? "border-foreground/60 bg-foreground/5"
              : "border-foreground/40 hover:border-foreground/60 hover:bg-foreground/5 bg-muted/10"
          } ${!primaryPreviewUrl ? "cursor-pointer" : ""}`}
          style={{ minHeight: 240 }}
        >
          {primaryPreviewUrl ? (
            <>
              <img
                src={primaryPreviewUrl}
                alt="Primary reference ring"
                className="w-full object-contain p-3"
                style={{ maxHeight: 320 }}
              />
              <button
                onClick={(e) => { e.stopPropagation(); onRemoveReferenceImage(0); }}
                className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center bg-card/80 border border-border hover:bg-accent/60 transition-colors"
                aria-label="Remove primary image"
              >
                <X className="w-3 h-3 text-foreground/70" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setLightboxIndex(0); }}
                className="absolute top-2 right-10 w-6 h-6 flex items-center justify-center bg-card/80 border border-border hover:bg-accent/60 transition-colors"
                aria-label="Expand primary image"
              >
                <Maximize2 className="w-3 h-3 text-foreground/70" />
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center text-center px-6 py-10">
              <div className="relative mx-auto w-20 h-20 mb-6">
                <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping motion-reduce:animate-none" style={{ animationDuration: '2.5s' }} />
                <div className="absolute inset-0 rounded-full bg-primary/5 border-2 border-primary/20 flex items-center justify-center">
                  <Diamond className="h-9 w-9 text-primary" />
                </div>
              </div>
              <p className="font-display text-lg tracking-[0.1em] text-foreground uppercase mb-1.5">
                Drop your ring image or sketch here
              </p>
              <p className="text-sm text-muted-foreground mb-6">
                Drag &amp; drop · click to browse · paste (Ctrl+V)
              </p>
              <Button variant="outline" size="lg" className="gap-2 pointer-events-none">
                <ImageIcon className="h-4 w-4" />
                Browse ring files
              </Button>
            </div>
          )}
        </div>

        {/* Additional angles — revealed only once a primary image exists (progressive disclosure) */}
        {primaryPreviewUrl && (
          <div className="mb-3">
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Additional angles
              </h3>
              <span className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground/60 tabular-nums">
                {imageCount}/{MAX_RING_CAD_REFERENCE_IMAGES}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: MAX_RING_CAD_REFERENCE_IMAGES - 1 }, (_, slot) => {
                // Slot n holds reference image n+1 (index 0 is the primary zone above).
                const index = slot + 1;
                const url = referenceImagePreviewUrls[index];

                if (url) {
                  return (
                    <div key={index} className="relative aspect-square border border-border bg-muted/10 overflow-hidden">
                      <img src={url} alt={`Reference angle ${index}`} className="w-full h-full object-cover" />
                      <button
                        onClick={() => onRemoveReferenceImage(index)}
                        className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center bg-card/80 border border-border hover:bg-accent/60 transition-colors"
                        aria-label={`Remove reference angle ${index}`}
                      >
                        <X className="w-3 h-3 text-foreground/70" />
                      </button>
                      <button
                        onClick={() => setLightboxIndex(index)}
                        className="absolute bottom-1 right-1 w-6 h-6 flex items-center justify-center bg-card/80 border border-border hover:bg-accent/60 transition-colors"
                        aria-label={`Expand reference angle ${index}`}
                      >
                        <Maximize2 className="w-3 h-3 text-foreground/70" />
                      </button>
                    </div>
                  );
                }

                // The first empty slot is the add target; later ones stay inert placeholders
                // so the strip keeps a stable 4-up layout with no shift as images are added.
                const isNextSlot = index === imageCount;
                return (
                  <button
                    key={index}
                    type="button"
                    disabled={!isNextSlot}
                    onClick={() => extraInputRef.current?.click()}
                    aria-label={`Add reference angle ${index}`}
                    className={`aspect-square border border-dashed flex flex-col items-center justify-center gap-1 transition-colors duration-200 ${
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
            <p className="mt-2 text-[11px] text-muted-foreground/70 leading-relaxed">
              Optional. More angles of the same ring give the model a better read on depth and profile.
            </p>
          </div>
        )}

        {/* Text prompt — secondary */}
        <div className={`relative mb-3 transition-opacity duration-200 ${primaryPreviewUrl ? "opacity-100" : "opacity-40"}`}>
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add optional description"
            rows={2}
            className={`w-full min-h-[52px] max-h-[200px] px-5 py-2.5 pb-7 text-[14px] text-foreground placeholder:text-muted-foreground/50 resize-none font-body leading-relaxed transition-all duration-200 focus:outline-none bg-muted/20 border overflow-y-auto ${primaryPreviewUrl ? "border-border focus:ring-1 focus:ring-border" : "border-border/30 pointer-events-none"}`}
          />
          {prompt.length > 0 && (
            <button
              onClick={() => { setPrompt(""); textareaRef.current?.focus(); }}
              className="absolute bottom-2.5 right-8 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60 hover:text-foreground transition-colors duration-150 cursor-pointer z-10"
            >
              Clear
            </button>
          )}
        </div>

        {/* Credit block */}
        {creditBlock && <div className="mb-3">{creditBlock}</div>}

        {/* Generate button */}
        {!creditBlock && (
          <button
            onClick={onGenerate}
            disabled={isGenerating || !canGenerate}
            className="w-full py-4 text-[13px] font-bold uppercase tracking-[0.2em] cursor-pointer transition-all duration-200 bg-primary text-primary-foreground disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 active:scale-[0.99] flex items-center justify-center gap-2"
          >
            {isGenerating ? "Generating…" : (
              <>
                Generate 3D Ring
                <span className="inline-flex items-center gap-1 ml-1 opacity-80">
                  <span className="text-[13px] font-mono font-semibold">≤</span>
                  <img src={creditCoinIcon} alt="" className="w-5 h-5" />
                  <span className="text-[13px] font-mono font-semibold">{costLoading ? '…' : (estimatedCost !== null ? estimatedCost : '—')}</span>
                </span>
              </>
            )}
          </button>
        )}

        {/* Example designs */}
        <div className="mt-6">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-3">
            Try an example
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {EXAMPLE_DESIGNS.map((ex, i) => (
              <button
                key={i}
                onClick={() => handleExampleClick(ex)}
                onMouseEnter={() => setHoveredExample(i)}
                onMouseLeave={() => setHoveredExample(null)}
                className="relative aspect-square border border-border hover:border-foreground/20 overflow-hidden transition-all duration-150 bg-muted/10"
              >
                <img src={ex.image} alt={`Ring example ${i + 1}`} className="w-full h-full object-cover" />
                <div className={`absolute inset-0 bg-background/85 flex items-center justify-center p-3 transition-opacity duration-200 ${hoveredExample === i ? 'opacity-100' : 'opacity-0'}`}>
                  <p className="font-mono text-[10px] text-foreground/80 leading-[1.6] text-center">{ex.prompt}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Upload GLB — gated */}
        {onGlbUpload && (
          <div className="mt-4 text-center">
            <input
              ref={glbInputRef}
              type="file"
              accept=".glb,.gltf"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onGlbUpload(f); e.target.value = ""; }}
            />
            <button
              onClick={() => glbInputRef.current?.click()}
              className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground transition-colors duration-150 cursor-pointer underline underline-offset-4 decoration-border hover:decoration-foreground"
            >
              Or upload a CAD file (.glb)
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
