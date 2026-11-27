/**
 * Bulk Studio — single-canvas production workspace (behind BULK_STUDIO_ENABLED).
 * Route: /studio/bulk/:type. The legacy wizard at /studio/:type is untouched.
 *
 * M1: header + Shot List with local photos. Upload, pairing and generation
 * arrive in M2-M4 through the existing services.
 */
import { useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { BULK_STUDIO_ENABLED } from '@/lib/feature-flags';
import { trackStudioModeSwitched } from '@/lib/posthog-events';
import { useShotList } from '@/hooks/useShotList';
import { BulkStudioHeader } from '@/components/bulk-studio/BulkStudioHeader';
import { BULK_JEWELRY_TYPES, IMAGE_ACCEPT, PrecisionDefault, ShootMode } from '@/lib/bulk-studio';
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
  const fileInput = useRef<HTMLInputElement>(null);
  const shotList = useShotList();

  if (!BULK_STUDIO_ENABLED) return <Navigate to={`/studio/${type}`} replace state={{ mode }} />;
  if (!BULK_JEWELRY_TYPES.some((t) => t.id === type)) return <Navigate to="/dashboard" replace />;

  const addFiles = (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith('image/'));
    if (files.length) shotList.addFilesAsPieces(files);
  };

  return (
    <div
      className="relative flex min-h-dvh flex-col overflow-x-clip bg-background"
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
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
        onAddJewelry={() => fileInput.current?.click()}
      />

      <main className="flex flex-1 flex-col px-4 md:px-6 py-6">
        <ShotList
          state={shotList.state}
          dispatch={shotList.dispatch}
          precisionDefault={precision}
          mode={mode}
          onAddFilesToRow={shotList.addFilesAsAngles}
          onSplit={shotList.splitRow}
          onAddJewelry={() => fileInput.current?.click()}
        />
      </main>

      <input
        ref={fileInput}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
      />

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center border-2 border-formanova-hero-accent bg-background/80">
          <span className="font-display text-3xl uppercase tracking-wide">Drop to add pieces</span>
        </div>
      )}
    </div>
  );
}
