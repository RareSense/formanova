import * as THREE from 'three';
import { loadCad } from '@/components/cad-to-catalog/engine/formats';
import { loadRhino3dm } from '@/components/cad-to-catalog/engine/rhino';
import { storesUnits, type CadReading } from './model';
import { CAD_EXTENSIONS, CadFileError, MAX_CAD_BYTES } from './files';

export { CAD_ACCEPT, CadFileError } from './files';

const extOf = (name: string) => name.toLowerCase().split('.').pop() ?? '';

/** Overall box of the surfaces in a Rhino file, from the surfaces themselves (works without display meshes). */
async function rhinoSize(file: File): Promise<[number, number, number] | null> {
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

/**
 * Opens a CAD file in the browser and measures it. Returns the reading for the
 * sheet and the 3D model for the views (empty when every part was saved
 * without a display mesh). Nothing is uploaded.
 */
export async function readCad(file: File): Promise<{ reading: CadReading; root: THREE.Object3D }> {
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
    size = (await rhinoSize(file)) ?? size;
  }
  if (!size) throw new CadFileError('No solid parts were found in this file.', 'unreadable');

  const shown = info.rhino ? [...info.rhino.objects.values()].filter((o) => !o.hidden) : [];
  let meshes = 0;
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++; });
  const layers = [...new Set(shown.map((o) => o.layer).filter(Boolean))];

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
  return { reading, root };
}
