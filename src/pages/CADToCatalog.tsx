/**
 * Catalog from CAD: drop one or many CAD files, set angles / metals /
 * backgrounds once, and shoot every piece into catalog pictures. Each piece is
 * opened in the 3D view while it is shot and every picture appears as it is
 * made. The CAD to Pictures tool's experience, inside FormaNova.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CadWorkspaceLayout } from '@/components/text-to-cad/CadWorkspaceLayout';
import { CADRuntimeErrorBoundary } from '@/components/cad/CADRuntimeErrorBoundary';
import CatalogViewer from '@/components/cad-to-catalog/CatalogViewer';
import { useEngineState } from '@/components/cad-to-catalog/useEngineState';
import PartsPanel from '@/components/cad-to-catalog/PartsPanel';
import PiecesPanel from '@/components/cad-to-catalog/PiecesPanel';
import PicturesStrip from '@/components/cad-to-catalog/PicturesStrip';
import ShootSteps from '@/components/cad-to-catalog/ShootSteps';
import BackgroundLibrary, { type LibraryBackground } from '@/components/cad-to-catalog/BackgroundLibrary';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import type { CatalogEngine } from '@/components/cad-to-catalog/engine/engine';
import type { FileEntry } from '@/components/cad-to-catalog/engine/package';
import { useAuth } from '@/contexts/AuthContext';
import { useCadBreakpoint } from '@/hooks/use-cad-breakpoint';
import { useCatalogShoot } from '@/hooks/useCatalogShoot';
import { isCadToCatalogEnabled } from '@/lib/feature-flags';
import { trackCatalogShootStarted, trackDownloadClicked, trackPaywallHit } from '@/lib/posthog-events';
import { shootCredits, type CatalogAspect, type CatalogResolution } from '@/lib/cad-to-catalog-api';
import { blobToDataUrl, picturePrice } from '@/lib/cad-to-catalog-run';
import { anglesFor, hasOwnAngles, resetAngles, saveAngles } from '@/lib/cad-to-catalog-angles';
import { countShoot, isPhoto, type BackgroundId, type JewelryCategory, type Picture, type PlannedAngle } from '@/lib/cad-to-catalog-queue';


function save(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

export default function CADToCatalog() {
  const { user } = useAuth();
  const mode = useCadBreakpoint();
  const [engine, setEngine] = useState<CatalogEngine | null>(null);
  const notice = useCallback((m: string, err?: boolean) => (err ? toast.error(m) : toast(m)), []);
  const shoot = useCatalogShoot(engine, notice);
  const view = useEngineState(engine);
  const [metals, setMetals] = useState<Set<string>>(new Set());
  const [chosenBg, setChosenBg] = useState<Set<BackgroundId>>(new Set(['white']));
  // Photo backgrounds picked from the library, by id; each stays listed until unticked.
  const [photoBgs, setPhotoBgs] = useState<LibraryBackground[]>([]);
  const bgData = useRef(new Map<string, Promise<string>>()); // each photo fetched once per visit
  const [aspect, setAspect] = useState<CatalogAspect>('1:1');
  const [resolution, setResolution] = useState<CatalogResolution>('1K');
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState<Partial<Record<JewelryCategory, PlannedAngle[]>>>({});
  const [anglesVersion, setAnglesVersion] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [price, setPrice] = useState<number | null>(null);
  const [angleThumbs, setAngleThumbs] = useState<Record<string, string>>({});

  // Credits per picture (white or photo) at the chosen size: the backend's price list, else the fallback.
  useEffect(() => {
    const ctrl = new AbortController();
    setPrice(null);
    picturePrice(resolution, ctrl.signal).then(setPrice).catch(() => {});
    return () => ctrl.abort();
  }, [resolution]);

  const openPiece = shoot.queue.pieces.find((p) => p.id === shoot.openId) ?? null;
  const category = openPiece?.category ?? null;
  // anglesVersion is not read inside, so the lint rule calls it unnecessary; it is listed on
  // purpose: anglesFor() reads saved angles from storage, and a save/reset bumps anglesVersion
  // so the list re-reads them. Safe: it only makes the callback newer. Watch for: angles that
  // stay stale after "Save as default" or "Reset" if this dependency is ever dropped.
  const listFor = useCallback((c: JewelryCategory) => working[c] ?? anglesFor(c), [working, anglesVersion]); // eslint-disable-line react-hooks/exhaustive-deps -- see above
  const anglesOf = useCallback((c: JewelryCategory) => listFor(c).filter((a) => !skipped.has(a.name)), [listFor, skipped]);
  const settings = { metals: [...metals], backgrounds: [...chosenBg], aspect, resolution };
  const perPictures = (c: JewelryCategory) => anglesOf(c).length * Math.max(1, metals.size) * chosenBg.size;
  const totalPictures = shoot.queue.pieces.reduce((n, p) => n + perPictures(p.category), 0);
  const totalCredits = price !== null ? shootCredits(countShoot(shoot.queue.pieces, settings, anglesOf), price) : null;
  const perPiece = { pictures: category ? perPictures(category) : 0, photos: [...chosenBg].filter(isPhoto).length };

  // A small picture per angle of the open piece, remade when the piece, its type or its angles change.
  const angleKey = category ? `${shoot.openId}|${listFor(category).map((a) => `${a.name}:${a.dir}:${a.dist ?? 1}`).join(',')}` : '';
  useEffect(() => {
    if (!engine || !category || !view.ready || !view.parts.length || shoot.queue.running) return;
    let cancelled = false;
    const list = listFor(category);
    engine.angleThumbs(list).then((blobs) => {
      if (cancelled) return;
      const urls = blobs.map((b) => URL.createObjectURL(b));
      // Swap in the new set, then free the old one (freeing first would flash broken tiles).
      setAngleThumbs((old) => { Object.values(old).forEach((u) => URL.revokeObjectURL(u)); return Object.fromEntries(list.map((a, i) => [a.name, urls[i]])); });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [angleKey, view.ready]); // eslint-disable-line react-hooks/exhaustive-deps -- angleKey stands for engine/category/angles/the open piece; excluding the objects avoids remaking on every render. Watch for: stale tiles if an input is left out of angleKey.

  if (!isCadToCatalogEnabled(user?.email)) return <Navigate to="/dashboard" replace />;

  const addFiles = (entries: FileEntry[]) => {
    const fresh = shoot.addFiles(entries);
    if (!fresh.length) {
      if (!entries.some((e) => /\.(3dm|glb|gltf|step|stp|obj|ply|stl)$/i.test(e.file.name))) toast.error('Not a CAD file. Use 3DM, GLB, GLTF, STEP, OBJ, PLY or STL.');
      return;
    }
    if (fresh.length > 1) toast(`${fresh.length} pieces added`);
    // Open the first new piece when nothing is open yet, so the view is never empty.
    if (!shoot.openId) void shoot.openPiece(fresh[0]);
  };

  // A photo background as a data: URL for the AI placement (library images need the sign-in token).
  const backgroundData = (id: BackgroundId) => {
    const bg = photoBgs.find((b) => b.id === id);
    if (!bg) return Promise.reject(new Error('That background is no longer chosen'));
    if (!bgData.current.has(id)) {
      const load = authenticatedFetch(bg.url).then(async (res) => {
        if (!res.ok) throw new Error(`Couldn't load the background ${bg.name} (${res.status})`);
        return blobToDataUrl(await res.blob());
      });
      load.catch(() => bgData.current.delete(id)); // try again next time
      bgData.current.set(id, load);
    }
    return bgData.current.get(id)!;
  };

  // From the library: pick adds it to Background and ticks it; picking it again removes it.
  const toggleLibrary = (bg: LibraryBackground) => {
    const picked = photoBgs.some((b) => b.id === bg.id);
    setPhotoBgs((list) => (picked ? list.filter((b) => b.id !== bg.id) : [...list, bg]));
    setChosenBg((s) => { const next = new Set(s); if (picked) next.delete(bg.id); else next.add(bg.id); return next; });
  };

  const startShoot = async (ids: string[]) => {
    const pictures = ids.reduce((n, id) => n + perPictures(shoot.queue.pieces.find((p) => p.id === id)!.category), 0);
    const photos = [...chosenBg].filter(isPhoto).length;
    if (!pictures) { toast.error('Tick at least one angle and one background'); return; }
    trackCatalogShootStarted({ pieces: ids.length, pictures, photo_backgrounds: photos, metals: metals.size });
    const started = await shoot.shoot(ids, settings, backgroundData, anglesOf);
    if (!started && photos) trackPaywallHit({ category: category ?? 'ring', steps_completed: 4 });
  };

  const toggle = <T,>(set: Set<T>, v: T) => { const s = new Set(set); if (s.has(v)) s.delete(v); else s.add(v); return s; };

  const left = (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto bg-card scrollbar-thin">
      <PiecesPanel
        queue={shoot.queue}
        openId={shoot.openId}
        onFiles={addFiles}
        onOpen={(id) => shoot.openPiece(id)}
        onRemove={shoot.remove}
        onRetry={shoot.retry}
        onCategory={shoot.setCategory}
      />
      <div className="border-t border-border shrink-0">
        <ShootSteps
          category={category}
          onCategory={(c) => openPiece && shoot.setCategory(openPiece.id, c)}
          angles={category ? listFor(category) : []}
          skipped={skipped}
          onToggleAngle={(name) => setSkipped((s) => toggle(s, name))}
          angleThumbs={angleThumbs}
          onGoToAngle={(a) => engine?.applyAngle(a)}
          onAddView={() => {
            if (!engine || !category) return;
            const list = listFor(category);
            setWorking((w) => ({ ...w, [category]: [...list, { ...engine.currentAngle(), name: `View ${list.length + 1}` }] }));
          }}
          ownAngles={!!category && hasOwnAngles(category)}
          anglesChanged={!!category && !!working[category]}
          onSaveAngles={() => {
            if (!category || !working[category]) return;
            if (saveAngles(category, working[category]!)) {
              setWorking((w) => ({ ...w, [category]: undefined }));
              setAnglesVersion((v) => v + 1);
              toast('Saved as your default angles for this type');
            } else toast.error('This browser would not keep the angles');
          }}
          onResetAngles={() => {
            if (!category) return;
            resetAngles(category);
            setWorking((w) => ({ ...w, [category]: undefined }));
            setAnglesVersion((v) => v + 1);
          }}
          metals={metals}
          onToggleMetal={(m) => setMetals((s) => toggle(s, m))}
          chosenBackgrounds={chosenBg}
          onToggleBackground={(id) => setChosenBg((s) => toggle(s, id))}
          photoPicker={<BackgroundLibrary chosen={new Set(photoBgs.map((b) => b.id))} onToggle={toggleLibrary} disabled={shoot.queue.running} onError={(m) => toast.error(m)} />}
          photoCount={photoBgs.length}
          onClearPhotos={() => { setPhotoBgs([]); setChosenBg((s) => new Set([...s].filter((id) => !isPhoto(id)))); }}
          aspect={aspect}
          onAspect={setAspect}
          resolution={resolution}
          onResolution={setResolution}
          perPiece={perPiece}
          pieceCount={shoot.queue.pieces.length}
          totalPictures={totalPictures}
          totalCredits={totalCredits}
          canShoot={!!engine && view.ready && shoot.queue.pieces.length > 0 && !shoot.opening}
          running={shoot.queue.running}
          paused={shoot.queue.paused}
          onShootAll={() => startShoot(shoot.queue.pieces.map((p) => p.id))}
          onShootOpen={() => openPiece && startShoot([openPiece.id])}
          onPause={shoot.pause}
          onResume={shoot.resume}
          onStop={shoot.stop}
        />
      </div>
    </div>
  );

  const downloadAll = async () => {
    setDownloading(true);
    try {
      const { zip, count } = await shoot.downloadAll();
      save(zip, `catalog-from-cad-${new Date().toISOString().slice(0, 10)}.zip`);
      trackDownloadClicked({ context: 'catalog_from_cad', file_type: 'zip', category: category ?? undefined });
      toast(`${count} pictures downloaded`);
    } catch (e) {
      toast.error(`Could not make the zip: ${(e as Error).message}`);
    } finally {
      setDownloading(false);
    }
  };

  const downloadOne = async (p: Picture) => {
    const blob = await (await fetch(p.url!)).blob(); // a blob: URL made on this page (AI_RULES 1)
    const piece = shoot.queue.pieces.find((x) => x.id === p.pieceId)?.name.replace(/\.[^.]+$/, '') ?? 'piece';
    save(blob, `${piece}_${p.name}.${blob.type.includes('jpeg') ? 'jpg' : 'png'}`);
    trackDownloadClicked({ context: 'catalog_from_cad', file_type: blob.type, category: category ?? undefined });
  };

  return (
    <>
      <Helmet>
        <title>Product Shot from CAD | FormaNova</title>
        <meta name="description" content="Turn jewelry CAD files into product pictures: every angle, every metal, on white or in a photo, one piece or a whole collection." />
        <link rel="canonical" href="/cad-to-catalog" />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <CadWorkspaceLayout
        mode={mode}
        hasModel={view.parts.length > 0}
        isFullscreen={false}
        leftLabel="Shoot"
        left={left}
        right={(section) => <PartsPanel engine={engine} section={section} locked={shoot.queue.running} />}
        viewport={
          <CADRuntimeErrorBoundary resetKeys={[shoot.openId]}>
            <CatalogViewer onEngine={setEngine} onFiles={addFiles} busy={shoot.opening ? shoot.openingText ?? 'Opening…' : null} locked={shoot.queue.running} compact={mode === 'phone'}>
              <PicturesStrip queue={shoot.queue} onDownloadAll={downloadAll} downloading={downloading} onDownloadOne={downloadOne} />
            </CatalogViewer>
          </CADRuntimeErrorBoundary>
        }
      />
    </>
  );
}
