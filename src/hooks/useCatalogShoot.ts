/**
 * useCatalogShoot
 *
 * Drives Catalog from CAD: the pieces (CAD files), opening one in the viewer,
 * and shooting many in a row. Every piece is opened in the view while it is
 * shot and every picture appears as it is made; nothing happens out of sight.
 *
 * - White / transparent pictures are drawn by the viewer in this browser.
 * - A photo background: the piece is drawn transparent and placed by the
 *   cad_to_catalog_place_v1 workflow (up to PLACE_AT_ONCE at once, paid).
 * - When a piece is drawn, its pictures are kept with a cad_to_catalog_save_v1
 *   run, so every shoot is in Generations.
 * Owns the paid-feature rules (AI_RULES 6): one credit preflight for all the
 * placements of a shoot, cancellation of every run on unmount, a credit refresh
 * when placements settle. Queue rules live in lib/cad-to-catalog-queue.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useCreditPreflight } from '@/hooks/use-credit-preflight';
import { useCredits } from '@/contexts/CreditsContext';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { CATALOG_PLACE_WORKFLOW, type CatalogAspect } from '@/lib/cad-to-catalog-api';
import { blobToDataUrl, fastloadFile, placeOnBackground, rhinoMeshFile, savePictures } from '@/lib/cad-to-catalog-run';
import {
  guessCategory, initialQueue, isPhoto, nextPiece, queueReducer,
  type JewelryCategory, type Picture, type PlannedAngle, type QueueState, type ShootSettings,
} from '@/lib/cad-to-catalog-queue';
import { anglesFor } from '@/lib/cad-to-catalog-angles';
import { buildZip } from '@/lib/cad-to-catalog-zip';
import type { CatalogEngine } from '@/components/cad-to-catalog/engine/engine';
import { unpackMeshes } from '@/components/cad-to-catalog/engine/fastpack';
import { metalByName } from '@/components/cad-to-catalog/engine/materials';
import { piecesFromEntries, type FileEntry } from '@/components/cad-to-catalog/engine/package';
import type { Choice } from '@/components/cad-to-catalog/engine/materials';

/** Photo shots sit a little further back, so the AI has room for the scene (as the tool). */
const IN_PHOTO_DISTANCE = 1.6;
const PLACE_AT_ONCE = 4;
const RHINO_MESH_ON = import.meta.env.VITE_CAD_TO_CATALOG_RHINO_MESH === 'true';

interface PieceFiles {
  cad: FileEntry;
  files: Map<string, File>;
}

interface Placement {
  picture: Picture;
  render: string;
  background: string;
  materials: string;
  aspect: CatalogAspect;
}

export interface UseCatalogShoot {
  queue: QueueState;
  /** The piece open in the viewer. */
  openId: string | null;
  opening: boolean;
  /** Adds the CAD files among these; returns the ids of the pieces that are new. */
  addFiles: (entries: FileEntry[]) => string[];
  openPiece: (id: string, opts?: { showHidden?: boolean }) => Promise<void>;
  remove: (id: string) => void;
  setCategory: (id: string, c: JewelryCategory) => void;
  /** backgroundData(id) gives a photo background as a data: URL. */
  /** anglesOf(type) gives the angles to shoot that jewellery type from. */
  shoot: (pieceIds: string[], settings: ShootSettings, backgroundData: (id: string) => Promise<string>, anglesOf?: (c: JewelryCategory) => PlannedAngle[]) => Promise<boolean>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  /** Shoots a piece again with the last shoot's settings. */
  retry: (id: string) => void;
  downloadAll: () => Promise<{ zip: Blob; count: number }>;
}

const pieceId = (e: FileEntry) => `${e.path}|${e.file.size}|${e.file.lastModified}`;

export function useCatalogShoot(engine: CatalogEngine | null, onNotice: (message: string, error?: boolean) => void): UseCatalogShoot {
  const { checkCredits } = useCreditPreflight();
  const { refreshCredits } = useCredits();
  const [queue, dispatch] = useReducer(queueReducer, initialQueue);
  const [openId, setOpenId] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const files = useRef(new Map<string, PieceFiles>());
  const choices = useRef(new Map<string, Record<string, Choice | null>>()); // each piece's own edits
  const openRef = useRef<string | null>(null);
  const control = useRef({ paused: false, stopped: false });
  const life = useRef(new AbortController()); // aborted on unmount: every run stops
  const placeQueue = useRef<Placement[]>([]);
  const placing = useRef(0);
  const urls = useRef(new Set<string>());
  const lastShoot = useRef<{ settings: ShootSettings; backgroundData: (id: string) => Promise<string>; anglesOf: (c: JewelryCategory) => PlannedAngle[] } | null>(null);
  const noticeRef = useRef(onNotice);
  noticeRef.current = onNotice;

  useEffect(() => {
    const ctrl = life.current;
    const made = urls.current;
    return () => {
      ctrl.abort();
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const keepUrl = (blob: Blob) => {
    const u = URL.createObjectURL(blob);
    urls.current.add(u);
    return u;
  };

  const addFiles = useCallback((entries: FileEntry[]) => {
    const pieces = piecesFromEntries(entries).map(({ cad, files: f }) => {
      const id = pieceId(cad);
      files.current.set(id, { cad, files: f });
      return { id, name: cad.file.name, category: guessCategory(cad.file.name) };
    });
    const known = new Set(queueRef.current.pieces.map((p) => p.id));
    dispatch({ type: 'add', pieces });
    return pieces.map((p) => p.id).filter((id) => !known.has(id));
  }, []);

  const open = useCallback(async (id: string, showHidden = false) => {
    if (!engine) throw new Error('The viewer is not ready');
    const pf = files.current.get(id);
    if (!pf) throw new Error('That file is no longer here');
    if (openRef.current && openRef.current !== id && engine.hasModel) choices.current.set(openRef.current, engine.choices());
    setOpening(true);
    try {
      await engine.open(pf.cad.file, pf.files, {
        showHidden,
        fastload: async (data) => {
          const { skeleton, packed } = await fastloadFile(data, life.current.signal);
          return { skeleton, meshes: unpackMeshes(packed) };
        },
        rhinoMesh: RHINO_MESH_ON ? (data) => rhinoMeshFile(data, life.current.signal) : null,
      });
      const own = choices.current.get(id);
      if (own) engine.restoreChoices(own);
      openRef.current = id;
      setOpenId(id);
    } finally {
      setOpening(false);
    }
  }, [engine]);

  const openPiece = useCallback(async (id: string, opts: { showHidden?: boolean } = {}) => {
    if (queueRef.current.running) return;
    try {
      await open(id, opts.showHidden);
    } catch (e) {
      noticeRef.current(`Could not open the file: ${(e as Error).message}`, true);
    }
  }, [open]);

  // Placements run in the background, a few at a time; each fills its tile when it lands.
  const pump = useCallback(() => {
    while (placing.current < PLACE_AT_ONCE && placeQueue.current.length) {
      const job = placeQueue.current.shift()!;
      placing.current++;
      dispatch({ type: 'picture', pictureId: job.picture.id, status: 'placing' });
      placeOnBackground({ render: job.render, background: job.background, materials: job.materials, aspect: job.aspect }, life.current.signal)
        .then(async (res) => {
          if (!res) return;
          const r = await authenticatedFetch(res.image.url, { signal: life.current.signal });
          if (!r.ok) throw new Error(`Couldn't download the photo (${r.status})`);
          dispatch({ type: 'picture', pictureId: job.picture.id, status: 'done', url: keepUrl(await r.blob()) });
        })
        .catch((e) => {
          if (!life.current.signal.aborted) dispatch({ type: 'picture', pictureId: job.picture.id, status: 'failed', error: (e as Error).message });
        })
        .finally(() => {
          placing.current--;
          if (life.current.signal.aborted) return;
          if (!placing.current && !placeQueue.current.length) refreshCredits().catch(() => {});
          pump();
        });
    }
  }, [refreshCredits]);

  const waitWhilePaused = async () => {
    while (control.current.paused && !control.current.stopped && !life.current.signal.aborted) await new Promise((r) => setTimeout(r, 250));
  };

  // Shoots one piece: open it (visible), draw every picture, queue its placements, keep its drawn pictures.
  const shootPiece = useCallback(async (id: string, settings: ShootSettings, backgroundData: (bg: string) => Promise<string>) => {
    const piece = queueRef.current.pieces.find((p) => p.id === id)!;
    dispatch({ type: 'piece', pieceId: id, status: 'opening' });
    try {
      if (openRef.current !== id || !engine!.hasModel) await open(id);
    } catch (e) {
      dispatch({ type: 'piece', pieceId: id, status: 'failed', error: (e as Error).message });
      return;
    }
    dispatch({ type: 'piece', pieceId: id, status: 'shooting' });
    const materials = engine!.materialsText();
    const drawn: { picture: Picture; blob: Blob }[] = [];
    const pics = queueRef.current.pictures.filter((x) => x.pieceId === id && x.status === 'waiting');
    const metals = [...new Set(pics.map((p) => p.metal))];
    for (const metal of metals) {
      if (control.current.stopped) break;
      const metalId = metal ? metalByName(metal)?.id ?? null : null;
      await engine!.withMetal(metalId, async () => {
        for (const pic of pics.filter((p) => p.metal === metal)) {
          await waitWhilePaused();
          if (control.current.stopped || life.current.signal.aborted) return;
          dispatch({ type: 'picture', pictureId: pic.id, status: 'drawing' });
          await new Promise((r) => requestAnimationFrame(() => r(null))); // let the tile show "drawing" first
          const photo = isPhoto(pic.background);
          engine!.applyAngle(photo ? { ...pic.angle, dist: (pic.angle.dist || 1) * IN_PHOTO_DISTANCE } : pic.angle);
          try {
            const blob = await engine!.capture({ background: pic.background === 'white' ? 'white' : 'clear' });
            if (photo) {
              placeQueue.current.push({ picture: pic, render: await blobToDataUrl(blob), background: await backgroundData(pic.background), materials, aspect: settings.aspect as CatalogAspect });
              pump();
            } else {
              dispatch({ type: 'picture', pictureId: pic.id, status: 'done', url: keepUrl(blob) });
              drawn.push({ picture: pic, blob });
            }
          } catch (e) {
            dispatch({ type: 'picture', pictureId: pic.id, status: 'failed', error: (e as Error).message });
          }
        }
      });
    }
    dispatch({ type: 'piece', pieceId: id, status: control.current.stopped ? 'stopped' : 'done' });
    if (drawn.length) {
      // Kept in the background; the pictures are already on the page.
      Promise.all(drawn.map(async ({ picture, blob }) => ({ name: picture.name, angle: picture.angle.name, metal: picture.metal, image: await blobToDataUrl(blob) })))
        .then((list) => savePictures(piece.name, piece.category, list, life.current.signal))
        .catch((e) => {
          if (!life.current.signal.aborted) noticeRef.current(`${piece.name}: pictures are on this page but could not be kept in Generations (${(e as Error).message})`, true);
        });
    }
  }, [engine, open, pump]);

  const shoot = useCallback(async (pieceIds: string[], settings: ShootSettings, backgroundData: (id: string) => Promise<string>, anglesOf: (c: JewelryCategory) => PlannedAngle[] = anglesFor) => {
    if (!engine || queueRef.current.running || !pieceIds.length) return false;
    const perPiece = (anglesCount: number) => Math.max(1, settings.metals.length) * anglesCount;
    const placements = pieceIds.reduce((n, id) => {
      const p = queueRef.current.pieces.find((x) => x.id === id);
      return n + (p ? perPiece(anglesOf(p.category).length) * settings.backgrounds.filter(isPhoto).length : 0);
    }, 0);
    if (placements > 0 && !(await checkCredits(CATALOG_PLACE_WORKFLOW, placements))) return false;
    if (engine.hasModel && openRef.current) choices.current.set(openRef.current, engine.choices());
    lastShoot.current = { settings, backgroundData, anglesOf };
    control.current = { paused: false, stopped: false };
    dispatch({ type: 'start', pieceIds, settings, anglesFor: anglesOf });
    // The reducer runs before the next render; read the planned queue from it directly.
    queueRef.current = queueReducer(queueRef.current, { type: 'start', pieceIds, settings, anglesFor: anglesOf });
    try {
      for (let next = nextPiece(queueRef.current); next && !control.current.stopped && !life.current.signal.aborted; next = nextPiece(queueRef.current)) {
        await shootPiece(next.id, settings, backgroundData);
        queueRef.current = { ...queueRef.current, pieces: queueRef.current.pieces.map((p) => (p.id === next!.id && p.status === 'waiting' ? { ...p, status: 'done' } : p)) };
        await new Promise((r) => setTimeout(r, 0)); // let React apply this piece's updates before reading the next
      }
    } finally {
      if (!life.current.signal.aborted) dispatch({ type: 'finished' });
    }
    return true;
  }, [engine, checkCredits, shootPiece]);

  const downloadAll = useCallback(() => buildZip(queueRef.current.pieces, queueRef.current.pictures, async (p) => (await fetch(p.url!)).blob()), []);

  return {
    queue, openId, opening, addFiles, openPiece,
    remove: (id) => { files.current.delete(id); choices.current.delete(id); dispatch({ type: 'remove', pieceId: id }); },
    setCategory: (id, c) => dispatch({ type: 'category', pieceId: id, category: c }),
    shoot,
    pause: () => { control.current.paused = true; dispatch({ type: 'pause' }); },
    resume: () => { control.current.paused = false; dispatch({ type: 'resume' }); },
    stop: () => { control.current.stopped = true; control.current.paused = false; dispatch({ type: 'stop' }); },
    // Shoots that piece again with the settings of the last shoot.
    retry: (id) => { const l = lastShoot.current; if (l) void shoot([id], l.settings, l.backgroundData, l.anglesOf); },
    downloadAll,
  };
}
