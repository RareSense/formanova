/**
 * Test helper: every leaf of a JSON value as a path, in the walker's path notation.
 * A leaf is a string, number, boolean or null, or an empty array / object.
 */
import { childPath } from '../walker';

export function leafPaths(value: unknown, path: string, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    if (!value.length) out.push(path);
    value.forEach((item, i) => leafPaths(item, childPath(path, i), out));
    return out;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (!keys.length) out.push(path);
    keys.forEach((k) => leafPaths((value as Record<string, unknown>)[k], childPath(path, k), out));
    return out;
  }
  out.push(path);
  return out;
}
