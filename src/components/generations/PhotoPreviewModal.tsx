import React from 'react';
import { Download } from 'lucide-react';
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
import { downloadAsset } from '@/lib/assets-api';

interface PhotoPreviewModalProps {
  imageUrl: string;
  alt?: string;
  onClose: () => void;
  assetId?: string | null;
}

export function PhotoPreviewModal({ imageUrl, alt, onClose, assetId }: PhotoPreviewModalProps) {
  const resolvedSrc = useAuthenticatedImage(imageUrl);

  const handleDownload = async () => {
    if (assetId) {
      await downloadAsset(assetId);
      import('@/lib/posthog-events').then(m => m.trackDownloadClicked({ file_name: assetId, file_type: 'jpg', context: 'generations-photo' }));
      return;
    }
    const urlParts = imageUrl.split('/');
    const lastPart = urlParts[urlParts.length - 1].split('?')[0];
    const filename = lastPart || 'generation.jpg';
    const ext = filename.lastIndexOf('.') > 0 ? filename.slice(filename.lastIndexOf('.') + 1) : 'jpg';

    import('@/lib/posthog-events').then(m => m.trackDownloadClicked({ file_name: filename, file_type: ext, context: 'generations-photo' }));

    // Mirror the studio result download: artifact paths need the Bearer token,
    // but a cross-origin CDN/SAS URL must use a plain fetch (adding Authorization
    // triggers a CORS preflight failure). Fall back to opening the image so the
    // user can save it manually instead of a dead-end.
    const src = resolvedSrc ?? imageUrl;
    try {
      let blobUrl: string;
      if (src.startsWith('blob:') || src.startsWith('data:')) {
        blobUrl = src;
      } else {
        const res = src.includes('/artifacts/') ? await authenticatedFetch(src) : await fetch(src);
        if (!res.ok) throw new Error('Fetch failed');
        const blob = await res.blob();
        blobUrl = URL.createObjectURL(blob);
      }
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (!src.startsWith('blob:') && !src.startsWith('data:')) URL.revokeObjectURL(blobUrl);
    } catch {
      // Chromium cannot resolve blob: URLs in a noopener window, so same-origin
      // blob/data URLs we minted ourselves must open WITHOUT noopener.
      const features = src.startsWith('blob:') || src.startsWith('data:') ? '' : 'noopener,noreferrer';
      const win = window.open(src, '_blank', features);
      if (!win) alert('Download failed. Please try again.');
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle className="font-mono text-[10px] tracking-[0.25em] uppercase text-muted-foreground">
            Preview
          </DialogTitle>
        </DialogHeader>

        <div className="p-6 pt-4 space-y-4">
          <div className="relative bg-muted overflow-hidden">
            <OptimizedImage
              src={resolvedSrc ?? ""}
              alt={alt || 'Preview'}
              className="w-full object-contain max-h-[520px]"
            />
          </div>

          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={handleDownload}
              className="font-mono text-[10px] tracking-wider uppercase gap-2"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
