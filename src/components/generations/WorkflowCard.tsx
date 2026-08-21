import React, { useState, useCallback, useEffect, useRef } from 'react';
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
import { buildCadRestorePath } from '@/contexts/GenerationsContext';
import { cadSourceFromSourceType, cadRouteFromSource } from '@/lib/cad-analytics';
import {
  downloadCadArtifact,
  selectCadArtifactUrl,
  type CadArtifactKind,
} from '@/lib/cad-artifact-download';
import { CadDownloadMenu } from '@/components/downloads/CadDownloadMenu';

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
  const [isDownloading, setIsDownloading] = useState<CadArtifactKind | null>(null);
  const renameButtonRef = useRef<HTMLButtonElement>(null);
  const wasRenamingRef = useRef(false);

  useEffect(() => {
    if (workflow.output_asset_name && !getStoredRename(loadStoredRenames(), workflow.workflow_id)) {
      setDisplayName(workflow.output_asset_name);
    }
  }, [workflow.output_asset_name]);

  // Return focus to the pencil button once the rename form closes (save or
  // cancel), so keyboard/screen-reader users aren't dropped on a removed field.
  useEffect(() => {
    if (wasRenamingRef.current && !isRenaming) renameButtonRef.current?.focus();
    wasRenamingRef.current = isRenaming;
  }, [isRenaming]);

  const dateStr = workflow.created_at ? formatLocal(workflow.created_at) : '—';
  const shots = workflow.screenshots ?? [];
  const hasShots = shots.length > 0;
  const isEnriching = workflow.screenshots === undefined;

  // The editable design name becomes the manufacturing download filename.
  const rawFilename = workflow.glb_filename || 'model.glb';
  const shownBaseName = getCadArtifactBaseName(displayName, rawFilename);
  const threedmFilename = buildCadArtifactFilename(displayName, rawFilename, '3dm');
  const glbFilename = buildCadArtifactFilename(displayName, rawFilename, 'glb');
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

  /**
   * Fetches whichever artifact was asked for and saves it exactly as the
   * backend returned it. Both kinds go through the same path so the .3dm and
   * the .glb cannot drift into being fetched, validated or named differently.
   */
  const downloadArtifact = async (kind: CadArtifactKind) => {
    if (isDownloading) return;
    const filename = kind === '3dm' ? threedmFilename : glbFilename;

    setIsDownloading(kind);
    try {
      // Refresh the typed result at click time. History cache data may be old,
      // but GLB and 3DM must never be selected positionally or by extension.
      const fresh = await withTimeout(fetchCadResult(workflow.workflow_id), 5000);
      const url = selectCadArtifactUrl(kind, fresh, workflow);
      if (!url) throw new Error(`${kind.toUpperCase()} is not available for this design.`);

      try {
        await downloadCadArtifact(url, filename, kind);
      } catch (freshError) {
        const cachedUrl = selectCadArtifactUrl(kind, null, workflow);
        if (!cachedUrl || cachedUrl === url) throw freshError;
        await downloadCadArtifact(cachedUrl, filename, kind);
      }
      import('@/lib/posthog-events').then(m => m.trackDownloadClicked({
        file_name: filename,
        file_type: kind,
        context: 'generations',
        // Without this every download made from history is unattributable:
        // one card serves both CAD tools, so 'generations' alone cannot say
        // which of them produced the model.
        source: cadSourceFromSourceType(workflow.source_type),
      }));
    } catch (err) {
      console.error(`[WorkflowCard] ${kind} download error:`, err);
      toast.error(err instanceof Error ? err.message : `Could not download the ${kind.toUpperCase()} file.`);
    } finally {
      setIsDownloading(null);
    }
  };

  const handleLoadInStudio = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!workflow.glb_url) return;
    // One card serves both CAD types, so the workspace has to be chosen by
    // source rather than assumed. Both routes restore from the id alone.
    // Built by the shared helper rather than by hand so this link carries the
    // 'history' marker: an unmarked restore is counted as an external (email)
    // arrival, and a hand-rolled URL here would land in that bucket instead.
    const source = cadSourceFromSourceType(workflow.source_type);
    navigate(buildCadRestorePath(workflow.workflow_id, workflow.glb_url, cadRouteFromSource(source), 'history'));
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
              /* Same plain badge the photo cards use (CreditsBadge): coin and
                 figure, nothing else. The two non-numeric states stay as marks
                 rather than words, since a CAD run can be mid-audit and an
                 empty pill would read as free. The full wording lives in the
                 aria-label so it is still announced. */
              className="inline-flex items-center gap-1 font-mono text-[10px] tracking-wider text-muted-foreground"
              aria-label={workflow.credits_spent == null ? 'Credits used unavailable' : `${workflow.credits_spent} credits used`}
              role="status"
              aria-live="polite"
            >
              <img src={creditCoinIcon} alt="" className="h-3.5 w-3.5" />
              {workflow.credits_spent === undefined
                ? '…'
                : workflow.credits_spent === null
                  ? '—'
                  : workflow.credits_spent}
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
              className="w-full aspect-[4/3] min-h-[300px] sm:min-h-[360px] bg-background/50 border border-border/30"
            />
          </div>
        )}
        {!workflow.glb_url && isEnriching && (
          <div
            className="mx-4 mb-3 flex w-[calc(100%-2rem)] aspect-[4/3] items-center justify-center border border-border/30 bg-muted"
            role="status"
            aria-live="polite"
          >
            <div className="w-6 h-6 border-2 border-foreground/20 border-t-foreground/60 rounded-full animate-spin" />
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
                    role="status"
                    aria-live="polite"
                  >
                    {isEnriching ? '—' : visibleBaseName}
                  </span>
                  {!isEnriching && workflow.glb_url && (
                    <button
                      ref={renameButtonRef}
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
                {/* Both actions are siblings of the same container so their
                    w-full resolves to one width. Nesting the download inside
                    the padded section above made it narrower than its pair. */}
                <CadDownloadMenu
                  variant="card"
                  isBusy={isDownloading !== null}
                  onDownloadThreedm={supportsThreedm ? () => downloadArtifact('3dm') : undefined}
                  onDownloadGlb={workflow.glb_url ? () => downloadArtifact('glb') : undefined}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleLoadInStudio}
                  className="h-11 w-full gap-1.5 border-border bg-transparent px-3 font-mono text-[9px] uppercase tracking-wider text-foreground transition-colors hover:border-foreground/60 hover:bg-muted/40"
                >
                  <Layers className="h-3.5 w-3.5 shrink-0" />
                  Open in Studio
                </Button>
              </div>
            ) : (
              <span className="font-mono text-[9px] tracking-wider text-muted-foreground uppercase">
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
