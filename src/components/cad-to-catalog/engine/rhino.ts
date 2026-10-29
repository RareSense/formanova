// Reads a .3dm the way Rhino stores it (rhino3dm), so the model shows what
// Rhino shows: hidden objects and switched-off layers stay hidden, parts
// without a render material take Rhino's display colour, block instances get
// their own layer, colour and name, and curves / points / dimensions are dropped.

/* eslint-disable @typescript-eslint/no-explicit-any -- rhino3dm (loaded from three's CDN) ships no types */

import * as THREE from 'three';
import { THREE_CDN } from './formats';

export const RHINO_UNITS: Record<string, string> = {
  Millimeters: 'mm', Centimeters: 'cm', Meters: 'm', Inches: 'in', Feet: 'ft', Microns: 'um',
};

interface ObjectRecord {
  name: string;
  hidden: boolean;
  layer: string;
  fromParent: boolean;
  color: string;
}

export interface RhinoReport {
  noMesh: number;
  noMeshNames: string[];
  unitKey: string | null;
  objects: Map<string, ObjectRecord>;
  refOrder: (ObjectRecord & { blockName: string })[];
}

let rhinoPromise: Promise<any> | null = null;
function loadRhino3dm(): Promise<any> {
  rhinoPromise ||= new Promise((resolve, reject) => {
    const w = window as any;
    const start = () => w.rhino3dm({ locateFile: (f: string) => THREE_CDN + 'libs/rhino3dm/' + f }).then(resolve, reject);
    if (w.rhino3dm) { start(); return; } // a fresh copy after a crash
    const s = document.createElement('script');
    s.src = THREE_CDN + 'libs/rhino3dm/rhino3dm.js';
    s.onload = start;
    s.onerror = () => { rhinoPromise = null; reject(new Error('Could not load the Rhino reader')); };
    document.head.appendChild(s);
  });
  return rhinoPromise;
}

/** A file that crashes rhino3dm leaves its memory broken: the next file gets a fresh copy. */
export async function inspect3dm(buffer: ArrayBuffer): Promise<RhinoReport> {
  try {
    return await read3dm(buffer);
  } catch (e) {
    rhinoPromise = null;
    throw e;
  }
}

async function read3dm(buffer: ArrayBuffer): Promise<RhinoReport> {
  const rhino = await loadRhino3dm();
  const doc = rhino.File3dm.fromByteArray(new Uint8Array(buffer));
  if (!doc) throw new Error('not a readable Rhino file');
  const CS = rhino.ObjectColorSource;
  const hex = (c: { r: number; g: number; b: number }) => `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

  const layers: { name: string; id: string; parent: string; on: boolean; color: string; fullPath?: string; shown?: boolean }[] = [];
  const layerById = new Map<string, (typeof layers)[number]>();
  for (let i = 0; i < doc.layers().count; i++) {
    const L = doc.layers().get(i);
    const rec = { name: L.name, id: L.id, parent: L.parentLayerId, on: L.visible, color: hex(L.color) };
    layers.push(rec);
    layerById.set(rec.id, rec);
    L.delete();
  }
  for (const L of layers) {
    const path = [L.name];
    let shown = L.on;
    let p = layerById.get(L.parent);
    for (let guard = 0; p && guard < 64; guard++, p = layerById.get(p.parent)) { path.unshift(p.name); shown = shown && p.on; }
    L.fullPath = path.join(' :: ');
    L.shown = shown;
  }
  const materialColors: string[] = [];
  for (let i = 0; i < doc.materials().count; i++) {
    const m = doc.materials().get(i);
    materialColors.push(hex(m.diffuseColor));
    m.delete();
  }
  const idefs: { id: string; name: string }[] = [];
  for (let i = 0; i < doc.instanceDefinitions().count; i++) {
    const d = doc.instanceDefinitions().get(i);
    idefs.push({ id: d.id, name: d.name });
    d.delete();
  }

  let noMesh = 0;
  const noMeshNames: string[] = [];
  const objects = new Map<string, ObjectRecord>();
  const refs: (ObjectRecord & { idef: string })[] = [];
  const objs = doc.objects();
  for (let i = 0; i < objs.count; i++) {
    const o = objs.get(i);
    const g = o.geometry();
    const a = o.attributes();
    const layer = layers[a.layerIndex];
    const src = a.colorSource;
    const rec: ObjectRecord = {
      name: a.name || '',
      hidden: !a.visible || (layer ? !layer.shown : false),
      layer: layer?.fullPath || '',
      fromParent: src === CS.ColorFromParent,
      color: src === CS.ColorFromObject ? hex(a.objectColor)
        : src === CS.ColorFromMaterial && materialColors[a.materialIndex] ? materialColors[a.materialIndex]
          : layer?.color || '#bfbfbf',
    };
    objects.set(a.id, rec);
    if (g.objectType === rhino.ObjectType.InstanceReference) refs.push({ ...rec, idef: g.parentIdefId });
    if (g.objectType === rhino.ObjectType.Brep) {
      const faces = g.faces();
      let all = faces.count > 0;
      for (let f = 0; f < faces.count && all; f++) {
        const face = faces.get(f);
        const m = face.getMesh(rhino.MeshType.Any);
        if (m) m.delete(); else all = false;
        face.delete();
      }
      faces.delete();
      if (!all) { noMesh++; noMeshNames.push(rec.name || `Surface ${i + 1}`); }
    } else if (g.objectType === rhino.ObjectType.Extrusion) {
      const m = g.getMesh(rhino.MeshType.Any);
      if (m) m.delete(); else { noMesh++; noMeshNames.push(rec.name || `Surface ${i + 1}`); }
    }
    a.delete(); g.delete(); o.delete();
  }
  // The three.js loader adds block instances after everything else: for each
  // block definition in file order, its instances in file order.
  const refOrder = idefs.flatMap((d) => refs.filter((r) => r.idef === d.id).map((r) => ({ ...r, blockName: d.name })));
  const units = doc.settings().modelUnitSystem;
  const unitKey = Object.keys(RHINO_UNITS).find((k) => units === rhino.UnitSystem[k]) || null;
  doc.delete();
  return { noMesh, noMeshNames, unitKey, objects, refOrder };
}

/** Make the loaded model show what Rhino shows. Returns how many objects Rhino hides, per layer. */
export function matchRhino(obj: THREE.Object3D, rh: RhinoReport, showHidden: boolean) {
  const colorMats = new Map<string, THREE.Material>();
  const displayMaterial = (color: string) => {
    if (!colorMats.has(color)) colorMats.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0, side: THREE.DoubleSide, name: '' }));
    return colorMats.get(color)!;
  };
  const hiddenLayers = new Map<string, number>();
  let hidden = 0;
  const hide = (o: THREE.Object3D, rec: ObjectRecord) => { // true when taken out
    hidden++;
    const k = rec.layer || '(no layer)';
    hiddenLayers.set(k, (hiddenLayers.get(k) || 0) + 1);
    if (showHidden) return false;
    o.removeFromParent();
    return true;
  };
  const fix = (m: THREE.Mesh, rec: ObjectRecord, ref: ObjectRecord & { blockName: string } | null) => {
    m.visible = true;
    if ((m.material as THREE.Material)?.name === THREE.Loader.DEFAULT_MATERIAL_NAME) {
      m.material = displayMaterial(rec.fromParent && ref ? ref.color : rec.color);
    }
    if (!m.name && ref) m.name = ref.name || ref.blockName || '';
  };
  const blocks = obj.children.filter((c) => !c.userData.attributes);
  for (const c of obj.children.filter((x) => x.userData.attributes)) {
    if (!(c as THREE.Mesh).isMesh) { c.removeFromParent(); continue; }
    const rec = rh.objects.get(c.userData.attributes.id);
    if (!rec || (rec.hidden && hide(c, rec))) continue;
    fix(c as THREE.Mesh, rec, null);
  }
  if (blocks.length === rh.refOrder.length) {
    blocks.forEach((b, i) => {
      const ref = rh.refOrder[i];
      b.visible = true;
      if (ref.hidden && hide(b, ref)) return;
      b.name = ref.name || ref.blockName || '';
      for (const m of [...b.children]) {
        if (!(m as THREE.Mesh).isMesh) { m.removeFromParent(); continue; }
        const rec = rh.objects.get(m.userData.attributes?.id) || ref;
        if (rec.hidden && hide(m, rec)) continue;
        fix(m as THREE.Mesh, rec, ref);
      }
    });
  } else if (blocks.length) {
    console.warn(`3DM: ${blocks.length} block instances loaded but ${rh.refOrder.length} in the file; kept as loaded`);
  }
  return { hidden, hiddenLayers: [...hiddenLayers.entries()].map(([name, n]) => ({ name, n })) };
}
