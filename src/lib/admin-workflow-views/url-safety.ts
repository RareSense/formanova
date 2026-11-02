/**
 * Which strings in a payload may become a link, a picture or a 3D preview on the admin pages.
 * Everything not allowed here is still shown, as plain text (never as href/src).
 *
 * - Script schemes (javascript:, vbscript:, also hidden behind entities or control chars),
 *   protocol-relative //host urls and unknown schemes are refused.
 * - data: urls are only allowed as raster pictures; SVG and every other data: type is refused.
 * - Content-addressed refs (azure://, https://<any>/api/artifacts/<sha>) collapse to the
 *   same-origin, auth-gated /api/artifacts/<sha> proxy (azureUriToUrl).
 * - Pictures auto-load only from the proxy / same origin, blob:, raster data:, and the storage
 *   hosts configured in VITE_AZURE_BLOB_BASE_URL / VITE_MODEL_ASSET_BASE_URL. Any other host is
 *   shown as a link with a warning, so a payload cannot make the admin's browser call a
 *   third-party host (tracking pixel).
 */
import { azureUriToUrl } from '@/lib/azure-utils';

export type UrlKind =
  | { kind: 'image'; url: string }
  | { kind: 'model3d'; url: string }
  | { kind: 'file'; url: string; ext: string | null }
  | { kind: 'link'; url: string }
  | { kind: 'refused'; reason: string };

const RASTER_DATA = /^data:image\/(png|jpe?g|webp|gif|avif|bmp)[;,]/i;
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp']);
const MODEL_EXT = new Set(['glb', 'gltf']);
const FILE_EXT = new Set(['3dm', 'stl', 'step', 'stp', 'pdf', 'zip', 'json', 'gz', 'bin', 'obj', 'fbx', 'usdz', 'txt', 'csv', 'svg']);
const IMAGE_KEY = /(image|img|photo|picture|thumbnail|preview|screenshot|render|background|output_url|result_url)/i;

export function extOf(url: string): string | null {
  const path = url.split(/[?#]/)[0];
  const last = path.slice(path.lastIndexOf('/') + 1);
  const dot = last.lastIndexOf('.');
  return dot > 0 ? last.slice(dot + 1).toLowerCase() : null;
}

/** Strips what browsers ignore inside a scheme, so "jav&#x09;ascript:" is caught too. */
function compact(value: string): string {
  const noEntities = value.toLowerCase().replace(/&#x?[0-9a-f]+;?/g, '');
  return Array.from(noEntities).filter((ch) => ch.charCodeAt(0) > 0x20).join('');
}

/**
 * The link kind of a string, or null when it is ordinary text. `key` is the payload key it
 * sits under, used only to treat an extension-less artifact url under an image-named key as
 * a picture.
 */
export function classifyUrl(raw: string, key = ''): UrlKind | null {
  const v = raw.trim();
  if (!v) return null;
  // A scheme sits at the start; looking at a short head keeps multi-MB strings cheap.
  const c = compact(v.slice(0, 256));
  if (/(java|vb)script:/.test(c)) return { kind: 'refused', reason: 'script url' };
  if (/\s/.test(v)) return null;
  if (v.startsWith('//')) return { kind: 'refused', reason: 'protocol-relative url' };
  if (c.startsWith('data:')) {
    return RASTER_DATA.test(v) ? { kind: 'image', url: v } : { kind: 'refused', reason: 'data: url that is not a raster picture' };
  }
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(v)?.[1]?.toLowerCase();
  if (scheme && !['http', 'https', 'azure'].includes(scheme)) return { kind: 'refused', reason: `${scheme}: url` };
  if (!scheme && !v.startsWith('/')) return null;

  const url = azureUriToUrl(v);
  if (!url) return { kind: 'refused', reason: 'storage ref that cannot be resolved' };
  const ext = extOf(url);
  if (ext && IMAGE_EXT.has(ext)) return { kind: 'image', url };
  if (ext && MODEL_EXT.has(ext)) return { kind: 'model3d', url };
  if (ext && FILE_EXT.has(ext)) return { kind: 'file', url, ext };
  if (url.includes('/artifacts/')) {
    return IMAGE_KEY.test(key) ? { kind: 'image', url } : { kind: 'file', url, ext: null };
  }
  return { kind: 'link', url };
}

function hostOf(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

/** Whether an <img> may load this src without leaking the admin's visit to a third party. */
export function isTrustedImageSrc(src: string | null | undefined): boolean {
  if (!src) return false;
  const v = src.trim();
  if (v.startsWith('data:')) return RASTER_DATA.test(v);
  if (v.startsWith('blob:')) return true;
  if (v.startsWith('/')) return !v.startsWith('//');
  if (!/^https?:\/\//i.test(v)) return false;
  const host = hostOf(v);
  const trusted = [
    hostOf(import.meta.env.VITE_AZURE_BLOB_BASE_URL),
    hostOf(import.meta.env.VITE_MODEL_ASSET_BASE_URL),
    typeof window !== 'undefined' ? window.location.host.toLowerCase() : null,
  ].filter(Boolean);
  return Boolean(host && trusted.includes(host));
}
