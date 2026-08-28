import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { OptimizedImage } from '@/components/ui/optimized-image';
import { useAuthenticatedImage } from '@/hooks/useAuthenticatedImage';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import type { CadSource } from '@/lib/cad-analytics';

function SnapshotThumb({ url, angle }: { url: string; angle: string }) {
  const resolved = useAuthenticatedImage(url);
  return (
    <OptimizedImage
      src={resolved ?? ""}
      alt={angle}
      className="w-full h-full object-cover"
    />
  );
}

interface SnapshotPreviewModalProps {
  screenshots: { angle: string; url: string }[];
  initialIndex: number;
  glbUrl?: string | null;
  glbFilename?: string | null;
  /**
   * Which CAD tool produced the run these snapshots belong to. Both downloads
   * below are CAD artifacts, so without this they fired `download_clicked` with
   * a context and no source and were unattributable. Undefined when the
   * history row's source_type is unrecognised, in which case the property is
   * omitted rather than guessed.
   */
  source?: CadSource;
  onClose: () => void;
}

export function SnapshotPreviewModal({
  screenshots,
  initialIndex,
  glbUrl,
  glbFilename,
  source,
  onClose,
}: SnapshotPreviewModalProps) {
  const [index, setIndex] = useState(Math.min(initialIndex, screenshots.length - 1));
  const shot = screenshots[index];
  const total = screenshots.length;
  const resolvedSrc = useAuthenticatedImage(shot?.url);

  const prev = () => setIndex((index - 1 + total) % total);
  const next = () => setIndex((index + 1) % total);

  const handleDownloadImage = async () => {
    if (!shot) return;
    const fileName = `ring-${shot.angle}.png`;
    import('@/lib/posthog-events').then(m => m.trackDownloadClicked({ file_name: fileName, file_type: 'png', context: 'generations-snapshot', source }));
    const res = await authenticatedFetch(shot.url);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(objectUrl);
  };

  const handleDownloadGlb = async () => {
    if (!glbUrl) return;
    const fileName = glbFilename || 'model.glb';
    import('@/lib/posthog-events').then(m => m.trackDownloadClicked({ file_name: fileName, file_type: 'glb', context: 'generations-snapshot', source }));
    try {
      const resp = await authenticatedFetch(glbUrl);
      if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('[SnapshotPreviewModal] GLB download error:', err);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle className="font-mono text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
            {shot?.angle?.replace(/_/g, ' ') || 'Preview'}
            {total > 1 && (
              <span className="ml-2 text-muted-foreground/50">
                {index + 1} / {total}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="p-6 pt-4 space-y-4">
          {/* Hero image */}
          <div className="relative group bg-muted rounded-sm overflow-hidden aspect-square max-h-[460px] mx-auto flex items-center justify-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={index}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="w-full h-full flex items-center justify-center"
              >
                {shot && (
                  <OptimizedImage
                    src={resolvedSrc ?? ""}
                    alt={shot.angle}
                    className="max-w-full max-h-full object-contain"
                  />
                )}
              </motion.div>
            </AnimatePresence>

            {total > 1 && (
              <>
                <button
                  onClick={prev}
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/80 backdrop-blur-sm rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={next}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/80 backdrop-blur-sm rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </>
            )}
          </div>

          {/* Thumbnail strip */}
          {total > 1 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {screenshots.map((s, i) => (
                <button
                  key={s.angle}
                  onClick={() => setIndex(i)}
                  className={`flex-shrink-0 w-11 h-11 rounded-sm overflow-hidden border-2 transition-all ${
                    i === index
                      ? 'border-foreground'
                      : 'border-transparent hover:border-muted-foreground/40'
                  }`}
                >
                  <SnapshotThumb url={s.url} angle={s.angle} />
                </button>
              ))}
            </div>
          )}

          {/* Download buttons */}
          <div className="flex gap-3 pt-1">
            <Button
              variant="outline"
              onClick={handleDownloadImage}
              disabled={!shot}
              className="font-mono text-[10px] tracking-wider uppercase gap-2"
            >
              <Download className="h-3.5 w-3.5" />
              Download Snapshot
            </Button>
            {glbUrl && (
              <Button
                onClick={handleDownloadGlb}
                className="font-mono text-[10px] tracking-wider uppercase gap-2"
              >
                <Download className="h-3.5 w-3.5" />
                Download GLB
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
