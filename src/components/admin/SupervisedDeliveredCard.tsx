/**
 * The model a supervised run delivered (or, on a rejected run, the replacement it is about to
 * deliver), in the shared viewer, with the 3DM download.
 *
 * Where the model is read from, first match wins:
 *   1. supervision.delivery.final: a sent replacement's files (glb_artifact / threedm_artifact).
 *   2. download_urls: the admin's verified uploads, the files a replacement is made from.
 *   3. GET /result/{id}: an AI model that was sent as it was (delivery is empty then).
 * A replacement's /result points at the user's own model list, which an admin cannot read, so it
 * is never the source for a replacement.
 */
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ImageOff, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GLBPreviewSlot, ScissorGLBGrid } from '@/components/generations/ScissorGLBGrid';
import { downloadCadArtifact } from '@/lib/cad-artifact-download';
import { fetchCadResult } from '@/lib/cad-result-api';
import { DOWNLOAD_NOTES } from '@/components/downloads/download-notes';
import type { CadArtifactKind } from '@/lib/cad-artifact-download';
import { deliveredFiles, downloadUrl } from '@/lib/supervised-delivery';
import type { SupervisedRunDetail } from '@/lib/supervised-runs-api';

/** Every file role the admin can fetch, in list order: label, file extension, how the download is checked. */
const FILE_ROLES: { role: keyof typeof DOWNLOAD_NOTES; label: string; ext: string; kind: CadArtifactKind }[] = [
  { role: 'threedm', label: '3DM', ext: '3dm', kind: '3dm' },
  { role: 'viewer_threedm', label: 'Viewer 3DM', ext: 'viewer.3dm', kind: '3dm' },
  { role: 'glb', label: 'GLB', ext: 'glb', kind: 'glb' },
  { role: 'step', label: 'STEP', ext: 'step', kind: 'step' },
  { role: 'casting_stl', label: 'Casting STL', ext: 'casting.stl', kind: 'stl' },
  { role: 'stl', label: 'Full STL', ext: 'stl', kind: 'stl' },
  { role: 'stones', label: 'Stones list', ext: 'stones.csv', kind: 'file' },
  { role: 'spec_sheet', label: 'Spec sheet PDF', ext: 'pdf', kind: 'file' },
  { role: 'code', label: 'Code', ext: 'py', kind: 'file' },
  { role: 'design_contract', label: 'Design contract', ext: 'json', kind: 'file' },
  { role: 'thumbnail', label: 'Thumbnail', ext: 'png', kind: 'file' },
];

const SOURCE_TEXT: Record<string, string> = {
  send: 'The model the AI made, sent as it was.',
  send_replacement: 'Your uploaded replacement.',
};

export default function SupervisedDeliveredCard({ workflowId, detail, title = 'What the user got' }: {
  workflowId: string;
  detail: SupervisedRunDetail;
  title?: string;
}) {
  const decision = detail.supervision.decision;
  const direct = deliveredFiles(detail);
  // Only an AI model sent as it was needs /result; a replacement's files are in the detail.
  const needResult = !direct.glb && decision !== 'send_replacement' && detail.supervision.phase === 'delivered';
  const result = useQuery({
    queryKey: ['admin-cad-queue-delivered', workflowId],
    queryFn: () => fetchCadResult(workflowId),
    enabled: needResult,
    staleTime: Infinity,
    retry: 1,
  });
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const glb = direct.glb ?? result.data?.glb_url ?? null;
  const threedm = direct.threedm ?? result.data?.threedm_url ?? null;
  const loading = needResult && result.isLoading;

  const files = FILE_ROLES.flatMap((f) => {
    const url = f.role === 'glb' ? glb : f.role === 'threedm' ? threedm : downloadUrl(detail.download_urls, f.role);
    return url ? [{ ...f, url }] : [];
  });

  async function download(file: (typeof files)[number]) {
    if (downloading) return;
    setDownloading(true);
    setError(false);
    try {
      await downloadCadArtifact(file.url, `${workflowId}.${file.ext}`, file.kind);
    } catch {
      if (mounted.current) setError(true);
    } finally {
      if (mounted.current) setDownloading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="font-display text-2xl tracking-wide">{title}</CardTitle>
        {decision && SOURCE_TEXT[decision] && <p className="text-sm text-muted-foreground">{SOURCE_TEXT[decision]}</p>}
      </CardHeader>
      <CardContent className="space-y-4">
        {glb ? (
          <div className="w-full max-w-2xl">
            <ScissorGLBGrid>
              <GLBPreviewSlot
                id={`delivered-${workflowId}`}
                glbUrl={glb}
                className="min-h-[360px] w-full aspect-[4/3] rounded-md border border-border bg-muted/20"
                forceJewelryPalette
              />
            </ScissorGLBGrid>
          </div>
        ) : (
          <div className="flex min-h-[360px] w-full max-w-2xl aspect-[4/3] items-center justify-center rounded-md border border-border bg-muted/20">
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground/60">
                <ImageOff className="h-6 w-6" />
                <span className="font-mono text-[10px] uppercase tracking-widest">No model file found</span>
              </div>
            )}
          </div>
        )}
        {files.length > 0 && (
          <div className="space-y-2">
            {files.map((file) => (
              <div key={file.role} className="flex flex-wrap items-center gap-3">
                <Button variant="outline" className="w-44 px-4" disabled={downloading} onClick={() => void download(file)}>
                  Download {file.label}
                </Button>
                <span className="text-sm text-muted-foreground">{DOWNLOAD_NOTES[file.role]}</span>
              </div>
            ))}
            {error && <p className="break-words text-sm text-destructive" role="alert">Couldn't download that file.</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
