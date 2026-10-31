/**
 * cad-to-catalog-api.ts
 *
 * Request and result shaping for Product Shot from CAD. Pure functions only;
 * starting and polling live in cad-to-catalog-run.ts.
 *
 * Workflows (FormaNova CAD to Catalog toolkit, RareSense/FormaNova_cad_to_catalog):
 *   cad_to_catalog_shot      one picture the browser drew: kind "photo" goes through
 *                            place_in_scene (AI places it in the background photo),
 *                            kind "white" through save_pictures (kept as it is).
 *                            Each kind skips the other step and is charged per picture.
 *   cad_to_catalog_fastload  a heavy .3dm split into a skeleton + its exact meshes
 *
 * Pictures and files go inline as data: URLs; the backend stores them on receipt.
 */
import { readArtifact, type ArtifactRef } from '@/lib/ring-cad-nurbs-api';

export const CATALOG_SHOT_WORKFLOW = 'cad_to_catalog_shot';
export const CATALOG_FASTLOAD_WORKFLOW = 'cad_to_catalog_fastload';

export const CATALOG_ASPECTS = ['1:1', '4:5', '3:4', '2:3', '9:16', '5:4', '4:3', '3:2', '16:9'] as const;
export type CatalogAspect = (typeof CATALOG_ASPECTS)[number];
/** Size of the AI photo pictures (long edge about 1024, 2048 or 4096 px), as in the studio. */
export const CATALOG_RESOLUTIONS = ['1K', '2K', '4K'] as const;
export type CatalogResolution = (typeof CATALOG_RESOLUTIONS)[number];
/** Long side, px, of a picture the browser draws at each resolution. */
export const CATALOG_PICTURE_PX: Record<CatalogResolution, number> = { '1K': 1024, '2K': 2048, '4K': 4096 };

/**
 * Credits per picture, white or photo, shown until the backend's price list answers (and
 * used if it can't). The backend's billing policy for cad_to_catalog_shot is what is charged.
 */
export const CATALOG_FALLBACK_PRICES: Record<CatalogResolution, number> = { '1K': 24, '2K': 36, '4K': 48 };

/** Credits a shoot costs: every picture, photo or white / transparent, at one price. */
export function shootCredits(counts: { photos: number; drawn: number }, price: number): number {
  return (counts.photos + counts.drawn) * price;
}

/**
 * A picture's price from cad_to_catalog_shot's billing policy (GET /credits/policy/<workflow>):
 * the rule for that resolution. null when the policy has none.
 */
export function priceFromPolicy(data: unknown, resolution: CatalogResolution): number | null {
  const rules = (data as { policy?: { conditional_pricing_rules?: unknown } } | null)?.policy?.conditional_pricing_rules;
  if (!Array.isArray(rules)) return null;
  const rule = rules.find((r) => (r as { when?: { resolution?: string } })?.when?.resolution?.toUpperCase() === resolution);
  const cost = (rule as { cost?: unknown } | undefined)?.cost;
  return typeof cost === 'number' && cost > 0 ? cost : null;
}

export const PLACE_POLL_INTERVAL_MS = 3000;
export const PLACE_POLL_TIMEOUT_MS = 26 * 60 * 1000; // the tool allows 25 minutes (4K takes longest)
export const SAVE_POLL_INTERVAL_MS = 2000;
export const SAVE_POLL_TIMEOUT_MS = 3 * 60 * 1000;
export const FASTLOAD_POLL_TIMEOUT_MS = 11 * 60 * 1000; // the tool allows 10 minutes (meshing a big Rhino file takes ~5)
export const MAX_SAVE_PICTURES = 64;

export class CatalogRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogRequestError';
  }
}

export interface StartBody {
  payload: Record<string, unknown>;
  /** Nodes whose output the run result carries; without it only the last node's (skipped `save` on a photo run). */
  return_nodes?: string[];
}

export interface PlaceParams {
  /** The piece alone on a transparent background (PNG data: URL). */
  render: string;
  /** The background photo (data: URL). */
  background: string;
  /** "band: Yellow Gold; round x14: Diamond". */
  materials: string;
  aspect: CatalogAspect;
  resolution: CatalogResolution;
}

export function buildPlaceBody({ render, background, materials, aspect, resolution }: PlaceParams): StartBody {
  if (!render.startsWith('data:image/png')) throw new CatalogRequestError('The render must be a transparent PNG');
  if (!background.startsWith('data:image/')) throw new CatalogRequestError('Choose a background photo');
  if (!CATALOG_ASPECTS.includes(aspect)) throw new CatalogRequestError(`Unknown picture shape ${aspect}`);
  if (!CATALOG_RESOLUTIONS.includes(resolution)) throw new CatalogRequestError(`Unknown resolution ${resolution}`);
  return { payload: { kind: 'photo', render_image: render, background_image: background, materials: materials.slice(0, 600), aspect, resolution, model: 'gemini' }, return_nodes: ['place'] };
}

export interface SavedPicture {
  name: string;
  angle: string;
  metal: string | null;
  /** PNG data: URL. */
  image: string;
}

/** resolution prices the run (each drawn picture is kept, and charged, at its size). */
export function buildSaveBody(piece: string, category: string, pictures: SavedPicture[], resolution?: CatalogResolution): StartBody {
  if (!pictures.length) throw new CatalogRequestError('No pictures to keep');
  if (pictures.length > MAX_SAVE_PICTURES) throw new CatalogRequestError(`At most ${MAX_SAVE_PICTURES} pictures per piece`);
  if (resolution && !CATALOG_RESOLUTIONS.includes(resolution)) throw new CatalogRequestError(`Unknown resolution ${resolution}`);
  return {
    payload: {
      kind: 'white',
      piece: piece.slice(0, 200),
      category,
      pictures: pictures.map((p) => ({ name: p.name.slice(0, 120), angle: p.angle || null, metal: p.metal, image: p.image })),
      ...(resolution ? { resolution } : {}),
    },
  };
}

/** cad_file as a data: URL (fastload and rhino_mesh). */
export function buildCadFileBody(dataUrl: string): StartBody {
  if (!dataUrl.startsWith('data:')) throw new CatalogRequestError('The CAD file could not be read');
  return { payload: { cad_file: dataUrl } };
}

/** The tool's own result object, wherever the run result nests it (flat, or under its node). */
export function findResult(data: unknown, key: string, depth = 0): Record<string, unknown> | null {
  if (!data || typeof data !== 'object' || depth > 6) return null;
  const node = data as Record<string, unknown>;
  if (key in node) return node;
  for (const value of Object.values(node)) {
    const child = Array.isArray(value) ? value[0] : value;
    const found = findResult(child, key, depth + 1);
    if (found) return found;
  }
  return null;
}

export interface CatalogFailure {
  userMessage: string;
  retryable: boolean;
}

const GENERIC_FAILURE = "We couldn't finish that. Please try again.";

export function parseFailure(data: unknown): CatalogFailure {
  const node = findResult(data, 'user_message') ?? {};
  const msg = typeof node.user_message === 'string' && node.user_message.trim() ? node.user_message.trim() : GENERIC_FAILURE;
  return { userMessage: msg, retryable: node.retryable === true };
}

const failed = (data: unknown) => {
  const node = findResult(data, 'status');
  return node?.ok === false || (typeof node?.status === 'string' && node.status.toLowerCase() === 'failed');
};

/** The placed photo, or null when the run did not produce one. */
export function parsePlaceResult(data: unknown): ArtifactRef | null {
  if (failed(data)) return null;
  const node = findResult(data, 'ai_image') ?? findResult(data, 'image');
  return readArtifact(node?.image);
}

export interface SavedResult {
  name: string;
  file: ArtifactRef;
}

export function parseSaveResult(data: unknown): SavedResult[] | null {
  if (failed(data)) return null;
  const node = findResult(data, 'images');
  if (!Array.isArray(node?.images)) return null;
  const out: SavedResult[] = [];
  for (const item of node.images as Record<string, unknown>[]) {
    const file = readArtifact(item?.file);
    if (file && typeof item.name === 'string') out.push({ name: item.name, file });
  }
  return out.length ? out : null;
}

export interface FastloadResult {
  skeleton: ArtifactRef;
  meshes: ArtifactRef;
}

export function parseFastloadResult(data: unknown): FastloadResult | null {
  if (failed(data)) return null;
  const node = findResult(data, 'skeleton_3dm');
  const skeleton = readArtifact(node?.skeleton_3dm);
  const meshes = readArtifact(node?.meshes);
  return skeleton && meshes ? { skeleton, meshes } : null;
}

