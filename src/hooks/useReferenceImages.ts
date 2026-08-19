import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_RING_CAD_REFERENCE_IMAGES } from "@/lib/ring-cad-nurbs-api";
import { normalizeImageFiles } from "@/lib/image-normalize";
import { uploadCadReferenceImages, type CadReferenceItem } from "@/lib/microservices-api";

/**
 * Owns the ordered reference-image set shared by Text-to-CAD and Image-to-CAD:
 * files + their object-URL previews kept in lockstep, capped at
 * MAX_RING_CAD_REFERENCE_IMAGES, with object-URL lifetime cleanup on
 * remove/replace/unmount. Index 0 is always the primary image.
 *
 * Images upload as soon as they are attached, not at generate time — matching
 * Photo Studio (useStudioUpload.ts uploads to Azure inside handleJewelryUpload).
 * That is what makes an image appear in "My Rings" immediately, and it means
 * uploading can be observed and debugged without paying for a generation.
 *
 * `uploadedItems` runs index-parallel to `referenceImages`; an entry is null
 * while its upload is in flight or if it failed, in which case generation falls
 * back to inlining that file as base64. Uploads are fire-and-forget: a failure
 * degrades rather than blocking the user from generating.
 *
 * Note each attach is its own /upload/cad-reference call, so each gets its own
 * server-minted set_id rather than one set per generation. That is invisible
 * today because "My Rings" renders a flat image grid and never groups by set.
 */
export function useReferenceImages() {
  const [referenceImages, setReferenceImages] = useState<File[]>([]);
  const [referenceImagePreviewUrls, setReferenceImagePreviewUrls] = useState<string[]>([]);
  const [uploadedItems, setUploadedItems] = useState<(CadReferenceItem | null)[]>([]);

  // Mirrors referenceImagePreviewUrls so the unmount cleanup sees the latest
  // set without re-running (and revoking live URLs) on every change.
  const previewUrlsRef = useRef<string[]>([]);
  useEffect(() => { previewUrlsRef.current = referenceImagePreviewUrls; }, [referenceImagePreviewUrls]);

  const addReferenceImages = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    // CAD reference images skip the compression pass photoshoot uploads get
    // (useStudioUpload.ts), but still need format normalization: the backend's
    // ring_cad_nurbs_v1 geometry-analysis LLM only accepts real JPEG/PNG/WEBP
    // bytes, and AVIF/HEIC uploads (or non-JPEG bytes wearing a .jpg extension)
    // were being sent through unconverted, failing with a provider 400.
    const normalized = await normalizeImageFiles(files);
    const urls = normalized.map(f => URL.createObjectURL(f));

    // Only the files that actually fit under the cap are worth uploading.
    let accepted: File[] = [];
    setReferenceImages(prev => {
      const next = [...prev, ...normalized].slice(0, MAX_RING_CAD_REFERENCE_IMAGES);
      accepted = next.slice(prev.length);
      return next;
    });
    setReferenceImagePreviewUrls(prev => [...prev, ...urls].slice(0, MAX_RING_CAD_REFERENCE_IMAGES));
    setUploadedItems(prev => [...prev, ...accepted.map(() => null)].slice(0, MAX_RING_CAD_REFERENCE_IMAGES));
    if (accepted.length === 0) return;

    // Fill the slots reserved above once the upload lands. Matched by identity
    // rather than index, so a concurrent add or remove cannot land an item on
    // the wrong image.
    try {
      const { items } = await uploadCadReferenceImages(accepted, { category: 'ring' });
      setUploadedItems(prevItems => {
        const next = [...prevItems];
        setReferenceImages(currentFiles => {
          accepted.forEach((file, i) => {
            const slot = currentFiles.indexOf(file);
            if (slot !== -1 && items[i]) next[slot] = items[i];
          });
          return currentFiles;
        });
        return next;
      });
    } catch (err) {
      // Non-fatal: the file stays in the set and generation inlines it instead.
      console.warn('[cad] reference upload failed; will inline this image at generate time', err);
    }
  }, []);

  const removeReferenceImage = useCallback((index: number) => {
    setReferenceImagePreviewUrls(prev => {
      const url = prev[index];
      if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
      return prev.filter((_, i) => i !== index);
    });
    setReferenceImages(prev => prev.filter((_, i) => i !== index));
    // Keep the parallel array aligned, or later uploads land on the wrong image.
    setUploadedItems(prev => prev.filter((_, i) => i !== index));
  }, []);

  const replaceReferenceImages = useCallback(async (files: File[]) => {
    const capped = files.slice(0, MAX_RING_CAD_REFERENCE_IMAGES);
    const normalized = await normalizeImageFiles(capped);
    const urls = normalized.map(f => URL.createObjectURL(f));
    setReferenceImagePreviewUrls(prev => {
      prev.forEach(u => { if (u.startsWith("blob:")) URL.revokeObjectURL(u); });
      return urls;
    });
    setReferenceImages(normalized);
    setUploadedItems(normalized.map(() => null));

    try {
      const { items } = await uploadCadReferenceImages(normalized, { category: 'ring' });
      setUploadedItems(prev => (prev.length === items.length ? items : prev));
    } catch (err) {
      console.warn('[cad] reference upload failed; will inline these images at generate time', err);
    }
  }, []);

  const clearReferenceImages = useCallback(() => {
    setReferenceImagePreviewUrls(prev => {
      prev.forEach(u => { if (u.startsWith("blob:")) URL.revokeObjectURL(u); });
      return [];
    });
    setReferenceImages([]);
    setUploadedItems([]);
  }, []);

  // Release any outstanding object URLs when the owning component unmounts.
  useEffect(() => () => {
    previewUrlsRef.current.forEach(u => {
      if (u.startsWith("blob:")) URL.revokeObjectURL(u);
    });
  }, []);

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
