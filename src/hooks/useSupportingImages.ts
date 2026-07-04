/**
 * useSupportingImages
 *
 * Owns the "supporting angle" images used by High Effort mode in the studio
 * upload step (primary image + up to 2 supporting = 3 total of the same piece).
 *
 * Concern boundary (AI_RULES.md #8): this hook holds ONLY supporting-image
 * state and its Azure upload. It has no rendering and does not touch the primary
 * jewelry image (which stays on the existing single-image path in UnifiedStudio).
 *
 * Each entry uploads independently; `preview` shows immediately, `url` fills in
 * once the Azure upload resolves. Cap is enforced so total images never exceed 3.
 */
import { useCallback, useState } from 'react';
import { normalizeImageFile, isLikelyImageFile } from '@/lib/image-normalize';
import { compressImageBlob } from '@/lib/image-compression';
import { uploadToAzure } from '@/lib/microservices-api';
import { TO_SINGULAR } from '@/lib/jewelry-utils';

export interface SupportingImage {
  id: string;
  preview: string;        // data URL for immediate display
  url: string | null;     // uploaded (Azure) URL once available
  assetId: string | null;
  uploading: boolean;
}

/** Primary + this many supporting = 3 total. */
export const MAX_SUPPORTING_IMAGES = 2;

interface UseSupportingImagesOptions {
  isProductShot: boolean;
  category: string;                     // effectiveJewelryType
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

export function useSupportingImages({ isProductShot, category, onReject }: UseSupportingImagesOptions) {
  const [supporting, setSupporting] = useState<SupportingImage[]>([]);

  const startOne = useCallback(async (file: File) => {
    const id = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    setSupporting(prev => [...prev, { id, preview: '', url: null, assetId: null, uploading: true }]);
    try {
      const normalized = await normalizeImageFile(file);
      const previewUrl = await fileToDataUrl(normalized);
      setSupporting(prev => prev.map(s => (s.id === id ? { ...s, preview: previewUrl } : s)));

      const { blob: compressed } = await compressImageBlob(normalized);
      const base64 = await fileToDataUrl(compressed);
      const az = await uploadToAzure(base64, 'image/jpeg', 'jewelry_photo', {
        category: TO_SINGULAR[category] ?? category,
        intended_use: isProductShot ? 'pdp' : 'on_model',
      });
      setSupporting(prev => prev.map(s => (
        s.id === id ? { ...s, url: az.sas_url || az.https_url, assetId: az.asset_id ?? null, uploading: false } : s
      )));
    } catch (err) {
      console.error('[supporting upload] failed', err);
      setSupporting(prev => prev.map(s => (s.id === id ? { ...s, uploading: false } : s)));
    }
  }, [category, isProductShot]);

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
    images.slice(0, slots).forEach(f => { void startOne(f); });
  }, [supporting.length, onReject, startOne]);

  const removeAt = useCallback((index: number) => {
    setSupporting(prev => prev.filter((_, i) => i !== index));
  }, []);

  const clear = useCallback(() => setSupporting([]), []);

  return { supporting, addFiles, removeAt, clear };
}
