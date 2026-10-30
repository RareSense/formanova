/**
 * cad-to-catalog-queue.ts
 *
 * The bulk queue of Catalog from CAD as a pure reducer: pieces (one CAD file
 * each) and the pictures planned for them. useCatalogShoot drives it; nothing
 * here touches the viewer or the network, so every rule is unit-tested.
 *
 * A picture is one angle x one metal x one background. White / transparent
 * pictures are drawn in the browser; a photo background is drawn transparent
 * and then placed by the cad_to_catalog_place_v1 workflow.
 */

export type JewelryCategory = 'ring' | 'earring' | 'pendant' | 'necklace' | 'bracelet' | 'other';
export const CATEGORIES: JewelryCategory[] = ['ring', 'earring', 'pendant', 'necklace', 'bracelet', 'other'];
export const CATEGORY_LABEL: Record<JewelryCategory, string> = {
  ring: 'Rings', earring: 'Earrings', pendant: 'Pendants', necklace: 'Necklaces', bracelet: 'Bracelets', other: 'Other',
};

/** Background of a picture: plain white, transparent, or a photo by id. */
export type BackgroundId = 'white' | 'transparent' | string;

export type PieceStatus = 'waiting' | 'opening' | 'shooting' | 'finishing' | 'done' | 'failed' | 'stopped';
export type PictureStatus = 'waiting' | 'drawing' | 'placing' | 'done' | 'failed';

export interface PlannedAngle {
  name: string;
  dir: number[];
  dist?: number;
  offset?: number[];
  focal?: number;
}

export interface Picture {
  id: string;
  pieceId: string;
  /** File-safe name, e.g. 01_Front_White_Gold_White (the tool's naming). */
  name: string;
  angle: PlannedAngle;
  metal: string | null;
  background: BackgroundId;
  status: PictureStatus;
  /** Where to show it: an object URL (drawn) or the artifact URL (placed). */
  url?: string;
  error?: string;
}

export interface Piece {
  id: string;
  name: string;
  category: JewelryCategory;
  status: PieceStatus;
  error?: string;
}

export interface ShootSettings {
  metals: string[];          // metal names; empty = the file's own colours
  backgrounds: BackgroundId[];
  aspect: string;            // only sent to the AI placement
  resolution?: string;       // only sent to the AI placement (1K / 2K / 4K)
}

export interface QueueState {
  pieces: Piece[];
  pictures: Picture[];
  running: boolean;
  paused: boolean;
}

export const initialQueue: QueueState = { pieces: [], pictures: [], running: false, paused: false };

export type QueueAction =
  | { type: 'add'; pieces: { id: string; name: string; category: JewelryCategory }[] }
  | { type: 'remove'; pieceId: string }
  | { type: 'category'; pieceId: string; category: JewelryCategory }
  | { type: 'start'; pieceIds: string[]; settings: ShootSettings; anglesFor: (c: JewelryCategory) => PlannedAngle[] }
  | { type: 'piece'; pieceId: string; status: PieceStatus; error?: string }
  | { type: 'picture'; pictureId: string; status: PictureStatus; url?: string; error?: string }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'stop' }
  | { type: 'finished' }
  | { type: 'retry'; pieceId: string };

const safe = (s: string) => s.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'x';
const bgLabel = (bg: BackgroundId) => (bg === 'white' ? 'White' : bg === 'transparent' ? 'Transparent' : bg);

/** The pictures of one piece, in shooting order: metal, then angle, then background. */
export function planPictures(piece: Piece, settings: ShootSettings, angles: PlannedAngle[]): Picture[] {
  const metals = settings.metals.length ? settings.metals : [null];
  const out: Picture[] = [];
  let n = 0;
  for (const metal of metals) {
    for (const angle of angles) {
      for (const background of settings.backgrounds) {
        n++;
        const name = [String(n).padStart(2, '0'), angle.name || `View ${n}`, metal, bgLabel(background)].filter(Boolean).map((x) => safe(String(x))).join('_');
        out.push({ id: `${piece.id}:${n}`, pieceId: piece.id, name, angle, metal, background, status: 'waiting' });
      }
    }
  }
  return out;
}

export const isPhoto = (bg: BackgroundId) => bg !== 'white' && bg !== 'transparent';

export function queueReducer(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case 'add': {
      const known = new Set(state.pieces.map((p) => p.id));
      const fresh = action.pieces.filter((p) => !known.has(p.id)).map((p) => ({ ...p, status: 'waiting' as const }));
      return { ...state, pieces: [...state.pieces, ...fresh] };
    }
    case 'remove':
      if (state.running && state.pieces.find((p) => p.id === action.pieceId)?.status !== 'waiting') return state;
      return { ...state, pieces: state.pieces.filter((p) => p.id !== action.pieceId), pictures: state.pictures.filter((x) => x.pieceId !== action.pieceId) };
    case 'category':
      return { ...state, pieces: state.pieces.map((p) => (p.id === action.pieceId ? { ...p, category: action.category } : p)) };
    case 'start': {
      if (state.running) return state;
      const ids = new Set(action.pieceIds);
      const planned = state.pieces.filter((p) => ids.has(p.id)).flatMap((p) => planPictures(p, action.settings, action.anglesFor(p.category)));
      if (!planned.length) return state;
      return {
        running: true,
        paused: false,
        pieces: state.pieces.map((p) => (ids.has(p.id) ? { ...p, status: 'waiting', error: undefined } : p)),
        // A new shoot of a piece replaces its earlier pictures in the strip.
        pictures: [...state.pictures.filter((x) => !ids.has(x.pieceId)), ...planned],
      };
    }
    case 'piece':
      return { ...state, pieces: state.pieces.map((p) => (p.id === action.pieceId ? { ...p, status: action.status, error: action.error } : p)) };
    case 'picture':
      return {
        ...state,
        pictures: state.pictures.map((x) => (x.id === action.pictureId ? { ...x, status: action.status, url: action.url ?? x.url, error: action.error } : x)),
      };
    case 'pause':
      return state.running ? { ...state, paused: true } : state;
    case 'resume':
      return { ...state, paused: false };
    case 'stop':
      return {
        ...state,
        paused: false,
        pieces: state.pieces.map((p) => (p.status === 'waiting' || p.status === 'opening' || p.status === 'shooting' ? { ...p, status: 'stopped' } : p)),
        pictures: state.pictures.filter((x) => x.status !== 'waiting' && x.status !== 'drawing'),
      };
    case 'finished':
      return { ...state, running: false, paused: false };
    case 'retry':
      if (state.running) return state;
      return {
        ...state,
        pieces: state.pieces.map((p) => (p.id === action.pieceId ? { ...p, status: 'waiting', error: undefined } : p)),
        pictures: state.pictures.map((x) => (x.pieceId === action.pieceId && x.status === 'failed' ? { ...x, status: 'waiting', error: undefined } : x)),
      };
    default:
      return state;
  }
}

/** The next piece to shoot: the first waiting one that has pictures planned. */
export function nextPiece(state: QueueState): Piece | null {
  return state.pieces.find((p) => p.status === 'waiting' && state.pictures.some((x) => x.pieceId === p.id && x.status === 'waiting')) ?? null;
}

export interface Progress {
  done: number;
  failed: number;
  total: number;
}

export function progress(state: QueueState, pieceId?: string): Progress {
  const list = pieceId ? state.pictures.filter((x) => x.pieceId === pieceId) : state.pictures;
  return {
    done: list.filter((x) => x.status === 'done').length,
    failed: list.filter((x) => x.status === 'failed').length,
    total: list.length,
  };
}

/** Rings unless the name says otherwise (Facets of Fire SKU prefixes and words). */
export function guessCategory(name: string): JewelryCategory {
  const n = name.toUpperCase();
  if (/(^|[^A-Z])(FFR|ALR|FPR)|RING|BAND|\bENG\b|SOLITAIRE/.test(n)) return 'ring';
  if (/(^|[^A-Z])(FFE|ALE)|EARRING|HOOP|HUG|STUD/.test(n)) return 'earring';
  if (/(^|[^A-Z])(FFP|ALP)|PENDANT/.test(n)) return 'pendant';
  if (/(^|[^A-Z])FFN|NECKLACE/.test(n)) return 'necklace';
  if (/(^|[^A-Z])FFB|BRAC|TENNIS|BANGLE/.test(n)) return 'bracelet';
  return 'ring';
}
