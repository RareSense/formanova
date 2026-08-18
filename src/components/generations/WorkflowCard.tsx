import React, { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Box, Download, Pencil, Check, X, Layers } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import creditCoinIcon from '@/assets/icons/credit-coin.png';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchCadResult, type WorkflowSummary } from '@/lib/generation-history-api';
import { SnapshotPreviewModal } from './SnapshotPreviewModal';
import { GLBPreviewSlot } from './ScissorGLBGrid';
import { isShaLikeName, renameAsset } from '@/lib/assets-api';
import {
  buildCadArtifactFilename,
  formatLocal,
  getCadArtifactBaseName,
  itemVariants,
  truncateDisplayName,
} from './workflow-card-shared';
import { PhotoCard } from './PhotoCard';
import { withTimeout } from '@/lib/generation-history-utils';
import {
  downloadCadArtifact,
  selectCadArtifactUrl,
} from './cad-artifact-download';

const CAD_RENAMES_KEY = 'formanova_cad_renames';

function getStoredRename(map: Record<string, string>, workflowId: string): string | null {
  const value = map[workflowId];
  return value && !isShaLikeName(value) ? value : null;
}

function loadStoredRenames(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(CAD_RENAMES_KEY) ?? '{}'); } catch { return {}; }
}
function saveStoredRename(workflowId: string, name: string) {
  try {
    const map = loadStoredRenames();
    map[workflowId] = name;
    localStorage.setItem(CAD_RENAMES_KEY, JSON.stringify(map));
  } catch { /* quota - ignore */ }
}

interface WorkflowCardProps {
  workflow: WorkflowSummary;
  index?: number;
  onClick: (id: string) => void;
  /** Called after an inline upscale completes, so the page can refresh the list. */
  onUpscaled?: () => void;
}

// ─── Text-to-CAD card ──────────────────────────────────────────────────────

function CadTextCard({ workflow, index }: { workflow: WorkflowSummary; index: number }) {
  const navigate = useNavigate();
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(
    () => getStoredRename(loadStoredRenames(), workflow.workflow_id) ?? workflow.output_asset_name ?? null
  );
  const [renameValue, setRenameValue] = useState('');
  const [isDownloadingThreedm, setIsDownloadingThreedm] = useState(false);

  useEffect(() => {
    if (workflow.output_asset_name && !getStoredRename(loadStoredRenames(), workflow.workflow_id)) {
      setDisplayName(workflow.output_asset_name);
    }
  }, [workflow.output_asset_name]);

  const dateStr = workflow.created_at ? formatLocal(workflow.created_at) : '—';
  const shots = workflow.screenshots ?? [];
  const hasShots = shots.length > 0;
  const isEnriching = workflow.screenshots === undefined;

  // The editable design name becomes the manufacturing download filename.
  const rawFilename = workflow.glb_filename || 'model.glb';
  const shownBaseName = getCadArtifactBaseName(displayName, rawFilename);
  const threedmFilename = buildCadArtifactFilename(displayName, rawFilename, '3dm');
  const visibleBaseName = truncateDisplayName(shownBaseName);
  const supportsThreedm = Boolean(workflow.threedm_url) || /ring[_-]cad[_-]nurbs/i.test(workflow.name);
  const renameInputId = `cad-design-name-${workflow.workflow_id}`;

  const handleStartRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRenameValue(shownBaseName);
    setIsRenaming(true);
  };

  const handleConfirmRename = useCallback(async () => {
    const sanitized = getCadArtifactBaseName(renameValue, rawFilename);
    if (sanitized && sanitized !== shownBaseName) {
      setDisplayName(sanitized);
      saveStoredRename(workflow.workflow_id, sanitized);
      if (workflow.output_asset_id) {
        try {
          await renameAsset(workflow.output_asset_id, sanitized);
        } catch (err) {
          console.error('[WorkflowCard] rename asset error:', err);
          toast.error('The design name was saved on this device, but could not be synced.');
        }
      }
    }
    setIsRenaming(false);
  }, [renameValue, rawFilename, shownBaseName, workflow.workflow_id, workflow.output_asset_id]);

  const handleCancelRename = () => {
    setIsRenaming(false);
  };

  const handleDownloadThreedm = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDownloadingThreedm) return;

    setIsDownloadingThreedm(true);
    try {
      // Refresh the typed result at click time. History cache data may be old,
      // but GLB and 3DM must never be selected positionally or by extension.
      const fresh = await withTimeout(fetchCadResult(workflow.workflow_id), 5000);
      const url = selectCadArtifactUrl('3dm', fresh, workflow);
      if (!url) throw new Error('3DM is not available for this design.');

      try {
        await downloadCadArtifact(url, threedmFilename, '3dm');
      } catch (freshError) {
        const cachedUrl = selectCadArtifactUrl('3dm', null, workflow);
        if (!cachedUrl || cachedUrl === url) throw freshError;
        await downloadCadArtifact(cachedUrl, threedmFilename, '3dm');
      }
      import('@/lib/posthog-events').then(m => m.trackDownloadClicked({
        file_name: threedmFilename,
        file_type: '3dm',
        context: 'generations',
      }));
    } catch (err) {
      console.error('[WorkflowCard] 3DM download error:', err);
      toast.error(err instanceof Error ? err.message : 'Could not download the 3DM file.');
    } finally {
      setIsDownloadingThreedm(false);
    }
  };

  const handleLoadInStudio = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!workflow.glb_url) return;
    const params = new URLSearchParams({
      glb: workflow.glb_url,
      workflow_id: workflow.workflow_id,
    });
    navigate(`/text-to-cad?${params.toString()}`);
  };

  return (
    <>
      <motion.div
        variants={itemVariants}
        className="marta-frame overflow-hidden"
      >
        {/* Card header: public metadata only. */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 gap-2">
          <div className="hidden sm:flex items-center gap-2 min-w-0">
            <span className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground/70 select-none">
              #{index}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 flex-shrink-0">
            <span
              className="inline-flex min-h-8 items-center gap-1.5 border border-border/70 bg-muted/25 px-2.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-foreground"
              aria-label={workflow.credits_spent == null ? 'Credits used unavailable' : `${workflow.credits_spent} credits used`}
            >
              <img src={creditCoinIcon} alt="" className="h-4 w-4" />
              {workflow.credits_spent === undefined
                ? 'Calculating credits…'
                : workflow.credits_spent === null
                  ? 'Credits unavailable'
                  : `${workflow.credits_spent} credits used`}
            </span>
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground whitespace-nowrap">
              {dateStr}
            </span>
          </div>
        </div>

        {/* ── Interactive 3D GLB Preview ── */}
        {workflow.glb_url && (
          <div className="mx-3 mb-2 relative">
            <GLBPreviewSlot
              id={workflow.workflow_id}
              glbUrl={workflow.glb_url}
              className="w-full aspect-[4/3] bg-background/50 border border-border/30"
            />
          </div>
        )}
        {!workflow.glb_url && isEnriching && (
          <div className="mx-4 mb-3 w-[calc(100%-2rem)] aspect-[4/3] bg-muted/30 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-muted-foreground/20 border-t-muted-foreground/60 rounded-full animate-spin" />
          </div>
        )}


        {/* ── File box — only shown when GLB is available or still loading ── */}
        {(workflow.glb_url || isEnriching) && (
          <div className="mx-3 mb-4 flex flex-col gap-3 rounded-sm border border-border/50 bg-muted/20 px-3 py-3 sm:mx-4">
            {/* Shared design name: both artifact extensions are derived below. */}
            <div className="flex min-w-0 flex-1 items-start gap-1.5">
              <Box className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                {isRenaming ? (
                  <label htmlFor={renameInputId} className="mb-1 block font-mono text-[8px] uppercase tracking-[0.16em] text-muted-foreground">
                    Design name
                  </label>
                ) : (
                  <p className="mb-1 font-mono text-[8px] uppercase tracking-[0.16em] text-muted-foreground">
                    Design name
                  </p>
                )}
                {isRenaming ? (
                <div className="flex min-w-0 flex-1 items-center gap-1" onClick={e => e.stopPropagation()}>
                  <Input
                    id={renameInputId}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleConfirmRename();
                      if (e.key === 'Escape') handleCancelRename();
                    }}
                    autoFocus
                    maxLength={50}
                    className="h-11 min-w-0 flex-1 px-3 py-0 font-mono text-[10px] tracking-wider"
                  />
                  <button onClick={handleConfirmRename} aria-label="Save design name" className="inline-flex h-11 w-11 items-center justify-center border border-border text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground">
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={handleCancelRename} aria-label="Cancel design rename" className="inline-flex h-11 w-11 items-center justify-center border border-border text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                ) : (
                <div className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="truncate font-mono text-[10px] tracking-wider text-foreground"
                    title={shownBaseName}
                  >
                    {isEnriching ? '—' : visibleBaseName}
                  </span>
                  {!isEnriching && workflow.glb_url && (
                    <button
                      onClick={handleStartRename}
                      className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-foreground"
                      aria-label="Rename design"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                )}
              </div>
            </div>

            {workflow.glb_url ? (
              <div className="flex w-full flex-col gap-2">
                {supportsThreedm && (
                  <section
                    aria-label="Manufacturing deliverable"
                    className="border border-[hsl(var(--formanova-hero-accent))]/45 bg-[hsl(var(--formanova-hero-accent))]/[0.04] p-2.5"
                  >
                    <div className="mb-2 flex items-end justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-[8px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--formanova-hero-accent))]">
                          Manufacturing file
                        </p>
                        <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
                          Native Rhino 3DM
                        </p>
                      </div>
                      <span className="min-w-0 truncate font-mono text-[8px] uppercase tracking-[0.12em] text-muted-foreground" title={threedmFilename}>
                        {threedmFilename}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleDownloadThreedm}
                      disabled={isDownloadingThreedm}
                      className="h-11 w-full gap-1.5 border-[hsl(var(--formanova-hero-accent))] bg-transparent px-3 font-mono text-[9px] uppercase tracking-wider text-[hsl(var(--formanova-hero-accent))] hover:bg-[hsl(var(--formanova-hero-accent))]/10 hover:text-[hsl(var(--formanova-hero-accent))]"
                      title="Download machinable 3DM"
                      aria-label="Download 3DM"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {isDownloadingThreedm ? 'Checking 3DM…' : 'Download 3DM'}
                    </Button>
                  </section>
                )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleLoadInStudio}
                    className="h-9 w-full gap-1.5 border-border bg-transparent px-3 font-mono text-[9px] uppercase tracking-wider text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  >
                    <Layers className="h-3.5 w-3.5 shrink-0" />
                    Open in Studio
                  </Button>
              </div>
            ) : (
              <span className="font-mono text-[9px] tracking-wider text-muted-foreground/40 uppercase">
                Loading…
              </span>
            )}
          </div>
        )}
      </motion.div>

      {/* Snapshot preview modal */}
      {previewIndex !== null && hasShots && (
        <SnapshotPreviewModal
          screenshots={shots}
          initialIndex={previewIndex}
          glbUrl={workflow.glb_url}
          glbFilename={workflow.glb_filename}
          onClose={() => setPreviewIndex(null)}
        />
      )}
    </>
  );
}

// ─── Exported card dispatcher ───────────────────────────────────────────────

export function WorkflowCard({ workflow, index = 0, onClick: _onClick, onUpscaled }: WorkflowCardProps) {
  if (workflow.source_type === 'text_to_cad' || workflow.source_type === 'image_to_cad') {
    return <CadTextCard workflow={workflow} index={index} />;
  }

  // photo and cad_render both use the new image-first card
  return <PhotoCard workflow={workflow} index={index} onUpscaled={onUpscaled} />;
}
