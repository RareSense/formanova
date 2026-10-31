// Heavy .3dm files open as a skeleton .3dm (each meshed surface a one-triangle
// placeholder) plus the exact render meshes, packed by the toolkit's
// cad_fastload tool (fastload.py). Nothing is simplified: the meshes are
// swapped into the placeholders by object id.

import * as THREE from 'three';

export interface PackedMeshes {
  byId: Map<string, THREE.BufferGeometry>;
  order: string[];
}

/** Undo fastload.py's packing: byte planes back to 4-byte values; indices are zigzag deltas. */
export function unpackMeshes(buf: ArrayBuffer): PackedMeshes {
  const u8 = new Uint8Array(buf);
  const headLen = new DataView(buf).getUint32(0, true);
  const head = JSON.parse(new TextDecoder().decode(u8.subarray(4, 4 + headLen)));
  const base = 4 + headLen;
  const planes = ([off, n]: [number, number]) => {
    const src = u8.subarray(base + off, base + off + 4 * n), out = new Uint8Array(4 * n);
    for (let b = 0; b < 4; b++) for (let i = 0, o = b * n; i < n; i++) out[4 * i + b] = src[o + i];
    return out.buffer;
  };
  const byId = new Map<string, THREE.BufferGeometry>();
  for (const rec of head.objects) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(planes(rec.position)), 3));
    if (rec.normal) g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(planes(rec.normal)), 3));
    if (rec.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(planes(rec.uv)), 2));
    const idx = new Uint32Array(planes(rec.index));
    for (let i = 0, acc = 0; i < idx.length; i++) { acc += (idx[i] >>> 1) ^ -(idx[i] & 1); idx[i] = acc; }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    if (!rec.normal) g.computeVertexNormals();
    byId.set(String(rec.id).toLowerCase(), g);
  }
  return { byId, order: head.order.map((id: string) => id.toLowerCase()) };
}

const idOf = (c: THREE.Object3D) => String(c.userData.attributes?.id || '').toLowerCase().replace(/[{}]/g, '');

/** Put the exact meshes into the skeleton's placeholders, in the file's object order. Returns how many were swapped. */
export function swapInMeshes(obj: THREE.Object3D, { byId, order }: PackedMeshes): number {
  const rank = new Map(order.map((id, i) => [id, i]));
  const own = obj.children.filter((c) => c.userData.attributes);
  own.sort((a, b) => (rank.get(idOf(a)) ?? 1e9) - (rank.get(idOf(b)) ?? 1e9));
  obj.children.splice(0, obj.children.length, ...own, ...obj.children.filter((c) => !c.userData.attributes));
  let swapped = 0;
  for (const c of own) {
    const mesh = c as THREE.Mesh;
    const g = mesh.isMesh && byId.get(idOf(c));
    if (!g) continue;
    mesh.geometry.dispose();
    mesh.geometry = g;
    swapped++;
  }
  return swapped;
}
