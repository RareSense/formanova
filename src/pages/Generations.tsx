import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
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
  getAssetWorkflowId,
  getArtifactKey,
  getAssetArtifactKeys,
  buildOrderedCadAssetNameMap,
  type CachePayload,
} from '@/lib/generation-history-utils';
import { WorkflowSection, SectionIcons } from '@/components/generations/WorkflowSection';
import { isImageToCadEnabled } from '@/lib/feature-flags';
import { ScissorGLBGrid } from '@/components/generations/ScissorGLBGrid';
import CADRuntimeErrorBoundary from '@/components/cad/CADRuntimeErrorBoundary';

const PER_PAGE = 5;

type SourceType = 'photo' | 'product_shot' | 'cad_render' | 'cad_text' | 'cad_sketch';

interface SectionState {
  workflows: WorkflowSummary[];
  page: number;
  totalPages: number;
  loading: boolean;
}

// ── Component ────────────────────────────────────────────────────────

export default function Generations() {
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const [allWorkflows, setAllWorkflows] = useState<WorkflowSummary[]>([]);
  const [globalLoading, setGlobalLoading] = useState(true);

  const [photoPage, setPhotoPage] = useState(1);
  const [productShotPage, setProductShotPage] = useState(1);
  const [cadRenderPage, setCadRenderPage] = useState(1);
  const [cadTextPage, setCadTextPage] = useState(1);
  const [cadSketchPage, setCadSketchPage] = useState(1);

  // Track enriched IDs + their data for sessionStorage persistence
  const enrichedRef = useRef<Record<string, Partial<WorkflowSummary>>>({});
  const generatedAssetNamesRef = useRef<{
    byAssetId: Record<string, string>;
    byWorkflowId: Record<string, string>;
    byArtifactKey: Record<string, string>;
    byOrderedCadWorkflowId: Record<string, string>;
  }>({ byAssetId: {}, byWorkflowId: {}, byArtifactKey: {}, byOrderedCadWorkflowId: {} });

  const resolveGeneratedAssetName = useCallback((workflow: WorkflowSummary): string | null => {
    const maps = generatedAssetNamesRef.current;
    const artifactKey = getArtifactKey(workflow.glb_url);
    return (
      workflow.output_asset_name ||
      (workflow.output_asset_id ? maps.byAssetId[workflow.output_asset_id] : undefined) ||
      maps.byWorkflowId[workflow.workflow_id] ||
      (artifactKey ? maps.byArtifactKey[artifactKey] : undefined) ||
      maps.byOrderedCadWorkflowId[workflow.workflow_id] ||
      null
    );
  }, []);

  // ── Step 1: Fetch workflow list — use cache for instant load ──────
  useEffect(() => {
    if (!user) return;

    // Try cache first for instant render
    const cached = loadCache();
    if (cached) {
      const normalizedEnriched = Object.fromEntries(
        Object.entries(cached.enriched).filter(([workflowId, data]) => {
          const workflow = cached.workflows.find((w) => w.workflow_id === workflowId);
          return !(workflow?.source_type === 'product_shot' && data.thumbnail_url === '');
        }),
      );
      // Apply cached enrichment data on top of workflow list
      const hydrated = cached.workflows.map(w => {
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
        const workflows = rawWorkflows.filter(w => w.source_type !== 'unknown');
        if (import.meta.env.DEV) console.log('[Generations] fetched:', rawWorkflows.length, '→ valid:', workflows.length);

        // Build generated asset name maps. Some older workflow rows do not expose
        // output_asset_id, so also match by metadata.workflow_id when available.
        const assetNameMap: Record<string, string> = {};
        const workflowAssetNameMap: Record<string, string> = {};
        const artifactAssetNameMap: Record<string, string> = {};
        let orderedCadWorkflowNameMap: Record<string, string> = {};
        try {
          const [photos, cads] = await Promise.all([
            fetchUserAssets('generated_photo', 0, 100),
            fetchUserAssets('generated_cad', 0, 100),
          ]);
          orderedCadWorkflowNameMap = buildOrderedCadAssetNameMap(workflows, cads.items);
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
          byOrderedCadWorkflowId: orderedCadWorkflowNameMap,
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
  }, [resolveGeneratedAssetName, user]);

  // ── Pagination helper ─────────────────────────────────────────────
    const getSection = useCallback(
    (source: SourceType, page: number, requireImage = false): SectionState => {
      const isCadSource = source === 'cad_text' || source === 'cad_sketch';
      const statusOk = isCadSource
        ? (w: WorkflowSummary) => w.status === 'completed' || w.status === 'failed'
        : (w: WorkflowSummary) => w.status === 'completed';
      const filtered = allWorkflows.filter((w) => {
        if (w.source_type !== source || !statusOk(w)) return false;
        // Skip photo/product_shot/cad_render cards that enriched but have no thumbnail
        if (requireImage && w.thumbnail_url === '') return false;
        // Skip cad_text/cad_sketch cards that finished enriching but have no GLB
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
           (w.status === 'completed' || (w.source_type === 'cad_text' && w.status === 'failed'))
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
            if (wf.source_type === 'cad_text' || wf.source_type === 'cad_sketch') {
              const details = await getWorkflowDetails(wf.workflow_id);
              const stepData = extractCadTextData(details.steps ?? []);
              if (!cancelled) applyEnrichment(wf.workflow_id, stepData);

              if (!stepData.glb_url) {
                const cadResult = await withTimeout(fetchCadResult(wf.workflow_id), 5000);
                if (!cancelled && cadResult?.glb_url) {
                  applyEnrichment(wf.workflow_id, { ...stepData, glb_url: cadResult.glb_url });
                }
              }
              return;
            }
            if (wf.source_type === 'product_shot') {
              const details = await getWorkflowDetails(wf.workflow_id);
              const thumbnail_url = extractProductShotThumbnail(details.steps ?? []);
              if (thumbnail_url) preloadImage(thumbnail_url);
              if (!cancelled) applyEnrichment(wf.workflow_id, { thumbnail_url: thumbnail_url ?? '' });
              return;
            }
            const details = await getWorkflowDetails(wf.workflow_id);
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
           (w.status === 'completed' || w.status === 'failed')
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
            const credits = await fetchWorkflowCreditAudit(wf.workflow_id);
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
  const cadRenderSection = getSection('cad_render', cadRenderPage, true);
  const cadTextSection = getSection('cad_text', cadTextPage);
  const imageToCadEnabled = isImageToCadEnabled(user?.email);
  const cadSketchSection = imageToCadEnabled ? getSection('cad_sketch', cadSketchPage) : null;

  return (
    <>
      <Helmet>
        <title>My Generations | FormaNova</title>
        <meta name="description" content="View and manage your AI-generated jewelry photoshoots and CAD models. Download, share, or revisit past creations." />
        <link rel="canonical" href="/generations" />
      </Helmet>
    <div className="min-h-[calc(100vh-5rem)] bg-background py-6 px-6 md:px-12 lg:px-16">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8 flex items-end justify-between"
        >
          <div>
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 font-mono text-[9px] tracking-[0.3em] text-muted-foreground uppercase hover:text-foreground transition-colors mb-2"
            >
              <ArrowLeft className="h-3 w-3" />
              Dashboard
            </Link>
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
            />

            <CADRuntimeErrorBoundary
              title="CAD Previews Unavailable"
              description="The 3D preview grid hit a rendering problem. Your generation history is still available."
              resetKeys={[cadTextPage, cadSketchPage]}
            >
              <ScissorGLBGrid>
                <WorkflowSection
                  title="Text to CAD"
                  subtitle="AI-generated 3D models from text"
                  icon={SectionIcons.cadText}
                  workflows={cadTextSection.workflows}
                  loading={cadTextSection.loading}
                  currentPage={cadTextSection.page}
                  totalPages={cadTextSection.totalPages}
                  columns={3}
                  indexOffset={(cadTextPage - 1) * PER_PAGE}
                  onPageChange={setCadTextPage}
                  onWorkflowClick={() => {}}
                />
                {cadSketchSection && (
                  <WorkflowSection
                    title="Image to CAD"
                    subtitle="3D models generated from photos and sketches"
                    icon={SectionIcons.cadSketch}
                    workflows={cadSketchSection.workflows}
                    loading={cadSketchSection.loading}
                    currentPage={cadSketchSection.page}
                    totalPages={cadSketchSection.totalPages}
                    columns={3}
                    indexOffset={(cadSketchPage - 1) * PER_PAGE}
                    onPageChange={setCadSketchPage}
                    onWorkflowClick={() => {}}
                  />
                )}
              </ScissorGLBGrid>
            </CADRuntimeErrorBoundary>

          </>
        )}
      </div>
    </div>
  );
}
