import React, { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Box, Download, Pencil, Check, X, Layers } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import creditCoinIcon from '@/assets/icons/credit-coin.png';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { WorkflowSummary } from '@/lib/generation-history-api';
import { SnapshotPreviewModal } from './SnapshotPreviewModal';
import { GLBPreviewSlot } from './ScissorGLBGrid';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { isShaLikeName, renameAsset } from '@/lib/assets-api';
import {
  buildCadArtifactFilename,
  formatLocal,
  getCadArtifactBaseName,
  itemVariants,
  truncateDisplayName,
  CreditsBadge,
} from './workflow-card-shared';
import { PhotoCard } from './PhotoCard';

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

  useEffect(() => {
    if (workflow.output_asset_name && !getStoredRename(loadStoredRenames(), workflow.workflow_id)) {
      setDisplayName(workflow.output_asset_name);
    }
  }, [workflow.output_asset_name]);

  const dateStr = workflow.created_at ? formatLocal(workflow.created_at) : '—';
  const shots = workflow.screenshots ?? [];
  const hasShots = shots.length > 0;
  const isEnriching = workflow.screenshots === undefined;

  // Derive the shown filename (user rename takes priority)
  const rawFilename = workflow.glb_filename || 'model.glb';
  const baseName = getCadArtifactBaseName(null, rawFilename);
  const shownBaseName = getCadArtifactBaseName(displayName, rawFilename);
  const shownFilename = buildCadArtifactFilename(displayName, rawFilename, 'glb');
  const visibleFilename = `${truncateDisplayName(shownBaseName)}.glb`;

  const handleStartRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRenameValue(shownBaseName);
    setIsRenaming(true);
  };

  const handleConfirmRename = useCallback(async () => {
    const sanitized = getCadArtifactBaseName(renameValue, rawFilename);
    if (sanitized && sanitized !== baseName && workflow.output_asset_id) {
      setDisplayName(sanitized);
      saveStoredRename(workflow.workflow_id, sanitized);
      try {
        await renameAsset(workflow.output_asset_id, sanitized);
      } catch (err) {
        console.error('[WorkflowCard] rename asset error:', err);
      }
    }
    setIsRenaming(false);
  }, [renameValue, baseName, rawFilename, workflow.workflow_id, workflow.output_asset_id]);

  const handleCancelRename = () => {
    setIsRenaming(false);
  };

  const handleDownloadGlb = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!workflow.glb_url) return;
    import('@/lib/posthog-events').then(m => m.trackDownloadClicked({ file_name: shownFilename, file_type: 'glb', context: 'generations' }));
    try {
      const resp = await authenticatedFetch(workflow.glb_url);
      if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
      const blob = await resp.blob();
      if (blob.size === 0) throw new Error('Download returned an empty file');
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = shownFilename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    } catch (err) {
      console.error('[WorkflowCard] GLB download error:', err);
    }
  };

  const handleDownloadThreedm = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!workflow.threedm_url) return;
    const fileName = buildCadArtifactFilename(displayName, rawFilename, '3dm');
    import('@/lib/posthog-events').then(m => m.trackDownloadClicked({ file_name: fileName, file_type: '3dm', context: 'generations' }));
    try {
      const resp = await authenticatedFetch(workflow.threedm_url);
      if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
      const blob = await resp.blob();
      if (blob.size === 0) throw new Error('Download returned an empty file');
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    } catch (err) {
      console.error('[WorkflowCard] 3DM download error:', err);
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
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="hidden sm:inline-flex"><CreditsBadge credits={workflow.credits_spent} /></span>
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
            {workflow.credits_spent != null && (
              <div className="sm:hidden absolute top-0 left-0 flex items-center gap-1 bg-background/80 backdrop-blur-sm px-1.5 py-0.5 border-r border-b border-border/30">
                <img src={creditCoinIcon} alt="" className="w-3 h-3" />
                <span className="font-mono text-[9px] text-foreground">{workflow.credits_spent}</span>
              </div>
            )}
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
            {/* Left: filename + rename */}
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <Box className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
              {isRenaming ? (
                <div className="flex min-w-0 flex-1 items-center gap-1" onClick={e => e.stopPropagation()}>
                  <Input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleConfirmRename();
                      if (e.key === 'Escape') handleCancelRename();
                    }}
                    autoFocus
                    maxLength={50}
                    className="h-7 min-w-0 flex-1 px-1.5 py-0 font-mono text-[10px] tracking-wider"
                  />
                  <span className="text-[10px] text-muted-foreground font-mono">.glb</span>
                  <button onClick={handleConfirmRename} className="p-0.5 hover:text-foreground text-muted-foreground transition-colors">
                    <Check className="h-3 w-3" />
                  </button>
                  <button onClick={handleCancelRename} className="p-0.5 hover:text-foreground text-muted-foreground transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="truncate font-mono text-[10px] tracking-wider text-foreground"
                    title={shownFilename}
                  >
                    {isEnriching ? '—' : visibleFilename}
                  </span>
                  {!isEnriching && workflow.glb_url && workflow.output_asset_id && (
                    <button
                      onClick={handleStartRename}
                      className="p-0.5 hover:text-foreground text-muted-foreground/50 transition-colors flex-shrink-0"
                      aria-label="Rename file"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Right: action buttons */}
            <div className="grid w-full grid-cols-1 gap-2 min-[420px]:grid-cols-2">
              {workflow.glb_url ? (
                <>
                  {workflow.threedm_url && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleDownloadThreedm}
                      className="h-9 w-full gap-1.5 border-[hsl(var(--formanova-hero-accent))] bg-transparent px-3 font-mono text-[9px] uppercase tracking-wider text-[hsl(var(--formanova-hero-accent))] hover:bg-[hsl(var(--formanova-hero-accent))]/10 hover:text-[hsl(var(--formanova-hero-accent))]"
                      title="Download machinable 3DM"
                      aria-label="Download 3DM"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download 3DM
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleLoadInStudio}
                    className="h-9 w-full gap-1.5 border-border bg-transparent px-3 font-mono text-[9px] uppercase tracking-wider hover:bg-muted/40"
                  >
                    <Layers className="h-3.5 w-3.5 shrink-0" />
                    Open in Studio
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDownloadGlb}
                    className="h-9 w-full gap-1.5 border-border bg-transparent px-3 font-mono text-[9px] uppercase tracking-wider text-muted-foreground hover:bg-muted/40 hover:text-foreground min-[420px]:col-span-2"
                    title="Export GLB preview model"
                    aria-label="Export GLB"
                  >
                    <Download className="h-3.5 w-3.5 shrink-0" />
                    Export GLB
                  </Button>
                </>
              ) : (
                <span className="font-mono text-[9px] tracking-wider text-muted-foreground/40 uppercase">
                  Loading…
                </span>
              )}
            </div>
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
