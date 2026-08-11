import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_RING_CAD_REFERENCE_IMAGES } from "@/lib/ring-cad-nurbs-api";

/**
 * Owns the ordered reference-image set shared by Text-to-CAD and Image-to-CAD:
 * files + their object-URL previews kept in lockstep, capped at
 * MAX_RING_CAD_REFERENCE_IMAGES, with object-URL lifetime cleanup on
 * remove/replace/unmount. Index 0 is always the primary image.
 */
export function useReferenceImages() {
  const [referenceImages, setReferenceImages] = useState<File[]>([]);
  const [referenceImagePreviewUrls, setReferenceImagePreviewUrls] = useState<string[]>([]);

  // Mirrors referenceImagePreviewUrls so the unmount cleanup sees the latest
  // set without re-running (and revoking live URLs) on every change.
  const previewUrlsRef = useRef<string[]>([]);
  useEffect(() => { previewUrlsRef.current = referenceImagePreviewUrls; }, [referenceImagePreviewUrls]);

  const addReferenceImages = useCallback((files: File[]) => {
    if (files.length === 0) return;
    const urls = files.map(f => URL.createObjectURL(f));
    setReferenceImages(prev => [...prev, ...files].slice(0, MAX_RING_CAD_REFERENCE_IMAGES));
    setReferenceImagePreviewUrls(prev => [...prev, ...urls].slice(0, MAX_RING_CAD_REFERENCE_IMAGES));
  }, []);

  const removeReferenceImage = useCallback((index: number) => {
    setReferenceImagePreviewUrls(prev => {
      const url = prev[index];
      if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
      return prev.filter((_, i) => i !== index);
    });
    setReferenceImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  const replaceReferenceImages = useCallback((files: File[]) => {
    const capped = files.slice(0, MAX_RING_CAD_REFERENCE_IMAGES);
    const urls = capped.map(f => URL.createObjectURL(f));
    setReferenceImagePreviewUrls(prev => {
      prev.forEach(u => { if (u.startsWith("blob:")) URL.revokeObjectURL(u); });
      return urls;
    });
    setReferenceImages(capped);
  }, []);

  const clearReferenceImages = useCallback(() => {
    setReferenceImagePreviewUrls(prev => {
      prev.forEach(u => { if (u.startsWith("blob:")) URL.revokeObjectURL(u); });
      return [];
    });
    setReferenceImages([]);
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
    addReferenceImages,
    removeReferenceImage,
    replaceReferenceImages,
    clearReferenceImages,
  };
}
