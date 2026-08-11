import React, { useEffect, useState, Suspense } from 'react';
import { Download, AlertCircle, Loader2, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { fetchCadResult } from '@/lib/generation-history-api';
import { authenticatedFetch } from '@/lib/authenticated-fetch';

const GLBPreviewSlot = React.lazy(() =>
  import('./ScissorGLBGrid').then((m) => ({ default: m.GLBPreviewSlot }))
);

interface CadWorkflowModalProps {
  workflowId: string | null;
  workflowStatus: string;
  onClose: () => void;
}

export function CadWorkflowModal({ workflowId, workflowStatus, onClose }: CadWorkflowModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [glbUrl, setGlbUrl] = useState<string | null>(null);
  const [threedmUrl, setThreedmUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!workflowId) return;

    setLoading(true);
    setError(null);
    setGlbUrl(null);
    setThreedmUrl(null);

    (async () => {
      try {
        const cadResult = await fetchCadResult(workflowId);

        if (cadResult.azure_source === 'failed_final') {
          setError('This generation failed. No model available.');
        } else if (cadResult.glb_url || cadResult.threedm_url) {
          setGlbUrl(cadResult.glb_url);
          setThreedmUrl(cadResult.threedm_url);
        } else {
          setError('No GLB model found for this workflow.');
        }
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [workflowId, workflowStatus]);

  /**
   * Downloads the .3dm — the machinable NURBS deliverable — when the run
   * produced one (ring_cad_nurbs_v1). Falls back to the .glb preview mesh for
   * older workflow shapes that never had a .3dm, same fallback ImageToCAD
   * already uses (workflow.threedmArtifact ? handleDownloadThreedm : handleDownloadGlb).
   */
  const handleDownload = async () => {
    const use3dm = !!threedmUrl;
    const downloadUrl = use3dm ? threedmUrl : glbUrl;
    if (!downloadUrl) return;
    const fileName = `ring-${workflowId?.slice(0, 8)}.${use3dm ? '3dm' : 'glb'}`;
    import('@/lib/posthog-events').then((m) =>
      m.trackDownloadClicked({ file_name: fileName, file_type: use3dm ? 'threedm' : 'glb', context: 'generations-cad-modal' })
    );

    try {
      const needsAuth = downloadUrl.includes('/artifacts/');
      const resp = needsAuth ? await authenticatedFetch(downloadUrl) : await fetch(downloadUrl);
      if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('[CadWorkflowModal] download error:', err);
    }
  };

  return (
    <Dialog open={!!workflowId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        {/* Header */}
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="font-display text-2xl md:text-3xl uppercase tracking-wide">
            CAD Output
          </DialogTitle>
          <DialogDescription className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
            {workflowId?.slice(0, 12)}…
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 pt-4">
          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                Loading details…
              </p>
            </div>
          )}

          {/* Error / failed state */}
          {!loading && error && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="mx-auto w-10 h-10 border border-border flex items-center justify-center mb-2">
                <AlertTriangle className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="font-display text-sm uppercase tracking-[0.15em] text-foreground mb-1">
                Could Not Complete Generation
              </p>
              <p className="font-mono text-[10px] leading-relaxed tracking-wide text-muted-foreground max-w-sm">
                {error}
              </p>
            </div>
          )}

          {/* Success: 3D GLB preview + download */}
          {!loading && !error && (glbUrl || threedmUrl) && (
            <>
              {glbUrl && (
                <Suspense
                  fallback={
                    <div className="w-full aspect-square max-h-[450px] bg-muted/30 flex items-center justify-center rounded-sm">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  }
                >
                  <GLBPreviewSlot
                    id={workflowId || 'modal'}
                    glbUrl={glbUrl}
                    className="w-full aspect-square max-h-[450px] bg-background/50 border border-border/30 rounded-sm mb-4"
                  />
                </Suspense>
              )}

              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={handleDownload}
                  variant="outline"
                  className="font-mono text-[10px] tracking-wider uppercase gap-2"
                >
                  <Download className="h-3.5 w-3.5" />
                  {threedmUrl ? "Download 3DM" : "Download GLB"}
                </Button>
              </div>
            </>
          )}

          {/* No data fallback */}
          {!loading && !error && !glbUrl && !threedmUrl && (
            <p className="font-mono text-[10px] tracking-wider text-muted-foreground text-center py-8">
              No output artifacts found for this workflow.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
