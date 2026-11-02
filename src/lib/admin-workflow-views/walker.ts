/**
 * The schema-free walker behind the admin detail page. It turns any JSON value (the request
 * payload, a step's input or output) into display nodes WITHOUT knowing the workflow, and
 * never drops a value:
 *   - artifact refs {uri|url, sha256?, type|mime?, bytes?} -> media (picture, 3D model, file)
 *     typed by mime or extension, with every key of the ref kept in its details;
 *   - url strings -> media typed by extension (url-safety.ts decides; refused ones stay text);
 *   - short strings -> values, long strings -> text blocks; numbers / booleans / null -> values;
 *   - arrays -> lists (galleries when all pictures); objects -> nested groups;
 *   - noise keys (base64, hashes, idempotency keys) are flagged `technical`, not removed;
 *   - past MAX_DEPTH levels a `deep` node keeps the rest for an on-demand "show deeper".
 * A family Enhancement may only relabel and reorder (AI_RULES.md section 13).
 */
import { classifyUrl } from './url-safety';

export type MediaKind = 'image' | 'model3d' | 'file' | 'link';

interface Base {
  /** Where the value sits, e.g. input_payload.payload.jewelry_image_urls[0]. */
  path: string;
  key: string;
  label: string;
  technical?: boolean;
}

export type ViewNode =
  | (Base & { kind: 'text'; value: string; long: boolean })
  | (Base & { kind: 'value'; value: string })
  | (Base & { kind: 'refused'; value: string; reason: string })
  | (Base & {
      kind: 'media';
      media: MediaKind;
      url: string;
      ext: string | null;
      name: string | null;
      bytes: number | null;
      /** The original string, when the media came from a url string. */
      source: string | null;
      /** Every key of an artifact ref, when it came from one. */
      meta: ViewNode | null;
    })
  | (Base & { kind: 'group'; children: ViewNode[] })
  | (Base & { kind: 'list'; items: ViewNode[]; gallery: boolean })
  | (Base & { kind: 'deep'; value: unknown });

export interface LabelContext {
  key: string;
  parent: Record<string, unknown> | null;
  path: string;
  tool?: string;
}

/** What a workflow family may add: labels and order. Nothing else. */
export interface Enhancement {
  labels?: Record<string, string>;
  label?: (ctx: LabelContext) => string | undefined;
  order?: string[];
}

export const MAX_DEPTH = 12;
const LONG_TEXT = 140;
const TECHNICAL_KEY = /(_b64$|^idempotency_key$|^sha256$|_sha256$|^hash$|_hash$|^effect_key$|^claim_key$|^etag$)/i;

export function humanize(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .trim()
    .toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Value';
}

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
export function childPath(path: string, key: string | number): string {
  if (typeof key === 'number') return `${path}[${key}]`;
  return IDENT.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

const own = (map: Record<string, string> | undefined, key: string): string | undefined =>
  map && Object.prototype.hasOwnProperty.call(map, key) && typeof map[key] === 'string' ? map[key] : undefined;

interface Ctx {
  enh: Enhancement;
  tool?: string;
  /** Inside an artifact's details: strings stay text, refs are not re-detected. */
  plain: boolean;
}

function labelFor(ctx: Ctx, key: string, parent: Record<string, unknown> | null, path: string): string {
  return ctx.enh.label?.({ key, parent, path, tool: ctx.tool })
    ?? (ctx.tool ? own(ctx.enh.labels, `${ctx.tool}.${key}`) : undefined)
    ?? own(ctx.enh.labels, key)
    ?? humanize(key);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** A stored artifact ref: a link plus at least one of sha256 / type / mime / bytes. */
function artifactMedia(record: Record<string, unknown>, key: string):
  { media: MediaKind; url: string; ext: string | null } | null {
  const ref = str(record.url) ?? str(record.uri);
  if (!ref) return null;
  const mime = (str(record.type) ?? str(record.mime) ?? str(record.mime_type) ?? '').toLowerCase();
  if (!mime && typeof record.sha256 !== 'string' && typeof record.bytes !== 'number') return null;
  const kind = classifyUrl(ref, key);
  if (!kind || kind.kind === 'refused') return null;
  const nameExt = str(record.name)?.split('.').pop()?.toLowerCase() ?? null;
  const ext = kind.kind === 'file' ? kind.ext ?? nameExt : nameExt;
  if (mime.startsWith('image/')) return { media: mime.includes('svg') ? 'file' : 'image', url: kind.url, ext: mime.includes('svg') ? 'svg' : ext };
  if (mime.includes('gltf') || ext === 'glb') return { media: 'model3d', url: kind.url, ext: 'glb' };
  if (mime) return { media: 'file', url: kind.url, ext };
  return { media: kind.kind === 'link' ? 'file' : kind.kind, url: kind.url, ext };
}

function walkValue(
  value: unknown, path: string, key: string, label: string, ctx: Ctx, depth: number, parent: Record<string, unknown> | null,
): ViewNode {
  const technical = TECHNICAL_KEY.test(key) || undefined;
  const base = { path, key, label, ...(technical ? { technical } : {}) };

  if (value === null || value === undefined) return { ...base, kind: 'value', value: 'empty' };
  if (typeof value === 'boolean') return { ...base, kind: 'value', value: value ? 'yes' : 'no' };
  if (typeof value === 'number' || typeof value === 'bigint') return { ...base, kind: 'value', value: String(value) };
  if (typeof value === 'string') {
    if (!ctx.plain) {
      const kind = classifyUrl(value, key);
      if (kind?.kind === 'refused') return { ...base, kind: 'refused', value, reason: kind.reason };
      if (kind) {
        return {
          ...base, kind: 'media', media: kind.kind, url: kind.url, ext: kind.kind === 'file' ? kind.ext : null,
          name: null, bytes: null, source: value, meta: null,
        };
      }
    }
    return { ...base, kind: 'text', value, long: value.length > LONG_TEXT || value.includes('\n') };
  }
  if (typeof value !== 'object') return { ...base, kind: 'value', value: String(value) };
  if (depth >= MAX_DEPTH) return { ...base, kind: 'deep', value };

  if (Array.isArray(value)) {
    if (!value.length) return { ...base, kind: 'value', value: 'none' };
    const items = value.map((item, i) =>
      walkValue(item, childPath(path, i), key, value.length > 1 ? `${label} ${i + 1}` : label, ctx, depth + 1, parent));
    const gallery = items.every((n) => n.kind === 'media' && n.media === 'image');
    return { ...base, kind: 'list', items, gallery };
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (!keys.length) return { ...base, kind: 'value', value: 'none' };
  if (!ctx.plain) {
    const media = artifactMedia(record, key);
    if (media) {
      return {
        ...base, kind: 'media', ...media,
        name: str(record.name) ?? str(record.filename),
        bytes: typeof record.bytes === 'number' && record.bytes >= 0 ? record.bytes : null,
        source: null,
        meta: walkGroup(record, path, key, 'Details', { ...ctx, plain: true }, depth + 1),
      };
    }
  }
  return walkGroup(record, path, key, label, ctx, depth);
}

function walkGroup(record: Record<string, unknown>, path: string, key: string, label: string, ctx: Ctx, depth: number): ViewNode {
  const order = ctx.enh.order ?? [];
  const rank = (k: string) => {
    const i = order.indexOf(k);
    return i === -1 ? order.length : i;
  };
  const keys = Object.keys(record)
    .map((k, i) => ({ k, i }))
    .sort((a, b) => rank(a.k) - rank(b.k) || a.i - b.i)
    .map(({ k }) => k);
  const children = keys.map((k) => {
    const p = childPath(path, k);
    return walkValue(record[k], p, k, labelFor(ctx, k, record, p), ctx, depth + 1, record);
  });
  return { path, key, label, ...(TECHNICAL_KEY.test(key) ? { technical: true } : {}), kind: 'group', children };
}

/** Walk one root value (input_payload, steps[i].output, ...). `tool` scopes tool.key labels. */
export function walk(value: unknown, path: string, enh: Enhancement = {}, tool?: string, label?: string): ViewNode {
  const ctx: Ctx = { enh, tool, plain: false };
  const record = asRecord(value);
  if (record && Object.keys(record).length && !artifactMedia(record, '')) {
    return walkGroup(record, path, '', label ?? '', ctx, 0);
  }
  return walkValue(value, path, '', label ?? 'Value', ctx, 0, null);
}

/** Continue a `deep` node from where the cap stopped it. */
export function walkDeeper(node: Extract<ViewNode, { kind: 'deep' }>, enh: Enhancement = {}, tool?: string): ViewNode {
  return walkValue(node.value, node.path, node.key, node.label, { enh, tool, plain: false }, 0, null);
}

/** Every value path a node tree shows; a deep node covers its subtree as `${path}…`. */
export function coveredPaths(node: ViewNode, out: Set<string> = new Set()): Set<string> {
  switch (node.kind) {
    case 'group':
      node.children.forEach((c) => coveredPaths(c, out));
      break;
    case 'list':
      node.items.forEach((c) => coveredPaths(c, out));
      break;
    case 'media':
      if (node.meta) coveredPaths(node.meta, out);
      else out.add(node.path);
      break;
    case 'deep':
      out.add(`${node.path}…`);
      break;
    default:
      out.add(node.path);
  }
  return out;
}

/** All nodes matching a predicate, in order (used to find files / 3D models in outputs). */
export function findNodes(node: ViewNode, match: (n: ViewNode) => boolean, out: ViewNode[] = []): ViewNode[] {
  if (match(node)) out.push(node);
  if (node.kind === 'group') node.children.forEach((c) => findNodes(c, match, out));
  if (node.kind === 'list') node.items.forEach((c) => findNodes(c, match, out));
  return out;
}
