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
import { downloadAsset, isShaLikeName, renameAsset } from '@/lib/assets-api';
import { truncateDisplayName, formatLocal, formatLocalDateOnly, itemVariants, CreditsBadge } from './workflow-card-shared';
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

// Model ID -> display label mapping
const MODEL_LABELS: Record<string, string> = {
  gemini: 'Lite',
  'claude-sonnet': 'Standard',
  'claude-opus': 'Premium',
  lite: 'Lite',
  standard: 'Standard',
  premium: 'Premium',
};

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
  const dateOnlyStr = workflow.created_at ? formatLocalDateOnly(workflow.created_at) : '—';
  const shots = workflow.screenshots ?? [];
  const hasShots = shots.length > 0;
  const isEnriching = workflow.screenshots === undefined;
  const isFailed = workflow.status === 'failed';

  const modelLabel = workflow.mode
    ? MODEL_LABELS[workflow.mode.toLowerCase()] ?? workflow.mode
    : workflow.ai_model
      ? MODEL_LABELS[workflow.ai_model] ?? workflow.ai_model
      : null;

  // Derive the shown filename (user rename takes priority)
  const rawFilename = workflow.glb_filename || 'model.glb';
  const extension = rawFilename.includes('.') ? rawFilename.split('.').pop()! : 'glb';
  const baseName = rawFilename.replace(/\.[^.]+$/, '');
  const shownBaseName = displayName ?? baseName;
  const shownFilename = `${shownBaseName}.${extension}`;
  const visibleFilename = `${truncateDisplayName(shownBaseName)}.${extension}`;

  const handleStartRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRenameValue(displayName || baseName);
    setIsRenaming(true);
  };

  const handleConfirmRename = useCallback(async () => {
    const sanitized = renameValue.trim().replace(/[<>:"/\\|?*]/g, '_');
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
  }, [renameValue, baseName, workflow.workflow_id, workflow.output_asset_id]);

  const handleCancelRename = () => {
    setIsRenaming(false);
  };

  const handleDownloadGlb = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!workflow.glb_url) return;
    import('@/lib/posthog-events').then(m => m.trackDownloadClicked({ file_name: shownFilename, file_type: 'glb', context: 'generations' }));
    try {
      if (workflow.output_asset_id) {
        await downloadAsset(workflow.output_asset_id);
        return;
      }
      const resp = await authenticatedFetch(workflow.glb_url);
      if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = shownFilename;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('[WorkflowCard] GLB download error:', err);
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
        {/* Card header: number + model tier + date */}
        <div className="flex items-center justify-end sm:justify-between px-4 pt-4 pb-3 gap-2">
          <div className="hidden sm:flex items-center gap-2 min-w-0">
            <span className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground/70 select-none">
              #{index}
            </span>
            {modelLabel && (
              <span className="font-mono text-[9px] tracking-[0.15em] uppercase px-2 py-0.5 border border-border bg-muted/40 text-muted-foreground">
                {modelLabel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="hidden sm:inline-flex"><CreditsBadge credits={workflow.credits_spent} /></span>
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground whitespace-nowrap">
              <span className="sm:hidden">{dateOnlyStr}</span>
              <span className="hidden sm:inline">{dateStr}</span>
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
          <div className="mx-4 mb-4 flex items-center gap-2 rounded-sm border border-border/50 bg-muted/20 px-3 py-2.5">
            {/* Left: filename + rename */}
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <Box className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
              {isRenaming ? (
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <Input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleConfirmRename();
                      if (e.key === 'Escape') handleCancelRename();
                    }}
                    autoFocus
                    maxLength={50}
                    className="h-6 font-mono text-[10px] tracking-wider px-1.5 py-0 min-w-[80px] max-w-[140px]"
                  />
                  <span className="text-[10px] text-muted-foreground font-mono">.{extension}</span>
                  <button onClick={handleConfirmRename} className="p-0.5 hover:text-foreground text-muted-foreground transition-colors">
                    <Check className="h-3 w-3" />
                  </button>
                  <button onClick={handleCancelRename} className="p-0.5 hover:text-foreground text-muted-foreground transition-colors">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span
                    className="font-mono text-[10px] tracking-wider text-foreground truncate max-w-[140px]"
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
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {workflow.glb_url ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleDownloadGlb}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                    title="Download GLB"
                    aria-label="Download GLB"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleLoadInStudio}
                    className="h-7 px-2.5 font-mono text-[9px] tracking-wider uppercase gap-1 whitespace-nowrap"
                  >
                    <Layers className="h-3 w-3 flex-shrink-0" />
                    <span className="hidden sm:inline">Load in Studio</span>
                    <span className="sm:hidden">Studio</span>
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
  if (workflow.source_type === 'cad_text') {
    return <CadTextCard workflow={workflow} index={index} />;
  }

  // photo and cad_render both use the new image-first card
  return <PhotoCard workflow={workflow} index={index} onUpscaled={onUpscaled} />;
}
