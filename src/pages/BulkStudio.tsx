/**
 * Bulk Studio — single-canvas production workspace (behind BULK_STUDIO_ENABLED).
 * Route: /studio/bulk/:type. The legacy wizard at /studio/:type is untouched.
 *
 * M1: header + Shot List. M2: Smart Intake Drawer (upload / past jewelry,
 * grouping). Photos upload at Generate time (M4), like the High Effort path,
 * so grouping can change freely without minting stale server-side sets.
 */
import { useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { BULK_STUDIO_ENABLED } from '@/lib/feature-flags';
import { trackStudioModeSwitched } from '@/lib/posthog-events';
import { useShotList } from '@/hooks/useShotList';
import { BulkStudioHeader } from '@/components/bulk-studio/BulkStudioHeader';
import { BULK_JEWELRY_TYPES, PrecisionDefault, ShootMode, isPieceDrag } from '@/lib/bulk-studio';
import { IntakeDrawer, type IntakeTab } from '@/components/bulk-studio/IntakeDrawer';
import { isLikelyImageFile, normalizeImageFiles } from '@/lib/image-normalize';
import { ShotList } from '@/components/bulk-studio/ShotList';

const PRECISION_KEY = 'formanova_bulk_precision';

function readPrecision(): PrecisionDefault {
  try { return localStorage.getItem(PRECISION_KEY) === 'multi' ? 'multi' : 'single'; } catch { return 'single'; }
}

export default function BulkStudio() {
  const { type = 'rings' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

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

  if (!BULK_STUDIO_ENABLED) return <Navigate to={`/studio/${type}`} replace state={{ mode }} />;
  if (!BULK_JEWELRY_TYPES.some((t) => t.id === type)) return <Navigate to="/dashboard" replace />;

  const jewelryLabel = BULK_JEWELRY_TYPES.find((t) => t.id === type)?.label ?? type;

  const openIntake = (tab: IntakeTab = 'upload') => { setIntakeTab(tab); setIntakeOpen(true); };

  /** Photos dropped anywhere on the canvas are staged in the intake drawer for grouping. */
  const stageDropped = async (list: FileList | null) => {
    const images = Array.from(list ?? []).filter(isLikelyImageFile);
    if (!images.length) return;
    staging.addFilesAsPieces(await normalizeImageFiles(images));
    openIntake('upload');
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

      <main className="flex flex-1 flex-col px-4 md:px-6 py-6">
        <ShotList
          state={shotList.state}
          dispatch={shotList.dispatch}
          precisionDefault={precision}
          mode={mode}
          onAddFilesToRow={shotList.addFilesAsAngles}
          onSplit={shotList.splitRow}
          onAddJewelry={() => openIntake()}
        />
      </main>

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

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center border-2 border-formanova-hero-accent bg-background/80">
          <span className="font-display text-3xl uppercase tracking-wide">Drop to add pieces</span>
        </div>
      )}
    </div>
  );
}
