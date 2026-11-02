/**
 * Shared readers for the workflow view extractors. Pure functions only.
 *
 * Step outputs come straight from tool_invocations.output_data (denormalised by the
 * admin endpoint, so azure:// artifacts arrive as https://<api>/api/artifacts/<sha>);
 * step inputs are NOT denormalised and may still hold azure:// refs. Both are resolved
 * through azureUriToUrl, which collapses any content-addressed ref to the same-origin
 * /api/artifacts/<sha> proxy.
 */
import { azureUriToUrl } from '@/lib/azure-utils';
import type { AdminGenerationStep } from '@/lib/admin-generations-api';
import type { ViewField, ViewFile, ViewImage, ViewStep } from './types';

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Tools answer either flat or wrapped as { result: {...} }. */
export function unwrapResult(output: unknown): Record<string, unknown> {
  const root = asRecord(output) ?? {};
  return asRecord(root.result) ?? root;
}

function errorText(value: unknown): string | null {
  if (typeof value === 'string') return text(value);
  const record = asRecord(value);
  if (!record) return null;
  return text(record.message) ?? text(record.detail) ?? text(record.user_message) ?? text(record.type) ?? null;
}

/**
 * Whether a recorded tool call failed. The admin API sends no is_success / is_retry, so
 * this is inferred from the output:
 *   - http_tool / gpu_launcher record a raised failure as output_data = { error: ... };
 *   - a "soft" failure keeps the tool's body, which then says ok: false or status: failed
 *     (the tool's success_when), usually with a user_message.
 * A missing or empty error field is not a failure.
 */
export function stepFailure(output: unknown): { failed: boolean; error: string | null } {
  const root = asRecord(output);
  if (!root) return { failed: false, error: null };
  if (root.error !== undefined && root.error !== null && root.error !== '') {
    return { failed: true, error: errorText(root.error) };
  }
  const body = unwrapResult(output);
  const status = typeof body.status === 'string' ? body.status.toLowerCase() : '';
  if (body.ok === false || status === 'failed' || status === 'error') {
    return { failed: true, error: text(body.user_message) ?? errorText(body.error) ?? errorText(body.failure) };
  }
  return { failed: false, error: null };
}

/** A link we are willing to put in an href: http(s), a same-origin path, or a data: url. */
export function safeHref(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (v.startsWith('https://') || v.startsWith('http://') || v.startsWith('data:')) return v;
  if (v.startsWith('/') && !v.startsWith('//')) return v;
  return null;
}

function resolveRef(value: string): string | null {
  const v = value.trim();
  if (v.startsWith('azure://') || v.startsWith('https://') || v.startsWith('http://')) {
    return safeHref(azureUriToUrl(v) || null);
  }
  if (v.startsWith('/') && v.includes('/artifacts/')) return safeHref(v);
  return null;
}

/** A picture an <img> can load (string or stored artifact), or null. */
export function imageUrl(value: unknown): string | null {
  if (typeof value === 'string') {
    const v = value.trim();
    if (v.startsWith('data:')) return v.startsWith('data:image/') ? v : null;
    return resolveRef(v);
  }
  const record = asRecord(value);
  if (!record) return null;
  const mime = typeof record.type === 'string' ? record.type.toLowerCase() : '';
  if (mime && !mime.startsWith('image/')) return null;
  for (const key of ['url', 'uri', 'data_url']) {
    if (typeof record[key] === 'string') {
      const url = imageUrl(record[key]);
      if (url) return url;
    }
  }
  return null;
}

/** The first picture among the given keys of a record. */
export function firstImage(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const url = imageUrl(record[key]);
    if (url) return url;
  }
  return null;
}

/** Every picture in a list value (strings or artifacts). */
export function imageList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(imageUrl).filter((u): u is string => Boolean(u)) : [];
}

export function dedupeImages(images: ViewImage[]): ViewImage[] {
  const seen = new Set<string>();
  return images.filter((img) => (seen.has(img.url) ? false : (seen.add(img.url), true)));
}

/** Plain text for a simple value; objects and lists of objects as compact JSON. */
export function valueText(value: unknown): string | null {
  if (typeof value === 'string') return text(value);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (Array.isArray(value)) {
    if (!value.length) return null;
    if (value.every((v) => ['string', 'number', 'boolean'].includes(typeof v))) {
      return value.map((v) => valueText(v)).filter(Boolean).join(', ') || null;
    }
    return JSON.stringify(value);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).length ? JSON.stringify(value) : null;
  }
  return null;
}

const LONG_TEXT = 140;

/** One labelled field, or none when the value is empty. */
export function field(label: string, value: unknown, long?: boolean): ViewField[] {
  const v = valueText(value);
  if (!v) return [];
  return [{ label, value: v, ...(long || v.length > LONG_TEXT ? { long: true } : {}) }];
}

const SKIP_KEY = /(_b64$|^idempotency_key$)/;

/** Every simple value of an object as a labelled field (prefixed with the object's name). */
export function fieldsFromObject(value: unknown, prefix?: string): ViewField[] {
  const record = asRecord(value);
  if (!record) return [];
  return Object.entries(record).flatMap(([key, v]) =>
    SKIP_KEY.test(key) ? [] : field(prefix ? `${prefix}: ${key}` : key, v));
}

const FILE_KINDS: Array<{ label: string; test: (mime: string, ext: string, key: string) => boolean }> = [
  { label: '3DM', test: (m, e, k) => m.includes('3dm') || e === '3dm' || /threedm|3dm/.test(k) },
  { label: 'GLB', test: (m, e, k) => m.includes('gltf') || e === 'glb' || /(^|_)glb(_|$)/.test(k) },
  { label: 'STL', test: (m, e, k) => m.includes('stl') || e === 'stl' || /(^|_)stls?(_|$)/.test(k) },
  { label: 'STEP', test: (m, e, k) => m.includes('step') || e === 'step' || e === 'stp' || /(^|_)steps?_artifacts?$/.test(k) },
  { label: 'Spec sheet', test: (m, e, k) => /spec_?sheet/.test(k) || m === 'application/pdf' || e === 'pdf' },
  { label: 'Meshes', test: (m) => m.includes('meshes') },
];

function extOf(name: string): string {
  const clean = name.split(/[?#]/)[0];
  const dot = clean.lastIndexOf('.');
  return dot > clean.lastIndexOf('/') && dot >= 0 ? clean.slice(dot + 1).toLowerCase() : '';
}

/**
 * Every downloadable CAD file (3DM, GLB, STL, STEP, spec sheet, packed meshes) anywhere in
 * a step output or payload, labelled from its type and the key it sits under. Pictures and
 * internal text artifacts are left out.
 */
export function collectFiles(node: unknown): ViewFile[] {
  const files: ViewFile[] = [];
  const seen = new Set<string>();

  function visit(value: unknown, path: string[], depth: number) {
    if (depth > 8) return;
    if (Array.isArray(value)) {
      value.forEach((child) => visit(child, path, depth + 1));
      return;
    }
    const record = asRecord(value);
    if (!record) return;
    const ref = text(record.url) ?? text(record.uri);
    if (ref && (typeof record.type === 'string' || typeof record.sha256 === 'string')) {
      const mime = typeof record.type === 'string' ? record.type.toLowerCase() : '';
      if (mime.startsWith('image/')) return;
      const name = text(record.name) ?? text(record.filename);
      const key = (path[path.length - 1] ?? '').toLowerCase();
      const kind = FILE_KINDS.find((k) => k.test(mime, extOf(name ?? ref), key));
      const url = resolveRef(ref) ?? (ref.startsWith('data:') ? ref : null);
      if (kind && url && !seen.has(url)) {
        seen.add(url);
        const where = path.join('.').toLowerCase();
        let label = kind.label;
        if (where.includes('casting')) label = `Casting ${label}`;
        if (where.includes('prevalidation')) label = `${label} (pre-validation)`;
        files.push({ label, url, name, bytes: typeof record.bytes === 'number' ? record.bytes : null });
      }
      return;
    }
    Object.entries(record).forEach(([key, child]) => visit(child, [...path, key], depth + 1));
  }

  visit(node, [], 0);
  return files;
}

/**
 * The first object (breadth of nesting, depth-limited) that holds a non-null `key`, so its
 * sibling fields can be read with it. Tool outputs may be flat or nested under a node id.
 */
export function findNodeWithKey(node: unknown, key: string, depth = 0): Record<string, unknown> | null {
  if (depth > 8) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findNodeWithKey(child, key, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const record = asRecord(node);
  if (!record) return null;
  if (record[key] !== undefined && record[key] !== null) return record;
  for (const child of Object.values(record)) {
    const found = findNodeWithKey(child, key, depth + 1);
    if (found) return found;
  }
  return null;
}

/** The node holding `key` in the last successful step that has one. */
export function lastNodeWithKey(steps: AdminGenerationStep[], key: string): Record<string, unknown> | null {
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    if (stepFailure(steps[i].output).failed) continue;
    const found = findNodeWithKey(steps[i].output, key);
    if (found) return found;
  }
  return null;
}

export type StepDescriber = (step: AdminGenerationStep) => { fields: ViewField[]; images: ViewImage[] };

/** The timeline: every recorded tool call in order, with failures and retries marked. */
export function buildSteps(steps: AdminGenerationStep[], describe: StepDescriber): ViewStep[] {
  return steps.map((step, i) => {
    const { failed, error } = stepFailure(step.output);
    const retried = failed && steps.slice(i + 1).some((later) => later.tool_name === step.tool_name);
    const described = failed ? { fields: [], images: [] } : describe(step);
    return {
      index: i + 1,
      tool: step.tool_name,
      tookMs: step.took_ms,
      at: step.at,
      failed,
      retried,
      error,
      fields: described.fields,
      images: described.images,
      input: step.input,
      output: step.output,
    };
  });
}

/** The last successful call of a tool whose name matches. */
export function lastOk(steps: AdminGenerationStep[], match: (tool: string) => boolean): AdminGenerationStep | null {
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    if (match(steps[i].tool_name) && !stepFailure(steps[i].output).failed) return steps[i];
  }
  return null;
}

/** A stored file (artifact or url / data: string) as a download link, or null. */
export function fileFrom(value: unknown, label: string): ViewFile | null {
  if (typeof value === 'string') {
    const v = value.trim();
    const url = v.startsWith('data:') ? safeHref(v) : resolveRef(v);
    return url ? { label, url, name: null, bytes: null } : null;
  }
  const record = asRecord(value);
  if (!record) return null;
  const ref = text(record.url) ?? text(record.uri);
  const file = ref ? fileFrom(ref, label) : null;
  if (!file) return null;
  return {
    ...file,
    name: text(record.name) ?? text(record.filename),
    bytes: typeof record.bytes === 'number' && record.bytes >= 0 ? record.bytes : null,
  };
}
