import * as THREE from 'three';
import { loadCad } from '@/components/cad-to-catalog/engine/formats';
import { loadRhino3dm } from '@/components/cad-to-catalog/engine/rhino';
import { storesUnits, type CadReading } from './model';
import { isStone, type PartBox } from './stones';
import { CAD_EXTENSIONS, CadFileError, MAX_CAD_BYTES } from './files';

export { CAD_ACCEPT, CadFileError } from './files';

const extOf = (name: string) => name.toLowerCase().split('.').pop() ?? '';

/** What the browser read from the file, in the file's own units. */
export interface CadRead {
  reading: CadReading;
  /** The 3D model for the views (empty when every part was saved without a display mesh). */
  root: THREE.Object3D;
  /** Metal triangles (stones left out), flat xyz in file units, for the ring and weight measures. */
  metal: Float32Array;
  /** Each shown part's layer, name and size in file units, for the stone schedule. */
  partBoxes: PartBox[];
}

/**
 * Each shown part of a Rhino file, from the surfaces themselves, so it works
 * for files saved without display meshes too: layer, name and box size.
 */
async function rhinoParts(file: File): Promise<PartBox[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- rhino3dm ships no types
  const rhino: any = await loadRhino3dm();
  const doc = rhino.File3dm.fromByteArray(new Uint8Array(await file.arrayBuffer()));
  if (!doc) return [];
  const out: PartBox[] = [];
  try {
    const objs = doc.objects();
    const layers = doc.layers();
    for (let i = 0; i < objs.count; i++) {
      const o = objs.get(i);
      const a = o.attributes();
      if (!a.visible) continue;
      const g = o.geometry();
      const t = g.objectType;
      // Block instances count too: stones are often placed as blocks of one modelled gem.
      if (t !== rhino.ObjectType.Brep && t !== rhino.ObjectType.Extrusion && t !== rhino.ObjectType.Mesh && t !== rhino.ObjectType.SubD && t !== rhino.ObjectType.InstanceReference) continue;
      const bb = g.getBoundingBox();
      if (!bb?.isValid) continue;
      const layer = layers.findIndex(a.layerIndex);
      const layerName = layer ? (layer.fullPath || layer.name || '') : '';
      out.push({
        layer: layerName,
        name: a.name || '',
        sizeMm: [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]],
      });
    }
  } finally {
    doc.delete();
  }
  return out;
}

/** Overall size of a set of part boxes is not their sum: this is only used when no mesh exists. */
async function rhinoOverall(file: File): Promise<[number, number, number] | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- rhino3dm ships no types
  const rhino: any = await loadRhino3dm();
  const doc = rhino.File3dm.fromByteArray(new Uint8Array(await file.arrayBuffer()));
  if (!doc) return null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  try {
    const objs = doc.objects();
    for (let i = 0; i < objs.count; i++) {
      const o = objs.get(i);
      if (!o.attributes().visible) continue;
      const g = o.geometry();
      const t = g.objectType;
      if (t !== rhino.ObjectType.Brep && t !== rhino.ObjectType.Extrusion && t !== rhino.ObjectType.Mesh && t !== rhino.ObjectType.SubD) continue;
      const bb = g.getBoundingBox();
      if (!bb?.isValid) continue;
      for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], bb.min[k]); max[k] = Math.max(max[k], bb.max[k]); }
    }
  } finally {
    doc.delete();
  }
  return min[0] === Infinity ? null : [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
}

/** All mesh triangles that are not stones, in world (file) coordinates. */
function metalTriangles(root: THREE.Object3D, layerOf: ((m: THREE.Mesh) => string) | null): Float32Array {
  const chunks: Float32Array[] = [];
  let total = 0;
  root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.visible || !m.geometry) return;
    // Only Rhino files name their parts; other formats name the mesh after the file ("Diamond Ring.stl").
    if (layerOf && isStone({ layer: layerOf(m), name: m.name || '', sizeMm: [0, 0, 0] })) return;
    const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
    const pos = geo.attributes.position;
    if (!pos) return;
    const out = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z;
    }
    chunks.push(out);
    total += out.length;
  });
  const all = new Float32Array(total);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.length; }
  return all;
}

/**
 * Opens a CAD file in the browser and measures it. Nothing is uploaded.
 */
export async function readCad(file: File): Promise<CadRead> {
  const format = extOf(file.name);
  if (!(CAD_EXTENSIONS as readonly string[]).includes(format)) {
    throw new CadFileError(`${format ? `.${format}` : 'This'} files can't be opened here. Use .3dm, .stl, .obj, .step, .glb or .ply.`, 'unsupported');
  }
  if (file.size > MAX_CAD_BYTES) {
    throw new CadFileError('This file is larger than 150 MB. Please save a lighter copy (for example without hidden construction layers).', 'too_large');
  }

  let loaded: Awaited<ReturnType<typeof loadCad>>;
  try {
    loaded = await loadCad(file, new Map([[file.name, file]]), {});
  } catch {
    throw new CadFileError('This file could not be opened. Please save it again from your CAD program and try once more.', 'unreadable');
  }
  const { root, info } = loaded;

  let size: [number, number, number] | null = null;
  const box = new THREE.Box3().setFromObject(root);
  if (!box.isEmpty()) {
    const s = box.getSize(new THREE.Vector3());
    size = [s.x, s.y, s.z];
  }
  if (format === '3dm' && (info.rhino?.noMesh || !size)) {
    // Parts without a display mesh are missing from the 3D model: measure the surfaces instead.
    size = (await rhinoOverall(file)) ?? size;
  }
  if (!size) throw new CadFileError('No solid parts were found in this file.', 'unreadable');

  const shown = info.rhino ? [...info.rhino.objects.values()].filter((o) => !o.hidden) : [];
  let meshes = 0;
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++; });
  const layers = [...new Set(shown.map((o) => o.layer).filter(Boolean))];
  const layerOf = (m: THREE.Mesh) => info.rhino?.objects.get(m.userData?.attributes?.id)?.layer ?? '';
  const partBoxes = format === '3dm' ? await rhinoParts(file).catch(() => []) : [];

  const reading: CadReading = {
    fileName: file.name,
    format,
    fileUnits: storesUnits(format) && info.units ? info.units : null,
    size,
    upAxis: info.upAxis,
    parts: info.rhino ? shown.length : meshes,
    layers,
    partsWithoutMesh: info.rhino?.noMesh ?? 0,
  };
  return { reading, root, metal: metalTriangles(root, info.rhino ? layerOf : null), partBoxes };
}
