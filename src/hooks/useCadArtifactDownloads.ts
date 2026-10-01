import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { downloadCadArtifact } from '@/lib/cad-artifact-download';
import { trackDownloadClicked } from '@/lib/posthog-events';
import { AuthExpiredError } from '@/lib/authenticated-fetch';
import type { CadSource } from '@/lib/cad-analytics';

interface UseCadArtifactDownloadsInput {
  /** Backend URL for the machinable NURBS file, or null when the run has none. */
  threedmUrl?: string | null;
  /** Mesh-only viewing copy of the 3DM, or null when the version has none. */
  viewerThreedmUrl?: string | null;
  /** Backend URL for the preview mesh, or null before the run finishes. */
  glbUrl?: string | null;
  stlUrls?: string[];
  stepUrls?: string[];
  /**
   * Produces a GLB of the live scene including the user's edits. Supplied only
   * by the workspaces, which have a canvas; history has no scene to export.
   */
  exportEditedBlob?: () => Promise<Blob | undefined>;
  source: CadSource;
}

function stamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
}

/**
 * The CAD download actions shared by both workspaces.
 *
 * The rule this hook exists to enforce: a download hands back exactly the bytes
 * the backend produced. The workspaces previously downloaded the GLB by
 * re-encoding the live scene through GLTFExporter, which rewrites materials and
 * scene structure, so the saved file rendered differently from both the
 * viewport and the backend's own artifact. History downloaded the raw file, so
 * the same button gave you a different file depending on which screen you were
 * on.
 *
 * Scene export is still available, but only through `exportEdited`, which the
 * UI offers only when the user has actually edited something. It is written out
 * directly rather than through the artifact validator: it is not a backend
 * artifact, so it has no advertised hash to check against.
 */
export function useCadArtifactDownloads({
  threedmUrl,
  viewerThreedmUrl,
  glbUrl,
  stlUrls = [],
  stepUrls = [],
  exportEditedBlob,
  source,
}: UseCadArtifactDownloadsInput) {
  const [isBusy, setIsBusy] = useState(false);

  const save = useCallback(async (
    url: string | null | undefined,
    filename: string,
    kind: '3dm' | 'glb' | 'stl' | 'step',
  ) => {
    if (!url) {
      toast.error(`No ${kind.toUpperCase()} file is available for this model.`);
      return;
    }
    // A guard, not a queue: two concurrent saves would race the busy flag and
    // leave the button disabled after the first one finishes.
    if (isBusy) return;

    setIsBusy(true);
    try {
      await downloadCadArtifact(url, filename, kind);
      trackDownloadClicked({ file_name: filename, file_type: kind, context: source, source });
    } catch (err) {
      if (err instanceof AuthExpiredError) return;
      console.error(`[CadDownload] ${kind} failed:`, err);
      // downloadCadArtifact authors its own messages for an invalid or
      // truncated file, and those say more than a generic failure would.
      toast.error(err instanceof Error && err.message ? err.message : `Failed to download the ${kind.toUpperCase()} file.`);
    } finally {
      setIsBusy(false);
    }
  }, [isBusy, source]);

  const downloadThreedm = useCallback(
    () => save(threedmUrl, `ring-${stamp()}.3dm`, '3dm'),
    [save, threedmUrl],
  );

  // Named apart from the NURBS file so the two can never be mistaken on disk.
  const downloadViewerThreedm = useCallback(
    () => save(viewerThreedmUrl, `model-${stamp()}-viewing-copy.3dm`, '3dm'),
    [save, viewerThreedmUrl],
  );

  const downloadGlb = useCallback(
    () => save(glbUrl, `model-${stamp()}.glb`, 'glb'),
    [save, glbUrl],
  );

  const saveMany = useCallback(async (urls: string[], kind: 'stl' | 'step') => {
    if (urls.length === 0 || isBusy) return;
    setIsBusy(true);
    try {
      const suffix = stamp();
      for (let index = 0; index < urls.length; index += 1) {
        const part = urls.length > 1 ? `-part-${index + 1}` : '';
        const filename = `model-${suffix}${part}.${kind}`;
        await downloadCadArtifact(urls[index], filename, kind);
        trackDownloadClicked({ file_name: filename, file_type: kind, context: source, source });
      }
    } catch (err) {
      if (err instanceof AuthExpiredError) return;
      console.error(`[CadDownload] ${kind} failed:`, err);
      toast.error(err instanceof Error && err.message ? err.message : `Failed to download the ${kind.toUpperCase()} file.`);
    } finally {
      setIsBusy(false);
    }
  }, [isBusy, source]);

  const downloadStl = useCallback(() => saveMany(stlUrls, 'stl'), [saveMany, stlUrls]);
  const downloadStep = useCallback(() => saveMany(stepUrls, 'step'), [saveMany, stepUrls]);

  const exportEdited = useCallback(async () => {
    if (!exportEditedBlob || isBusy) return;
    const filename = `model-${stamp()}-edited.glb`;

    setIsBusy(true);
    try {
      const blob = await exportEditedBlob();
      if (!blob || blob.size === 0) {
        toast.error('Export produced an empty file.');
        return;
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      trackDownloadClicked({ file_name: filename, file_type: 'glb-edited', context: source, source });
    } catch (err) {
      console.error('[CadDownload] edited export failed:', err);
      toast.error('Failed to export your edited model.');
    } finally {
      setIsBusy(false);
    }
  }, [exportEditedBlob, isBusy, source]);

  return { downloadThreedm, downloadViewerThreedm, downloadGlb, downloadStl, downloadStep, exportEdited, isBusy };
}
