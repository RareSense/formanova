// One loader per CAD format. Each returns the model as three.js objects plus
// what it learned about the file (units, up axis, warnings, hidden layers).

import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { Rhino3dmLoader } from 'three/examples/jsm/loaders/3DMLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { ext } from './package';
import { swapInMeshes, type PackedMeshes } from './fastpack';
import { inspect3dm, matchRhino, RHINO_UNITS, type RhinoReport } from './rhino';

export const THREE_CDN = `https://cdn.jsdelivr.net/npm/three@0.${THREE.REVISION}.1/examples/jsm/`;
const OCCT_CDN = 'https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/';
const BASE = 'pkg/'; // fake folder the loaders resolve a model's relative paths against
export const UNIT_SCALE: Record<string, number> = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8, um: 0.001 };
/** Above this a .3dm is opened through the toolkit's lossless fastload. */
export const FASTLOAD_ABOVE = 10e6;

export interface LoadInfo {
  format: string;
  units: string;
  upAxis: 'y' | 'z';
  warnings: string[];
  missing: string[];
  rhino?: RhinoReport;
  hidden: number;
  hiddenLayers: { name: string; n: number }[];
  fastload: boolean;
  rhinoMeshed: boolean;
}

export interface LoadOptions {
  /** Also load what the file keeps hidden (switched-off Rhino layers). */
  showHidden?: boolean;
  status?: (text: string) => void;
  /** Split a heavy .3dm on the server; null/undefined = open directly. */
  fastload?: ((data: ArrayBuffer) => Promise<{ skeleton: ArrayBuffer; meshes: PackedMeshes }>) | null;
  /** Mesh surfaces saved without render meshes (Rhino on a server); null = not available. */
  rhinoMesh?: ((data: ArrayBuffer) => Promise<ArrayBuffer>) | null;
}

// Resolves every file the model asks for (textures, .bin, .mtl) against the
// dropped files; a missing texture becomes a magenta checker and is reported.
function makeResolver(files: Map<string, File>) {
  const missing = new Set<string>();
  const urls: string[] = [];
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (/^(data|blob):/.test(url) || (/^https?:/.test(url) && !url.includes(BASE))) return url;
    let rel = decodeURIComponent(url.replace(/^.*?pkg\//, '')).replace(/\\/g, '/').replace(/^\.\//, '');
    if (/^https?:/.test(rel)) rel = rel.split('/').pop()!;
    const base = rel.split('/').pop()!.toLowerCase();
    const file = files.get(rel.toLowerCase()) || files.get(base);
    if (file) {
      const u = URL.createObjectURL(file);
      urls.push(u);
      return u;
    }
    missing.add(rel);
    return /\.(bin|mtl|gltf)$/i.test(base) ? url : CHECKER_URL();
  });
  return { manager, missing, dispose: () => urls.forEach((u) => URL.revokeObjectURL(u)) };
}
let checker = '';
const CHECKER_URL = () => {
  if (checker) return checker;
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#ff00ff' : '#200020'; g.fillRect(x, y, 1, 1); }
  return (checker = c.toDataURL('image/png'));
};

interface OcctMesh { name?: string; color?: number[]; attributes: { position: { array: number[] }; normal?: { array: number[] } }; index: { array: number[] } }
interface OcctNode { name?: string; meshes?: number[]; children?: OcctNode[] }
interface OcctResult { success: boolean; meshes: OcctMesh[]; root: OcctNode }
interface Occt { ReadStepFile(data: Uint8Array, params: Record<string, unknown>): OcctResult }
declare global { interface Window { occtimportjs?: (o: { locateFile: (f: string) => string }) => Promise<Occt> } }

let occtPromise: Promise<Occt> | null = null;
function loadOcct() {
  occtPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = OCCT_CDN + 'occt-import-js.js';
    s.onload = () => window.occtimportjs!({ locateFile: (f: string) => OCCT_CDN + f }).then(resolve, reject);
    s.onerror = () => { occtPromise = null; reject(new Error('Could not load the STEP reader')); };
    document.head.appendChild(s);
  });
  return occtPromise;
}

/** file: the CAD file; files: the files it may refer to, by lower-case name and path. */
export async function loadCad(file: File, files: Map<string, File>, opts: LoadOptions = {}) {
  const res = makeResolver(files);
  const info: LoadInfo = { format: ext(file.name), units: '', upAxis: 'y', warnings: [], missing: [], hidden: 0, hiddenLayers: [], fastload: false, rhinoMeshed: false };
  let root: THREE.Object3D;
  try {
    root = await loadByFormat(file, res.manager, info, opts);
  } finally {
    setTimeout(res.dispose, 60000); // textures load after parse; give them time before the URLs go
  }
  info.missing = [...res.missing];
  if (!info.units) info.units = 'mm';
  return { root, info };
}

async function load3dm(file: File, manager: THREE.LoadingManager, info: LoadInfo, opts: LoadOptions): Promise<THREE.Object3D> {
  let data = await file.arrayBuffer();
  let fast: { skeleton: ArrayBuffer; meshes: PackedMeshes } | null = null;
  if (data.byteLength > FASTLOAD_ABOVE && opts.fastload) {
    opts.status?.('Preparing a large file…');
    try {
      fast = await opts.fastload(data);
      data = fast.skeleton;
    } catch (e) {
      fast = null;
      info.warnings.push(`Large-file preparation failed, opening the file directly: ${(e as Error).message}`);
    }
  }
  let rh = await inspect3dm(data);
  if (rh.noMesh && opts.rhinoMesh && !fast) {
    opts.status?.(`Meshing ${rh.noMesh} surface(s) saved without a display mesh…`);
    try {
      data = await opts.rhinoMesh(data);
      rh = await inspect3dm(data);
      info.rhinoMeshed = true;
    } catch (e) {
      info.warnings.push(`Meshing in Rhino failed: ${(e as Error).message}`);
    }
  }
  info.rhino = rh;
  const loader = new Rhino3dmLoader(manager);
  loader.setLibraryPath(THREE_CDN + 'libs/rhino3dm/');
  const obj = await new Promise<THREE.Object3D>((ok, bad) => loader.parse(data, ok, bad));
  loader.dispose();
  if (fast && swapInMeshes(obj, fast.meshes) !== fast.meshes.byId.size) {
    // A mesh found no placeholder: never show a model with parts missing.
    info.warnings.push('Large-file preparation did not match this file; opened it directly');
    return load3dm(file, manager, info, { ...opts, fastload: null });
  }
  info.fastload = !!fast;
  Object.assign(info, matchRhino(obj, rh, !!opts.showHidden));
  const ux = rh.unitKey;
  if (ux && RHINO_UNITS[ux]) info.units = RHINO_UNITS[ux];
  info.upAxis = 'z';
  return obj;
}

async function loadByFormat(file: File, manager: THREE.LoadingManager, info: LoadInfo, opts: LoadOptions): Promise<THREE.Object3D> {
  const x = info.format;
  switch (x) {
    case '3dm':
      return load3dm(file, manager, info, opts);
    case 'glb':
    case 'gltf': {
      const loader = new GLTFLoader(manager);
      loader.setDRACOLoader(new DRACOLoader(manager).setDecoderPath(THREE_CDN + 'libs/draco/gltf/'));
      const data = x === 'glb' ? await file.arrayBuffer() : await file.text();
      const gltf = await new Promise<GLTF>((ok, bad) => loader.parse(data, BASE, ok, bad));
      info.units = 'm';
      return gltf.scene;
    }
    case 'obj': {
      const src = await file.text();
      const loader = new OBJLoader(manager);
      const lib = src.match(/^mtllib\s+(.+)$/m)?.[1]?.trim();
      if (lib) {
        try {
          const mtl = await new MTLLoader(manager).setResourcePath(BASE).loadAsync(BASE + lib);
          mtl.preload();
          loader.setMaterials(mtl);
        } catch {
          info.warnings.push(`Material file "${lib}" was not included; colours are lost`);
        }
      }
      return loader.parse(src);
    }
    case 'stl': {
      const geo = new STLLoader(manager).parse(await file.arrayBuffer()) as THREE.BufferGeometry & { hasColors?: boolean };
      info.upAxis = 'z';
      const mat = geo.hasColors
        ? new THREE.MeshStandardMaterial({ vertexColors: true, name: 'STL vertex colours' })
        : new THREE.MeshStandardMaterial({ color: 0xbfbfbf, name: '' });
      return wrap(new THREE.Mesh(geo, mat), file.name);
    }
    case 'ply': {
      const geo = new PLYLoader(manager).parse(await file.arrayBuffer());
      if (!geo.attributes.normal) geo.computeVertexNormals();
      info.upAxis = 'z';
      const mat = new THREE.MeshStandardMaterial({ vertexColors: !!geo.attributes.color, color: geo.attributes.color ? 0xffffff : 0xbfbfbf, name: '' });
      return wrap(new THREE.Mesh(geo, mat), file.name);
    }
    case 'step':
    case 'stp': {
      const occt = await loadOcct();
      const r = occt.ReadStepFile(new Uint8Array(await file.arrayBuffer()), {
        linearUnit: 'millimeter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.0005, angularDeflection: 0.2,
      });
      if (!r.success) throw new Error('the STEP file could not be read');
      info.units = 'mm';
      info.upAxis = 'z';
      return occtToThree(r);
    }
    default:
      throw new Error(`.${x} is not a CAD format this page opens (3DM, GLB, GLTF, STEP, OBJ, PLY, STL)`);
  }
}

function wrap(mesh: THREE.Mesh, name: string) {
  const g = new THREE.Group();
  mesh.name = name.replace(/\.[^.]+$/, '');
  mesh.userData.autoName = true;
  g.add(mesh);
  return g;
}

function occtToThree(r: OcctResult) {
  const root = new THREE.Group();
  const mats = new Map<string, THREE.Material>();
  const matFor = (rgb?: number[]) => {
    const key = rgb ? rgb.map((v) => v.toFixed(3)).join(',') : 'none';
    if (!mats.has(key)) {
      mats.set(key, new THREE.MeshStandardMaterial({
        color: rgb ? new THREE.Color(rgb[0], rgb[1], rgb[2]) : new THREE.Color(0xbfbfbf),
        name: rgb ? `STEP colour ${key}` : '',
      }));
    }
    return mats.get(key)!;
  };
  const build = (node: OcctNode, parent: THREE.Object3D) => {
    const g = new THREE.Group();
    g.name = node.name || '';
    parent.add(g);
    for (const mi of node.meshes || []) {
      const m = r.meshes[mi];
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(m.attributes.position.array, 3));
      if (m.attributes.normal) geo.setAttribute('normal', new THREE.Float32BufferAttribute(m.attributes.normal.array, 3));
      else geo.computeVertexNormals();
      geo.setIndex(new THREE.Uint32BufferAttribute(Uint32Array.from(m.index.array), 1));
      const mesh = new THREE.Mesh(geo, matFor(m.color));
      mesh.name = m.name || node.name || '';
      g.add(mesh);
    }
    for (const c of node.children || []) build(c, g);
  };
  build(r.root, root);
  return root;
}
