import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { reloadPreservingSession } from '@/lib/reload-utils';
import {
  listMyWorkflows,
  getWorkflowDetails,
  fetchWorkflowCreditAudit,
  fetchCadResult,
  type WorkflowSummary,
} from '@/lib/generation-history-api';
import { extractPhotoThumbnail, extractCadTextData, extractProductShotThumbnail } from '@/lib/generation-enrichment';
import { fetchUserAssets, getAssetDisplayName } from '@/lib/assets-api';
import {
  loadCache,
  saveCache,
  preloadImage,
  withTimeout,
  retryNullable,
  isVisibleGeneration,
  getAssetWorkflowId,
  getArtifactKey,
  getAssetArtifactKeys,
  type CachePayload,
} from '@/lib/generation-history-utils';
import { WorkflowSection, SectionIcons } from '@/components/generations/WorkflowSection';
import { ScissorGLBGrid } from '@/components/generations/ScissorGLBGrid';
import CADRuntimeErrorBoundary from '@/components/cad/CADRuntimeErrorBoundary';

const PER_PAGE = 5;

type SourceType = 'photo' | 'product_shot' | 'cad_render' | 'text_to_cad' | 'image_to_cad';

interface SectionState {
  workflows: WorkflowSummary[];
  page: number;
  totalPages: number;
  loading: boolean;
}

// ── Component ────────────────────────────────────────────────────────

export default function Generations() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  const [allWorkflows, setAllWorkflows] = useState<WorkflowSummary[]>([]);
  const [globalLoading, setGlobalLoading] = useState(true);
  // Bumped when an inline upscale completes, to re-fetch the list so the new
  // upscaled generation appears as its own entry.
  const [refreshKey, setRefreshKey] = useState(0);
  /** Fires once per deep link so a later re-render cannot yank the page back. */
  const scrolledToLinkedRef = useRef(false);

  // Deep link from the result notification email: /generations?workflow=<id>.
  // Backend links here rather than attaching the file, so the download stays
  // behind auth. Wait for the list to render, then bring that run into view.
  useEffect(() => {
    const linked = searchParams.get('workflow')?.trim();
    if (!linked || globalLoading || scrolledToLinkedRef.current) return;
    const node = document.getElementById(`workflow-${linked}`);
    if (!node) return;   // not on this page, or filtered out
    scrolledToLinkedRef.current = true;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [searchParams, globalLoading, allWorkflows]);

  const [photoPage, setPhotoPage] = useState(1);
  const [productShotPage, setProductShotPage] = useState(1);
  const [textCadPage, setTextCadPage] = useState(1);
  const [imageCadPage, setImageCadPage] = useState(1);

  // Track enriched IDs + their data for sessionStorage persistence
  const enrichedRef = useRef<Record<string, Partial<WorkflowSummary>>>({});
  const generatedAssetNamesRef = useRef<{
    byAssetId: Record<string, string>;
    byWorkflowId: Record<string, string>;
    byArtifactKey: Record<string, string>;
  }>({ byAssetId: {}, byWorkflowId: {}, byArtifactKey: {} });

  const resolveGeneratedAssetName = useCallback((workflow: WorkflowSummary): string | null => {
    const maps = generatedAssetNamesRef.current;
    const artifactKey = getArtifactKey(workflow.glb_url);
    return (
      workflow.output_asset_name ||
      (workflow.output_asset_id ? maps.byAssetId[workflow.output_asset_id] : undefined) ||
      maps.byWorkflowId[workflow.workflow_id] ||
      (artifactKey ? maps.byArtifactKey[artifactKey] : undefined) ||
      null
    );
  }, []);

  // ── Step 1: Fetch workflow list — use cache for instant load ──────
  useEffect(() => {
    if (!user) return;

    // Try cache first for instant render
    const cached = loadCache();
    if (cached) {
      const visibleCachedWorkflows = cached.workflows.filter(isVisibleGeneration);
      const normalizedEnriched = Object.fromEntries(
        Object.entries(cached.enriched).filter(([workflowId, data]) => {
          const workflow = visibleCachedWorkflows.find((w) => w.workflow_id === workflowId);
          if (!workflow) return false;
          if (Object.keys(data).length === 0) return false;
          if (workflow?.source_type === 'product_shot' && data.thumbnail_url === '') return false;
          const isCad = workflow?.source_type === 'text_to_cad' || workflow?.source_type === 'image_to_cad';
          if (isCad && data.screenshots !== undefined && !data.glb_url) return false;
          return true;
        }),
      );
      // Apply cached enrichment data on top of workflow list
      const hydrated = visibleCachedWorkflows.map(w => {
        const e = normalizedEnriched[w.workflow_id];
        return e ? { ...w, ...e } : w;
      });
      setAllWorkflows(hydrated);
      enrichedRef.current = normalizedEnriched;
      // Preload all cached thumbnail images into browser cache
      Object.values(normalizedEnriched).forEach(e => {
        if (e.thumbnail_url) preloadImage(e.thumbnail_url);
      });
      setGlobalLoading(false);
      if (import.meta.env.DEV) console.log('[Generations] loaded from cache:', cached.workflows.length, 'workflows');
    }

    // Always fetch fresh in background
    const controller = new AbortController();
    const safetyTimeout = setTimeout(() => {
      console.warn('[Generations] Safety timeout — forcing loading off');
      setGlobalLoading(false);
      if (!cached) setError('Request timed out. Please try again.');
      controller.abort();
    }, 15000);

    (async () => {
      try {
        if (!cached) setGlobalLoading(true);
        const rawWorkflows = await listMyWorkflows(100, 0);
        const workflows = rawWorkflows.filter(w => w.source_type !== 'unknown' && isVisibleGeneration(w));
        if (import.meta.env.DEV) console.log('[Generations] fetched:', rawWorkflows.length, '→ valid:', workflows.length);

        // Build generated asset name maps. Some older workflow rows do not expose
        // output_asset_id, so also match by metadata.workflow_id when available.
        const assetNameMap: Record<string, string> = {};
        const workflowAssetNameMap: Record<string, string> = {};
        const artifactAssetNameMap: Record<string, string> = {};
        try {
          const [photos, cads] = await Promise.all([
            fetchUserAssets('generated_photo', 0, 100),
            fetchUserAssets('generated_cad', 0, 100),
          ]);
          [...photos.items, ...cads.items].forEach(a => {
            const name = getAssetDisplayName(a);
            if (!name) return;
            assetNameMap[a.id] = name;
            const workflowId = getAssetWorkflowId(a);
            if (workflowId) workflowAssetNameMap[workflowId] = name;
            getAssetArtifactKeys(a).forEach(key => {
              artifactAssetNameMap[key] = name;
            });
          });
        } catch { /* non-fatal — names just won't show */ }

        generatedAssetNamesRef.current = {
          byAssetId: assetNameMap,
          byWorkflowId: workflowAssetNameMap,
          byArtifactKey: artifactAssetNameMap,
        };

        // Re-apply enriched data + asset names
        const merged = workflows.map(w => {
          const e = enrichedRef.current[w.workflow_id];
          const hydrated = { ...w, ...(e ?? {}) };
          const output_asset_name = resolveGeneratedAssetName(hydrated);
          return { ...hydrated, ...(output_asset_name ? { output_asset_name } : {}) };
        });
        setAllWorkflows(merged);
        saveCache(merged, enrichedRef.current);
      } catch (err: any) {
        console.error('[Generations] fetch error:', err);
        if (err.name !== 'AuthExpiredError' && !cached) {
          setError('Could not load your generation history. Please try again.');
        }
      } finally {
        clearTimeout(safetyTimeout);
        setGlobalLoading(false);
      }
    })();

    return () => { clearTimeout(safetyTimeout); controller.abort(); };
  }, [resolveGeneratedAssetName, user, refreshKey]);

  // ── Pagination helper ─────────────────────────────────────────────
    const getSection = useCallback(
    (source: SourceType, page: number, requireImage = false): SectionState => {
      const isCadSource = source === 'text_to_cad' || source === 'image_to_cad';
      const filtered = allWorkflows.filter((w) => {
        if (w.source_type !== source || !isVisibleGeneration(w)) return false;
        // Skip photo/product_shot/cad_render cards that enriched but have no thumbnail
        if (requireImage && w.thumbnail_url === '') return false;
        // Successful CAD runs without an artifact are not actionable.
        if (isCadSource && w.screenshots !== undefined && !w.glb_url) return false;
        return true;
      });
      const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
      const start = (page - 1) * PER_PAGE;
      return {
        workflows: filtered.slice(start, start + PER_PAGE),
        page,
        totalPages,
        loading: globalLoading,
      };
    },
    [allWorkflows, globalLoading],
  );

  // ── Step 2: Enrich workflows with throttled concurrency ──────────
  useEffect(() => {
    if (globalLoading || allWorkflows.length === 0) return;

    const allUnenriched = allWorkflows.filter(
      w => w.thumbnail_url === undefined && !enrichedRef.current[w.workflow_id] &&
           isVisibleGeneration(w)
    );

    if (allUnenriched.length === 0) return;

    // Mark immediately to prevent duplicate fetches
    allUnenriched.forEach(w => {
      enrichedRef.current[w.workflow_id] = {};
    });

    let cancelled = false;

    const applyEnrichment = (id: string, data: Partial<WorkflowSummary>) => {
      enrichedRef.current[id] = data;
      setAllWorkflows(prev =>
        prev.map(w => {
          if (w.workflow_id !== id) return w;
          const hydrated = { ...w, ...data };
          const output_asset_name = resolveGeneratedAssetName(hydrated);
          return { ...hydrated, ...(output_asset_name ? { output_asset_name } : {}) };
        })
      );
    };

    // Throttled sequential-batch enrichment (3 at a time with delay)
    (async () => {
      for (let i = 0; i < allUnenriched.length; i += 3) {
        if (cancelled) return;
        const batch = allUnenriched.slice(i, i + 3);
        await Promise.allSettled(
          batch.map(async (wf) => {
            if (wf.source_type === 'text_to_cad' || wf.source_type === 'image_to_cad') {
              const details = await retryNullable(
                () => withTimeout(getWorkflowDetails(wf.workflow_id), 5000),
                2,
              );
              if (!details) {
                if (!cancelled) applyEnrichment(wf.workflow_id, {
                  thumbnail_url: '',
                  screenshots: [],
                  glb_url: null,
                });
                return;
              }
              const stepData = extractCadTextData(details.steps ?? []);
              if (!cancelled) applyEnrichment(wf.workflow_id, stepData);

              if (!stepData.glb_url) {
                const cadResult = await withTimeout(fetchCadResult(wf.workflow_id), 5000);
                if (!cancelled && cadResult && (cadResult.glb_url || cadResult.threedm_url)) {
                  applyEnrichment(wf.workflow_id, {
                    ...stepData,
                    glb_url: cadResult.glb_url,
                    threedm_url: cadResult.threedm_url,
                  });
                }
              }
              return;
            }
            if (wf.source_type === 'product_shot') {
              const details = await retryNullable(
                () => withTimeout(getWorkflowDetails(wf.workflow_id), 5000),
                2,
              );
              if (!details) {
                if (!cancelled) applyEnrichment(wf.workflow_id, { thumbnail_url: '' });
                return;
              }
              const thumbnail_url = extractProductShotThumbnail(details.steps ?? []);
              if (thumbnail_url) preloadImage(thumbnail_url);
              if (!cancelled) applyEnrichment(wf.workflow_id, { thumbnail_url: thumbnail_url ?? '' });
              return;
            }
            const details = await retryNullable(
              () => withTimeout(getWorkflowDetails(wf.workflow_id), 5000),
              2,
            );
            if (!details) {
              if (!cancelled) applyEnrichment(wf.workflow_id, { thumbnail_url: '' });
              return;
            }
            const thumbnail_url = extractPhotoThumbnail(details.steps ?? []);
            if (thumbnail_url) preloadImage(thumbnail_url);
            if (!cancelled) applyEnrichment(wf.workflow_id, { thumbnail_url: thumbnail_url ?? '' });
          })
        );

        if (cancelled) return;
        saveCache(allWorkflows, enrichedRef.current);

        // Small delay between batches to avoid hammering the backend
        if (i + 3 < allUnenriched.length) {
          await new Promise(r => setTimeout(r, 300));
        }
      }
    })();

    return () => { cancelled = true; };
  }, [allWorkflows.length, globalLoading, resolveGeneratedAssetName]);

  // ── Step 3: Fetch credit audit — throttled, only visible page items first
  const auditFetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (globalLoading || allWorkflows.length === 0) return;

    const needsAudit = allWorkflows.filter(
      w => w.credits_spent === undefined &&
           !auditFetchedRef.current.has(w.workflow_id) &&
           isVisibleGeneration(w)
    );

    if (needsAudit.length === 0) return;

    needsAudit.forEach(w => auditFetchedRef.current.add(w.workflow_id));

    let cancelled = false;

    (async () => {
      // Process in small batches of 3 with delays
      for (let i = 0; i < needsAudit.length; i += 3) {
        if (cancelled) return;
        const batch = needsAudit.slice(i, i + 3);
        const results = await Promise.allSettled(
          batch.map(async wf => {
            const credits = await retryNullable(
              () => withTimeout(fetchWorkflowCreditAudit(wf.workflow_id), 5000),
              3,
            );
            return { id: wf.workflow_id, credits_spent: credits };
          })
        );

        if (cancelled) return;

        const updates: Record<string, number | null> = {};
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value) {
            updates[r.value.id] = r.value.credits_spent;
          }
        }
        if (Object.keys(updates).length > 0) {
          setAllWorkflows(prev =>
            prev.map(w => updates[w.workflow_id] !== undefined
              ? { ...w, credits_spent: updates[w.workflow_id] }
              : w
            )
          );
        }

        if (i + 3 < needsAudit.length) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
    })();

    return () => { cancelled = true; };
  }, [allWorkflows.length, globalLoading]);

  const photoSection = getSection('photo', photoPage, true);
  const productShotSection = getSection('product_shot', productShotPage, true);
  const textCadSection = getSection('text_to_cad', textCadPage);
  const imageCadSection = getSection('image_to_cad', imageCadPage);

  return (
    <>
      <Helmet>
        <title>My Generations | FormaNova</title>
        <meta name="description" content="View and manage your AI-generated jewelry photoshoots and CAD models. Download, share, or revisit past creations." />
        <link rel="canonical" href="/generations" />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
    <div className="min-h-[calc(100vh-5rem)] bg-background py-6 px-6 md:px-12 lg:px-16">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-10"
        >
          <div className="max-w-2xl">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 font-mono text-[9px] tracking-[0.3em] text-muted-foreground uppercase hover:text-foreground transition-colors mb-2"
            >
              <ArrowLeft className="h-3 w-3" />
              Dashboard
            </Link>
            <h1 className="font-display text-4xl uppercase tracking-wide text-foreground md:text-5xl">
              Generations
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Review, rename, download, and reopen your generated jewelry assets.
            </p>
          </div>
        </motion.div>

        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="marta-frame p-8 flex flex-col items-center justify-center text-center mb-10"
          >
            <AlertCircle className="h-8 w-8 text-destructive mb-3" />
            <p className="font-mono text-[11px] tracking-wider text-destructive mb-4">
              {error}
            </p>
            <Button
              onClick={() => reloadPreservingSession()}
              variant="outline"
              className="font-mono text-[10px] tracking-wider uppercase"
            >
              Retry
            </Button>
          </motion.div>
        )}

        {!error && (
          <>
            <WorkflowSection
              title="Model Shot"
              subtitle="Jewelry photo to on-model imagery"
              icon={SectionIcons.photo}
              workflows={photoSection.workflows}
              loading={photoSection.loading}
              currentPage={photoSection.page}
              totalPages={photoSection.totalPages}
              columns={5}
              onPageChange={setPhotoPage}
              onWorkflowClick={() => {}}
              onUpscaled={() => setRefreshKey(k => k + 1)}
            />

            <WorkflowSection
              title="Product Shot"
              subtitle="AI-generated product photography"
              icon={SectionIcons.productShot}
              workflows={productShotSection.workflows}
              loading={productShotSection.loading}
              currentPage={productShotSection.page}
              totalPages={productShotSection.totalPages}
              columns={5}
              onPageChange={setProductShotPage}
              onWorkflowClick={() => {}}
              onUpscaled={() => setRefreshKey(k => k + 1)}
            />

            <CADRuntimeErrorBoundary
              title="CAD Previews Unavailable"
              description="The 3D preview grid hit a rendering problem. Your generation history is still available."
              resetKeys={[textCadPage, imageCadPage]}
            >
              <ScissorGLBGrid>
                <WorkflowSection
                  title="Text to CAD"
                  subtitle="CAD models generated from text"
                  icon={SectionIcons.textToCad}
                  workflows={textCadSection.workflows}
                  loading={textCadSection.loading}
                  currentPage={textCadSection.page}
                  totalPages={textCadSection.totalPages}
                  columns={3}
                  indexOffset={(textCadPage - 1) * PER_PAGE}
                  onPageChange={setTextCadPage}
                  onWorkflowClick={() => {}}
                />
                {imageCadSection && (
                  <WorkflowSection
                    title="Image to CAD"
                    subtitle="CAD models generated from reference images"
                    icon={SectionIcons.imageToCad}
                    workflows={imageCadSection.workflows}
                    loading={imageCadSection.loading}
                    currentPage={imageCadSection.page}
                    totalPages={imageCadSection.totalPages}
                    columns={3}
                    indexOffset={(imageCadPage - 1) * PER_PAGE}
                    onPageChange={setImageCadPage}
                    onWorkflowClick={() => {}}
                  />
                )}
              </ScissorGLBGrid>
            </CADRuntimeErrorBoundary>

          </>
        )}
      </div>
    </div>
    </>
  );
}
