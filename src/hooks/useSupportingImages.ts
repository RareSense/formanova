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
 * Two kinds of entry share one list:
 * - Fresh uploads carry a normalized `file`; they are NOT uploaded individually.
 *   The whole fresh set (cover + supporting) is uploaded together via POST
 *   /upload/bulk at generate time so the backend mints one input_group_id.
 *   `preview` shows immediately from a data URL while the file waits for submit.
 * - Vault entries (added by clicking a grouped set in the vault) carry `assetId`
 *   + `url` and NO file. They are reused as-is at generate time (no re-upload, no
 *   duplicate grouped set); their preview is the asset thumbnail, auth-resolved
 *   by the canvas for display.
 *
 * Cap is enforced so total images never exceed 3 (primary + MAX_SUPPORTING).
 */
import { useCallback, useState } from 'react';
import { normalizeImageFile, isLikelyImageFile } from '@/lib/image-normalize';

export interface SupportingImage {
  id: string;
  /** Present for fresh uploads (bulk-uploaded as part of the set at submit).
   *  Absent for vault entries, which are reused via assetId/url instead. */
  file?: File;
  /** Immediate display source: a data URL for fresh uploads, or the asset
   *  thumbnail url for vault entries (the canvas auth-resolves the latter). */
  preview: string;
  /** Vault member asset id — present => reuse this existing asset, no re-upload. */
  assetId?: string;
  /** Vault member url (asset thumbnail) forwarded to the run for reuse. */
  url?: string;
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

  /** Add one or more fresh files, respecting the remaining-slot cap. */
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

  /**
   * Replace the supporting list with pre-existing vault members (a grouped set's
   * non-cover angles). Reused as-is at generate time; never re-uploaded. Pass []
   * to clear (e.g. when selecting an ungrouped product). Capped to MAX_SUPPORTING.
   */
  const setVaultSupporting = useCallback((entries: { url: string; assetId: string }[]) => {
    setSupporting(entries.slice(0, MAX_SUPPORTING_IMAGES).map(e => ({
      id: e.assetId,
      preview: e.url,
      url: e.url,
      assetId: e.assetId,
    })));
  }, []);

  const removeAt = useCallback((index: number) => {
    setSupporting(prev => prev.filter((_, i) => i !== index));
  }, []);

  const clear = useCallback(() => setSupporting([]), []);

  return { supporting, addFiles, setVaultSupporting, removeAt, clear };
}
