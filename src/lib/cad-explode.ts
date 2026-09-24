import * as THREE from "three";

/**
 * Radial explode view for the CAD viewport.
 *
 * Each part is pushed away from the center of the whole piece along the line
 * from that center to the part's own center, by a fixed fraction of that
 * distance. Parts far from the center travel further, so the relative layout is
 * kept and every separate NURBS body becomes visible. A part centered on the
 * piece (usually the shank) stays put.
 *
 * The offsets are display-only: CADCanvas applies them to a wrapper group
 * around each mesh, never to the mesh transform held in React state, so
 * export, undo and weight never see them.
 */

/** Fraction of each part's distance from the piece center that it travels. */
export const EXPLODE_FACTOR = 0.6;

/** Seconds for a full explode or collapse. */
export const EXPLODE_DURATION_S = 0.6;

export interface ExplodablePart {
  name: string;
  geometry: THREE.BufferGeometry;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}

export function computeExplodeOffsets(
  parts: ExplodablePart[],
  factor: number = EXPLODE_FACTOR,
): Map<string, THREE.Vector3> {
  const matrix = new THREE.Matrix4();
  const pieceBox = new THREE.Box3();
  const centers = new Map<string, THREE.Vector3>();

  for (const part of parts) {
    if (!part.geometry.boundingBox) part.geometry.computeBoundingBox();
    const box = part.geometry.boundingBox;
    if (!box || box.isEmpty()) continue;
    matrix.compose(part.position, part.quaternion, part.scale);
    const worldBox = box.clone().applyMatrix4(matrix);
    pieceBox.union(worldBox);
    centers.set(part.name, worldBox.getCenter(new THREE.Vector3()));
  }

  const offsets = new Map<string, THREE.Vector3>();
  if (pieceBox.isEmpty()) return offsets;
  const pieceCenter = pieceBox.getCenter(new THREE.Vector3());
  for (const [name, center] of centers) {
    offsets.set(name, center.sub(pieceCenter).multiplyScalar(factor));
  }
  return offsets;
}

/** Smooth start and stop for the explode animation, t in [0, 1]. */
export function easeExplode(t: number): number {
  return t * t * (3 - 2 * t);
}
