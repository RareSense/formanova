/**
 * Light constants for the CAD tech sheet page, kept apart from read.ts so the
 * page can show its upload area without loading the 3D reader and three.js.
 */

/** File types the tool opens in the browser, with no server. */
export const CAD_EXTENSIONS = ['3dm', 'stl', 'obj', 'ply', 'glb', 'gltf', 'step', 'stp'] as const;
export const CAD_ACCEPT = CAD_EXTENSIONS.map((e) => `.${e}`).join(',');

/** Larger files can run a laptop's browser out of memory. */
export const MAX_CAD_BYTES = 150 * 1024 * 1024;

export class CadFileError extends Error {
  constructor(message: string, public readonly kind: 'unsupported' | 'too_large' | 'unreadable') {
    super(message);
    this.name = 'CadFileError';
  }
}
