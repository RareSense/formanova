import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAX_RING_CAD_REFERENCE_IMAGES } from "@/lib/ring-cad-nurbs-api";
import { normalizeImageFiles } from "@/lib/image-normalize";

/** One reference image and its preview. Held as a single array rather than
 * parallel arrays so file and preview cannot drift out of alignment when
 * images are added or removed concurrently. */
interface ReferenceEntry {
  file: File;
  previewUrl: string;
}

/**
 * Owns the ordered reference-image set shared by Text-to-CAD and Image-to-CAD:
 * capped at MAX_RING_CAD_REFERENCE_IMAGES, with object-URL lifetime cleanup on
 * remove/replace/unmount. Index 0 is always the primary image.
 *
 * Uploading happens at generate time, not on attach, and deliberately so. The
 * upload endpoint mints one set_id per call, so uploading per attach made a
 * "set" mean "whatever was attached in one go": five images added one at a
 * time became five sets, and My Rings showed five cards for a single run.
 * Sending the whole set in one call at generate time makes a set mean exactly
 * one generation, which is how people think about it.
 *
 * The cost is that an image reaches the vault only once the user generates.
 * Populating it earlier needs a way to attach an existing asset to a new set
 * without re-uploading, which the backend has not built.
 */
export function useReferenceImages() {
  const [entries, setEntries] = useState<ReferenceEntry[]>([]);

  // Mirrors entries so unmount cleanup sees the latest set without re-running
  // (and revoking live URLs) on every change.
  const entriesRef = useRef<ReferenceEntry[]>([]);
  useEffect(() => { entriesRef.current = entries; }, [entries]);

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
    }));
    // Keep the ref in step immediately: a second add can arrive before React
    // re-renders, and would otherwise recompute `room` against a stale length.
    entriesRef.current = [...entriesRef.current, ...added];
    setEntries(prev => [...prev, ...added]);
  }, []);

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
    }));

    setEntries(prev => {
      prev.forEach(e => { if (e.previewUrl.startsWith("blob:")) URL.revokeObjectURL(e.previewUrl); });
      return added;
    });
    entriesRef.current = added;
  }, []);

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

  return {
    referenceImages,
    referenceImagePreviewUrls,
    addReferenceImages,
    removeReferenceImage,
    replaceReferenceImages,
    clearReferenceImages,
  };
}
