/**
 * useSupportingImages
 *
 * Owns the "supporting angle" images used by High Effort mode in the studio
 * upload step (primary image + up to 2 supporting = 3 total of the same piece).
 *
 * Concern boundary (AI_RULES.md #8): this hook holds ONLY supporting-image
 * state. It has no rendering and does not touch the primary jewelry image
 * (which stays on the existing single-image path in UnifiedStudio).
 *
 * Upload model: entries are NOT uploaded individually. The whole jewelry set
 * (cover + supporting) is uploaded together via POST /upload/bulk at generate
 * time so the backend can mint one input_group_id for the set (grouped display
 * in My Products). This hook therefore retains the normalized File per entry;
 * `preview` shows immediately from a data URL while the file waits for submit.
 * Cap is enforced so total images never exceed 3.
 */
import { useCallback, useState } from 'react';
import { normalizeImageFile, isLikelyImageFile } from '@/lib/image-normalize';

export interface SupportingImage {
  id: string;
  file: File;             // normalized file, uploaded as part of the bulk set at submit
  preview: string;        // data URL for immediate display
}

/** Primary + this many supporting = 3 total. */
export const MAX_SUPPORTING_IMAGES = 2;

interface UseSupportingImagesOptions {
  onReject?: (message: string) => void; // surfaced when a file is invalid or over the cap
}

function fileToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function useSupportingImages({ onReject }: UseSupportingImagesOptions = {}) {
  const [supporting, setSupporting] = useState<SupportingImage[]>([]);

  const addOne = useCallback(async (file: File) => {
    const id = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const normalized = await normalizeImageFile(file);
    const preview = await fileToDataUrl(normalized);
    setSupporting(prev => [...prev, { id, file: normalized, preview }]);
  }, []);

  /** Add one or more files, respecting the remaining-slot cap. */
  const addFiles = useCallback((files: File[]) => {
    const images = files.filter(isLikelyImageFile);
    if (images.length < files.length) onReject?.('Some files were not images and were skipped.');

    const slots = MAX_SUPPORTING_IMAGES - supporting.length;
    if (slots <= 0) {
      onReject?.('You can add up to 3 images of the same piece.');
      return;
    }
    if (images.length > slots) onReject?.('You can add up to 3 images of the same piece.');
    images.slice(0, slots).forEach(f => { void addOne(f); });
  }, [supporting.length, onReject, addOne]);

  const removeAt = useCallback((index: number) => {
    setSupporting(prev => prev.filter((_, i) => i !== index));
  }, []);

  const clear = useCallback(() => setSupporting([]), []);

  return { supporting, addFiles, removeAt, clear };
}
