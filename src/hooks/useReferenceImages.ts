import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAX_RING_CAD_REFERENCE_IMAGES } from "@/lib/ring-cad-nurbs-api";
import { normalizeImageFiles } from "@/lib/image-normalize";
import { uploadCadReferenceImages, type CadReferenceItem } from "@/lib/microservices-api";

/** One reference image and everything that belongs to it. Held as a single
 * array rather than parallel arrays so file, preview and uploaded item cannot
 * drift out of alignment when images are added or removed concurrently. */
interface ReferenceEntry {
  file: File;
  previewUrl: string;
  /** Null while the upload is in flight, or if it failed. */
  item: CadReferenceItem | null;
}

/**
 * Owns the ordered reference-image set shared by Text-to-CAD and Image-to-CAD:
 * capped at MAX_RING_CAD_REFERENCE_IMAGES, with object-URL lifetime cleanup on
 * remove/replace/unmount. Index 0 is always the primary image.
 *
 * Images upload as soon as they are attached, not at generate time — matching
 * Photo Studio (useStudioUpload.ts uploads inside handleJewelryUpload). That is
 * what makes an image appear in "My Rings" immediately, and it means uploading
 * can be observed without paying for a generation.
 *
 * Uploads are fire-and-forget: a failure leaves `item` null and generation
 * inlines that file as base64 instead, so an upload problem never blocks the
 * user from generating.
 *
 * Note each attach is its own /upload/cad-reference call, so each gets its own
 * server-minted set_id rather than one set per generation. That is invisible
 * today because "My Rings" renders a flat image grid and never groups by set.
 */
export function useReferenceImages() {
  const [entries, setEntries] = useState<ReferenceEntry[]>([]);

  // Mirrors entries so unmount cleanup sees the latest set without re-running
  // (and revoking live URLs) on every change.
  const entriesRef = useRef<ReferenceEntry[]>([]);
  useEffect(() => { entriesRef.current = entries; }, [entries]);

  /** Uploads in the background and fills each file's slot when it lands.
   * Matched by file identity, so a concurrent add or remove cannot land an
   * item on the wrong image. */
  const uploadInBackground = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    try {
      const { items } = await uploadCadReferenceImages(files, { category: 'ring' });
      setEntries(prev => prev.map(entry => {
        const i = files.indexOf(entry.file);
        return i !== -1 && items[i] ? { ...entry, item: items[i] } : entry;
      }));
    } catch (err) {
      // Non-fatal: the file stays in the set and generation inlines it instead.
      console.warn('[cad] reference upload failed; this image will be inlined at generate time', err);
    }
  }, []);

  const addReferenceImages = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    // CAD reference images skip the compression pass photoshoot uploads get
    // (useStudioUpload.ts), but still need format normalization: the backend's
    // ring_cad_nurbs_v1 geometry-analysis LLM only accepts real JPEG/PNG/WEBP
    // bytes, and AVIF/HEIC uploads (or non-JPEG bytes wearing a .jpg extension)
    // were being sent through unconverted, failing with a provider 400.
    const normalized = await normalizeImageFiles(files);

    // Cap before creating object URLs, so rejected files never leak one.
    const room = MAX_RING_CAD_REFERENCE_IMAGES - entriesRef.current.length;
    const accepted = normalized.slice(0, Math.max(0, room));
    if (accepted.length === 0) return;

    const added = accepted.map((file): ReferenceEntry => ({
      file,
      previewUrl: URL.createObjectURL(file),
      item: null,
    }));
    // Keep the ref in step immediately: a second add can arrive before React
    // re-renders, and would otherwise recompute `room` against a stale length.
    entriesRef.current = [...entriesRef.current, ...added];
    setEntries(prev => [...prev, ...added]);

    void uploadInBackground(accepted);
  }, [uploadInBackground]);

  const removeReferenceImage = useCallback((index: number) => {
    setEntries(prev => {
      const target = prev[index];
      if (target?.previewUrl.startsWith("blob:")) URL.revokeObjectURL(target.previewUrl);
      const next = prev.filter((_, i) => i !== index);
      entriesRef.current = next;
      return next;
    });
  }, []);

  const replaceReferenceImages = useCallback(async (files: File[]) => {
    const normalized = await normalizeImageFiles(files.slice(0, MAX_RING_CAD_REFERENCE_IMAGES));
    const added = normalized.map((file): ReferenceEntry => ({
      file,
      previewUrl: URL.createObjectURL(file),
      item: null,
    }));

    setEntries(prev => {
      prev.forEach(e => { if (e.previewUrl.startsWith("blob:")) URL.revokeObjectURL(e.previewUrl); });
      return added;
    });
    entriesRef.current = added;

    void uploadInBackground(normalized);
  }, [uploadInBackground]);

  const clearReferenceImages = useCallback(() => {
    setEntries(prev => {
      prev.forEach(e => { if (e.previewUrl.startsWith("blob:")) URL.revokeObjectURL(e.previewUrl); });
      return [];
    });
    entriesRef.current = [];
  }, []);

  // Release any outstanding object URLs when the owning component unmounts.
  useEffect(() => () => {
    entriesRef.current.forEach(e => {
      if (e.previewUrl.startsWith("blob:")) URL.revokeObjectURL(e.previewUrl);
    });
  }, []);

  const referenceImages = useMemo(() => entries.map(e => e.file), [entries]);
  const referenceImagePreviewUrls = useMemo(() => entries.map(e => e.previewUrl), [entries]);
  const uploadedItems = useMemo(() => entries.map(e => e.item), [entries]);

  return {
    referenceImages,
    referenceImagePreviewUrls,
    /** Index-parallel to referenceImages; null where the upload is still in
     * flight or failed, so the caller can inline that file instead. */
    uploadedItems,
    addReferenceImages,
    removeReferenceImage,
    replaceReferenceImages,
    clearReferenceImages,
  };
}
