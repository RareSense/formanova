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
import { deliveredFiles } from '@/lib/supervised-delivery';
import type { SupervisedRunDetail } from '@/lib/supervised-runs-api';

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

  async function download() {
    if (!threedm || downloading) return;
    setDownloading(true);
    setError(false);
    try {
      await downloadCadArtifact(threedm, `${workflowId}.3dm`, '3dm');
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
        {threedm && (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" className="px-4" disabled={downloading} onClick={() => void download()}>
              {downloading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Download 3DM
            </Button>
            {error && <p className="break-words text-sm text-destructive" role="alert">Couldn't download the 3DM.</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
