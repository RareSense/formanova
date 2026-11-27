/**
 * Bulk Studio — single-canvas production workspace (behind BULK_STUDIO_ENABLED).
 * Route: /studio/bulk/:type. The legacy wizard at /studio/:type is untouched.
 *
 * Header -> Shot List (pieces x models/scenes) -> bottom dock (selection bar
 * stacked above the Generate bar) -> Results (docked from xl, sheet below).
 * Photos upload at Generate time, so grouping can change freely; every run is
 * tracked by GenerationsContext, so the list stays editable while shots render.
 */
import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { BULK_STUDIO_ENABLED } from '@/lib/feature-flags';
import { trackStudioModeSwitched } from '@/lib/posthog-events';
import { TO_SINGULAR } from '@/lib/jewelry-utils';
import { useAuth } from '@/contexts/AuthContext';
import { useShotList } from '@/hooks/useShotList';
import { useBulkGenerate } from '@/hooks/useBulkGenerate';
import { useBulkPostActions } from '@/hooks/useBulkPostActions';
import { BulkStudioHeader } from '@/components/bulk-studio/BulkStudioHeader';
import { BULK_JEWELRY_TYPES, PrecisionDefault, ShootMode, isPieceDrag } from '@/lib/bulk-studio';
import { IntakeDrawer, type IntakeTab } from '@/components/bulk-studio/IntakeDrawer';
import { AssignDrawer, type AssignRequest } from '@/components/bulk-studio/AssignDrawer';
import { SelectionBar } from '@/components/bulk-studio/SelectionBar';
import { GenerateBar } from '@/components/bulk-studio/GenerateBar';
import { ResultsDock, ResultsSheet } from '@/components/bulk-studio/ResultsPanel';
import { CreditPreflightModal } from '@/components/CreditPreflightModal';
import { canMergeSelected, rowAssignees, type ShotAssignee } from '@/lib/shot-list';
import { isLikelyImageFile, normalizeImageFiles } from '@/lib/image-normalize';
import { ShotList } from '@/components/bulk-studio/ShotList';

const PRECISION_KEY = 'formanova_bulk_precision';

function readPrecision(): PrecisionDefault {
  try { return localStorage.getItem(PRECISION_KEY) === 'multi' ? 'multi' : 'single'; } catch { return 'single'; }
}

/** Height of the fixed bottom dock, so the page can pad itself and never hide rows. */
function useHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [h, setH] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setH(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, h] as const;
}

export default function BulkStudio() {
  const { type = 'rings' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const stateMode = (location.state as { mode?: ShootMode } | null)?.mode;
  const queryMode = new URLSearchParams(location.search).get('mode');
  const [mode, setMode] = useState<ShootMode>(
    stateMode ?? (queryMode === 'product-shot' ? 'product-shot' : 'model-shot'),
  );
  const [precision, setPrecision] = useState<PrecisionDefault>(readPrecision);
  const [dragging, setDragging] = useState(false);
  const shotList = useShotList();
  const staging = useShotList({ ownsBlobs: false });
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [intakeTab, setIntakeTab] = useState<IntakeTab>('upload');
  const [assignRequest, setAssignRequest] = useState<AssignRequest | null>(null);
  const [resultsOpen, setResultsOpen] = useState(false);
  const kind = mode === 'product-shot' ? 'scene' : 'model';
  const { state, dispatch } = shotList;

  const gen = useBulkGenerate({ state, dispatch, kind, category: TO_SINGULAR[type] ?? type });
  const post = useBulkPostActions({
    checkCredits: gen.preflight.checkCredits,
    addFix: gen.queue.addFix,
    markHumanReview: gen.queue.markHumanReview,
    userEmail: user?.email,
  });
  const [dockRef, dockHeight] = useHeight<HTMLDivElement>();

  if (!BULK_STUDIO_ENABLED) return <Navigate to={`/studio/${type}`} replace state={{ mode }} />;
  if (!BULK_JEWELRY_TYPES.some((t) => t.id === type)) return <Navigate to="/dashboard" replace />;

  const jewelryLabel = BULK_JEWELRY_TYPES.find((t) => t.id === type)?.label ?? type;
  const selectedCount = state.selectedIds.length;
  const { views, counts } = gen.queue;

  const openIntake = (tab: IntakeTab = 'upload') => { setIntakeTab(tab); setIntakeOpen(true); };

  /** Photos dropped anywhere on the canvas are staged in the intake drawer for grouping. */
  const stageDropped = async (list: FileList | null) => {
    const images = Array.from(list ?? []).filter(isLikelyImageFile);
    if (!images.length) return;
    staging.addFilesAsPieces(await normalizeImageFiles(images));
    openIntake('upload');
  };

  const confirmAssign = (request: AssignRequest, picked: ShotAssignee[]) => {
    if (request.mode === 'single') {
      dispatch({ type: 'replaceAssignee', rowId: request.rowId, oldId: request.oldId, assignee: picked[0] });
    } else {
      dispatch({ type: 'setAssignees', rowIds: request.rowIds, kind, assignees: picked });
    }
    setAssignRequest(null);
  };

  /** Bulk assign starts from the selection's shared pairing, or empty when rows differ. */
  const assignSelected = () => {
    const rows = state.rows.filter((r) => state.selectedIds.includes(r.id));
    const first = rows[0] ? rowAssignees(rows[0], kind) : [];
    const shared = rows.every((r) => {
      const a = rowAssignees(r, kind);
      return a.length === first.length && a.every((x, i) => x.id === first[i].id);
    });
    setAssignRequest({ mode: 'multi', rowIds: rows.map((r) => r.id), initial: shared ? first : [] });
  };

  const results = {
    views, counts,
    onFixAI: post.openFixAI,
    onFixHuman: post.openFixHuman,
    onUpscaled: (item: { id: string }, url: string) => gen.queue.setUpscaled(item.id, url),
  };

  return (
    <div
      className="relative flex min-h-dvh flex-col overflow-x-clip bg-background"
      onDragOver={(e) => { if (isPieceDrag(e) || intakeOpen) return; e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={(e) => {
        setDragging(false);
        if (isPieceDrag(e) || intakeOpen) return;
        e.preventDefault();
        void stageDropped(e.dataTransfer.files);
      }}
    >
      <BulkStudioHeader
        jewelryType={type}
        onJewelryTypeChange={(id) => navigate(`/studio/bulk/${id}`, { replace: true, state: { mode } })}
        mode={mode}
        onModeChange={(m) => { trackStudioModeSwitched(m); setMode(m); }}
        precision={precision}
        onPrecisionChange={(p) => {
          setPrecision(p);
          try { localStorage.setItem(PRECISION_KEY, p); } catch { /* storage unavailable */ }
        }}
        onAddJewelry={() => openIntake()}
      />

      <div className="flex flex-1 items-start">
        <main className="flex min-w-0 flex-1 flex-col self-stretch px-4 md:px-6 pt-6" style={{ paddingBottom: dockHeight + 24 }}>
          <ShotList
            state={state}
            dispatch={dispatch}
            precisionDefault={precision}
            kind={kind}
            onAssign={setAssignRequest}
            onAddFilesToRow={shotList.addFilesAsAngles}
            onSplit={shotList.splitRow}
            onAddJewelry={() => openIntake()}
          />
        </main>
        <ResultsDock {...results} />
      </div>

      {/* Bottom dock: selection bar stacked above the Generate bar — they never overlap. */}
      <div ref={dockRef} className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col xl:right-[420px] 2xl:right-[520px]">
        <SelectionBar
          count={selectedCount}
          kind={kind}
          canMerge={canMergeSelected(state)}
          onAssign={assignSelected}
          onMerge={() => dispatch({ type: 'mergeSelected' })}
          onRemove={() => dispatch({ type: 'removeSelected' })}
          onClear={() => dispatch({ type: 'clearSelection' })}
        />
        {state.rows.length > 0 && (
          <GenerateBar
            aspectRatio={gen.output.aspectRatio}
            onAspectRatio={gen.setAspectRatio}
            resolution={gen.output.resolution}
            onResolution={gen.setResolution}
            cost={gen.cost}
            costLoading={gen.costLoading}
            cta={gen.labels.cta}
            hint={gen.labels.hint}
            canGenerate={gen.plan.shots.length > 0}
            submitting={gen.submitting}
            onGenerate={() => void gen.generate()}
            results={{ active: counts.active, total: counts.total, onOpen: () => setResultsOpen(true) }}
          />
        )}
      </div>

      <ResultsSheet open={resultsOpen} onOpenChange={setResultsOpen} {...results} />

      <IntakeDrawer
        open={intakeOpen}
        onOpenChange={setIntakeOpen}
        tab={intakeTab}
        onTabChange={setIntakeTab}
        staging={staging}
        jewelryType={type}
        jewelryLabel={jewelryLabel}
        onAddPieces={shotList.addPieces}
      />

      <AssignDrawer
        request={assignRequest}
        kind={kind}
        jewelryType={type}
        onClose={() => setAssignRequest(null)}
        onConfirm={confirmAssign}
      />

      {post.modals}

      {gen.preflight.showInsufficientModal && gen.preflight.preflightResult && (
        <CreditPreflightModal
          open
          onOpenChange={(o) => { if (!o) gen.preflight.dismissModal(); }}
          estimatedCredits={gen.preflight.preflightResult.estimatedCredits}
          currentBalance={gen.preflight.preflightResult.currentBalance}
        />
      )}

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center border-2 border-formanova-hero-accent bg-background/80">
          <span className="font-display text-3xl uppercase tracking-wide">Drop to add pieces</span>
        </div>
      )}
    </div>
  );
}
