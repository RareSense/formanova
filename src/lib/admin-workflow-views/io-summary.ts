/**
 * The "Inputs -> Outputs" strip at the top of the admin detail page: every picture, 3D file
 * (GLB / glTF, 3DM, STL) and other stored file in the request payload, and in the final
 * outputs (the last successful step's output plus the /api/result files). Built only from the
 * walker's nodes and url-safety's rules; prompts, settings, steps and raw JSON stay in the
 * collapsed sections below. Pure functions only.
 *
 * Order: inputs keep payload order (the family's order puts the primary picture first);
 * outputs put the final deliverable first: pictures, then GLB, 3DM, STL, then other files.
 * Nothing here loads WebGL: a 3D tile opens its viewer on click, and a file over
 * LARGE_FILE_BYTES asks once more inside the viewer before it is fetched.
 */
import type { RunView } from './index';
import { classifyUrl, extOf, isTrustedImageSrc } from './url-safety';
import { findNodes, type ViewNode } from './walker';

export type IoKind = 'image' | 'model3d' | 'file';
export type IoFormat = 'glb' | 'gltf' | '3dm' | 'stl';

export interface IoItem {
  /** Unique within its group: the node path, or the result file's label. */
  key: string;
  /** The walker's label (family labels: "Model", "Reference images", "Casting body"...). */
  label: string;
  kind: IoKind;
  /** 3D: glb / gltf / 3dm / stl. Files: the extension or a short type from the mime, if known. */
  format: string | null;
  url: string;
  name: string | null;
  bytes: number | null;
  /** May the browser fetch it (same origin, artifact proxy, configured storage hosts). */
  trusted: boolean;
  /** Over LARGE_FILE_BYTES: the 3D viewer waits for one more click before fetching it. */
  large: boolean;
  /**
   * A fastload Skeleton 3DM: its "Meshes" file from the same step. The skeleton holds a
   * one-triangle placeholder per surface, so the viewer swaps these real meshes in.
   */
  meshesUrl?: string;
}

export interface IoSummary {
  inputs: IoItem[];
  outputs: IoItem[];
}

export interface ResultFile {
  label: string;
  url: string | null;
  kind: 'image' | 'model3d';
  format?: IoFormat;
}

export const LARGE_FILE_BYTES = 50 * 1024 * 1024;
/** Tiles shown per group before a "+N more" tile; the full lists are in the sections below. */
export const TILE_PAGE = 12;

type Media = Extract<ViewNode, { kind: 'media' }>;

const MODEL_FORMATS = new Set(['glb', 'gltf', '3dm', 'stl']);

function mimeFormat(mime: string): string | null {
  const m = mime.toLowerCase().split(';')[0].trim();
  if (m.includes('gltf')) return 'glb';
  if (m.includes('3dm')) return '3dm';
  if (m.includes('stl') || m === 'application/sla') return 'stl';
  if (m === 'application/pdf') return 'pdf';
  if (m.includes('gzip')) return 'gz';
  if (/^application\/(x-)?zip(-compressed)?$/.test(m)) return 'zip';
  if (m.includes('json')) return 'json';
  if (m.includes('step')) return 'step';
  if (m.startsWith('video/')) return m.slice(6).replace(/^x-/, '');
  return null;
}

/** The mime an artifact ref carried, read back from its Details (the walker keeps every key). */
function mimeOf(node: Media): string | null {
  if (!node.meta || node.meta.kind !== 'group') return null;
  const hit = node.meta.children.find((c) => ['type', 'mime', 'mime_type'].includes(c.key) && c.kind === 'text');
  return hit && hit.kind === 'text' ? hit.value : null;
}

/** The ref's own uri (kept in its Details), whose last path segment is often the stored file name. */
function uriOf(node: Media): string | null {
  if (!node.meta || node.meta.kind !== 'group') return null;
  const hit = node.meta.children.find((c) => (c.key === 'uri' || c.key === 'url') && c.kind === 'text');
  return hit && hit.kind === 'text' ? hit.value : null;
}

/** The file name: the ref's name, else the last segment of its uri when that has an extension. */
function nameOf(node: Media): string | null {
  if (node.name) return node.name;
  const source = uriOf(node) ?? node.source;
  if (!source) return null;
  const raw = source.split(/[?#]/)[0].split('/').pop() ?? '';
  let last = raw;
  try { last = decodeURIComponent(raw); } catch { /* keep it as written */ }
  return /^[^/]{1,120}\.[A-Za-z0-9]{1,8}$/.test(last) && !/^[a-f0-9]{64}\./i.test(last) ? last : null;
}

function formatOf(node: Media): string | null {
  const mime = mimeOf(node);
  const fromMime = mime ? mimeFormat(mime) : null;
  const name = nameOf(node);
  const fromName = node.ext ?? (name ? extOf(name) : null);
  // A known 3D type wins whichever source says it; else the extension, else the mime.
  for (const f of [fromName, fromMime]) if (f && MODEL_FORMATS.has(f)) return f;
  return fromName ?? fromMime;
}

function toItem(node: ViewNode): IoItem | null {
  if (node.kind !== 'media' || node.media === 'link') return null;
  const base = {
    key: node.path, label: node.label, url: node.url, name: nameOf(node), bytes: node.bytes,
    trusted: isTrustedImageSrc(node.url), large: node.bytes !== null && node.bytes > LARGE_FILE_BYTES,
  };
  if (node.media === 'image') return { ...base, kind: 'image', format: null };
  const format = node.media === 'model3d' ? (node.ext === 'gltf' ? 'gltf' : 'glb') : formatOf(node);
  return { ...base, kind: format && MODEL_FORMATS.has(format) ? 'model3d' : 'file', format };
}

function collect(node: ViewNode | null): IoItem[] {
  if (!node) return [];
  return findNodes(node, (n) => n.kind === 'media').map(toItem).filter((i): i is IoItem => i !== null);
}

function resultItems(files: ResultFile[]): IoItem[] {
  return files.flatMap((f) => {
    const kind = f.url ? classifyUrl(f.url) : null;
    if (!kind || kind.kind === 'refused') return [];
    return [{
      key: `result:${f.label}`, label: f.label, kind: f.kind, format: f.format ?? null, url: kind.url,
      name: null, bytes: null, trusted: isTrustedImageSrc(kind.url), large: false,
    }];
  });
}

function dedupe(items: IoItem[]): IoItem[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.url) ? false : (seen.add(i.url), true)));
}

const OUTPUT_RANK: Record<string, number> = { glb: 1, gltf: 1, '3dm': 2, stl: 3 };
const outputRank = (i: IoItem) => (i.kind === 'image' ? 0 : i.kind === 'model3d' ? OUTPUT_RANK[i.format ?? ''] ?? 3 : 4);

/** Give each fastload skeleton the url of its sibling meshes file (same step, key "meshes"). */
function linkFastloadMeshes(items: IoItem[]): IoItem[] {
  const byKey = new Map(items.map((i) => [i.key, i]));
  return items.map((item) => {
    if (item.kind !== 'model3d' || item.format !== '3dm' || !item.key.endsWith('.skeleton_3dm')) return item;
    const meshes = byKey.get(`${item.key.slice(0, -'skeleton_3dm'.length)}meshes`);
    return meshes?.trusted ? { ...item, meshesUrl: meshes.url } : item;
  });
}

export function buildIoSummary(view: RunView, options: { resultFiles?: ResultFile[] } = {}): IoSummary {
  const inputs = dedupe(collect(view.inputs));
  const outputs = linkFastloadMeshes(dedupe([...collect(view.outputs?.node ?? null), ...resultItems(options.resultFiles ?? [])])
    .map((item, i) => ({ item, i }))
    .sort((a, b) => outputRank(a.item) - outputRank(b.item) || a.i - b.i)
    .map(({ item }) => item));
  return { inputs, outputs };
}
