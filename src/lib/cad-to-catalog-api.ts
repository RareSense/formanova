/**
 * cad-to-catalog-api.ts
 *
 * Request and result shaping for Catalog from CAD. Pure functions only;
 * starting and polling live in cad-to-catalog-run.ts.
 *
 * Workflows (one tool each, FormaNova CAD to Catalog toolkit,
 * RareSense/cad-to-pictures-fof formanova_cad_to_catalog/):
 *   cad_to_catalog_place_v1       place_in_scene  a transparent render placed in a background photo (AI)
 *   cad_to_catalog_save_v1        save_pictures   the white pictures a browser drew of one piece, kept with the run
 *   cad_to_catalog_fastload_v1    cad_fastload    a heavy .3dm split into a skeleton + its exact meshes
 *   cad_to_catalog_rhino_mesh_v1  rhino_mesh      display meshes for surfaces saved without them
 *
 * Pictures and files go inline as data: URLs; the backend stores them on receipt.
 */
import { readArtifact, type ArtifactRef } from '@/lib/ring-cad-nurbs-api';

export const CATALOG_PLACE_WORKFLOW = 'cad_to_catalog_place_v1';
export const CATALOG_SAVE_WORKFLOW = 'cad_to_catalog_save_v1';
export const CATALOG_FASTLOAD_WORKFLOW = 'cad_to_catalog_fastload_v1';
export const CATALOG_RHINO_MESH_WORKFLOW = 'cad_to_catalog_rhino_mesh_v1';

export const CATALOG_ASPECTS = ['1:1', '4:5', '3:4', '2:3', '9:16', '5:4', '4:3', '3:2', '16:9'] as const;
export type CatalogAspect = (typeof CATALOG_ASPECTS)[number];
/** Size of the AI photo pictures (long edge about 1024, 2048 or 4096 px), as in the studio. */
export const CATALOG_RESOLUTIONS = ['1K', '2K', '4K'] as const;
export type CatalogResolution = (typeof CATALOG_RESOLUTIONS)[number];

export const PLACE_POLL_INTERVAL_MS = 3000;
export const PLACE_POLL_TIMEOUT_MS = 26 * 60 * 1000; // the tool allows 25 minutes (4K takes longest)
export const SAVE_POLL_INTERVAL_MS = 2000;
export const SAVE_POLL_TIMEOUT_MS = 3 * 60 * 1000;
export const FASTLOAD_POLL_TIMEOUT_MS = 5 * 60 * 1000;
export const MAX_SAVE_PICTURES = 64;

export class CatalogRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogRequestError';
  }
}

export interface StartBody {
  payload: Record<string, unknown>;
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
  return { payload: { render_image: render, background_image: background, materials: materials.slice(0, 600), aspect, resolution, model: 'gemini' } };
}

export interface SavedPicture {
  name: string;
  angle: string;
  metal: string | null;
  /** PNG data: URL. */
  image: string;
}

export function buildSaveBody(piece: string, category: string, pictures: SavedPicture[]): StartBody {
  if (!pictures.length) throw new CatalogRequestError('No pictures to keep');
  if (pictures.length > MAX_SAVE_PICTURES) throw new CatalogRequestError(`At most ${MAX_SAVE_PICTURES} pictures per piece`);
  return {
    payload: {
      piece: piece.slice(0, 200),
      category,
      pictures: pictures.map((p) => ({ name: p.name.slice(0, 120), angle: p.angle || null, metal: p.metal, image: p.image })),
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

export function parseRhinoMeshResult(data: unknown): ArtifactRef | null {
  if (failed(data)) return null;
  return readArtifact(findResult(data, 'meshed_count')?.cad_file);
}
