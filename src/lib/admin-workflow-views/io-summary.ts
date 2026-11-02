/**
 * The "Inputs -> Outputs" summary at the top of the admin detail page: every picture and 3D
 * file (GLB / glTF, 3DM, STL) in the request payload, and in the final outputs (the last
 * successful step's output plus the /api/result files). Built only from the walker's nodes and
 * url-safety's rules, so it shows nothing the sections below do not; everything else (prompts,
 * settings, steps, raw JSON) stays below. Pure functions only.
 *
 * Preview policy (WebGL is expensive):
 *   - an untrusted host is never previewed ('none'), only linked with a warning;
 *   - a file over CLICK_ONLY_BYTES only loads on click;
 *   - at most MAX_AUTO_3D previews mount on their own, outputs first; the rest wait for a click.
 */
import type { RunView } from './index';
import { classifyUrl, extOf, isTrustedImageSrc } from './url-safety';
import { findNodes, type ViewNode } from './walker';

export type IoFormat = 'glb' | 'gltf' | '3dm' | 'stl';
export type IoPreview = 'auto' | 'click' | 'none';

export interface IoItem {
  /** Unique within its column: the node path, or the result file's label. */
  key: string;
  label: string;
  kind: 'image' | 'model3d';
  /** The 3D format; null for pictures. */
  format: IoFormat | null;
  url: string;
  name: string | null;
  bytes: number | null;
  /** May the browser fetch it (same origin, artifact proxy, configured storage hosts). */
  trusted: boolean;
  /** 3D only: mount on its own, wait for a click, or never (untrusted / picture). */
  preview: IoPreview;
}

export interface IoSummary {
  inputs: IoItem[];
  outputs: IoItem[];
}

export interface ResultFile {
  label: string;
  url: string | null;
  format: IoFormat;
}

export const MAX_AUTO_3D = 2;
export const CLICK_ONLY_BYTES = 50 * 1024 * 1024;
/** First page of each column in the summary; the full lists stay in the sections below. */
export const SUMMARY_PICTURES = 8;
export const SUMMARY_MODELS = 6;

type Media = Extract<ViewNode, { kind: 'media' }>;

const FORMATS = new Set<IoFormat>(['glb', 'gltf', '3dm', 'stl']);

function mimeFormat(mime: string): IoFormat | null {
  const m = mime.toLowerCase();
  if (m.includes('gltf')) return 'glb';
  if (m.includes('3dm')) return '3dm';
  if (m.includes('stl') || m === 'application/sla') return 'stl';
  return null;
}

/** The mime an artifact ref carried, read back from its Details (the walker keeps every key). */
function mimeOf(node: Media): string | null {
  if (!node.meta || node.meta.kind !== 'group') return null;
  const hit = node.meta.children.find((c) => ['type', 'mime', 'mime_type'].includes(c.key) && c.kind === 'text');
  return hit && hit.kind === 'text' ? hit.value : null;
}

function formatOf(node: Media): IoFormat | null {
  const candidates = [node.ext, node.name ? extOf(node.name) : null];
  for (const c of candidates) if (c && FORMATS.has(c as IoFormat)) return c as IoFormat;
  const mime = mimeOf(node);
  return mime ? mimeFormat(mime) : null;
}

function toItem(node: ViewNode): IoItem | null {
  if (node.kind !== 'media') return null;
  const base = { key: node.path, label: node.label, url: node.url, name: node.name, bytes: node.bytes, trusted: isTrustedImageSrc(node.url) };
  if (node.media === 'image') return { ...base, kind: 'image', format: null, preview: 'none' };
  if (node.media === 'model3d' || node.media === 'file') {
    const format = node.media === 'model3d' ? (node.ext === 'gltf' ? 'gltf' : 'glb') : formatOf(node);
    if (!format) return null;
    return { ...base, kind: 'model3d', format, preview: 'none' };
  }
  return null;
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
      key: `result:${f.label}`, label: f.label, kind: 'model3d' as const, format: f.format, url: kind.url,
      name: null, bytes: null, trusted: isTrustedImageSrc(kind.url), preview: 'none' as const,
    }];
  });
}

function dedupe(items: IoItem[]): IoItem[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.url) ? false : (seen.add(i.url), true)));
}

export function buildIoSummary(view: RunView, options: { resultFiles?: ResultFile[] } = {}): IoSummary {
  const inputs = dedupe(collect(view.inputs));
  const outputs = dedupe([...collect(view.outputs?.node ?? null), ...resultItems(options.resultFiles ?? [])]);
  let auto = 0;
  const assign = (item: IoItem): IoItem => {
    if (item.kind !== 'model3d' || !item.trusted) return item;
    const big = item.bytes !== null && item.bytes > CLICK_ONLY_BYTES;
    if (!big && auto < MAX_AUTO_3D) {
      auto += 1;
      return { ...item, preview: 'auto' };
    }
    return { ...item, preview: 'click' };
  };
  // Outputs get the auto slots first: they are what the admin opens the page to check.
  const out = outputs.map(assign);
  return { inputs: inputs.map(assign), outputs: out };
}
