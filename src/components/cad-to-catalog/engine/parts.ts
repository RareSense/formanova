// Turns a loaded model into a list of parts, splits single-mesh files into
// their separate pieces, and sorts parts into metal / stone / other.

import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Choice } from './materials';

export type PartGroup = 'metal' | 'stone' | 'other';

export interface SourceMaterial {
  name: string;
  color: string;
  isDefault: boolean;
  transmission: number;
  opacity: number;
  ior: number | null;
  metalness: number | null;
}

export interface Part {
  id: string;
  mesh: THREE.Mesh;
  name: string;
  layer: string;
  source: SourceMaterial;
  group: PartGroup;
  kind?: string;
  maxDim?: number;
  choice: Choice | null;
}

/** One entry per set of identical pieces (12 pavé stones = one entry). */
export interface PartSet {
  key: string;
  name: string;
  ids: string[];
  group: PartGroup;
}

const STONE_WORDS = /(stone|gem|diamond|\bdia\b|\bdiam|\bcz\b|zircon|sapphire|ruby|emerald|moissanite|pav[eé]|melee|brilliant|\bround\b|\boval\b|\bpear\b|marquise|princess|cushion|baguette|crystal|amethyst|topaz|pearl|\brd\d)/i;
const METAL_WORDS = /(metal|gold|silver|platinum|\bpt\d*\b|band|shank|prong|claw|\bhead\b|setting|bezel|gallery|basket|\bring\b|bail|chain|clasp|\bpost\b|hoop|frame|\bwire\b|\b(9|10|14|18|22)k\b|rhodium|\bau\b)/i;
const DEFAULT_NAMES = new Set(['', 'default', 'Default', 'default_material', THREE.Loader.DEFAULT_MATERIAL_NAME]);

/** Split one mesh into its connected pieces; null when there is nothing to split. */
export function splitByConnectivity(mesh: THREE.Mesh, maxPieces = 4000): THREE.Mesh[] | null {
  const src = mesh.geometry;
  const pos = src.attributes.position;
  if (!pos || pos.count < 6) return null;
  const posOnly = new THREE.BufferGeometry();
  posOnly.setAttribute('position', pos);
  if (src.index) posOnly.setIndex(src.index);
  src.computeBoundingBox();
  const size = src.boundingBox!.getSize(new THREE.Vector3()).length();
  const welded = mergeVertices(posOnly, Math.max(size * 1e-6, 1e-7));
  const idx = welded.index!.array;
  const tris = idx.length / 3;
  const parent = new Int32Array(welded.attributes.position.count).map((_, i) => i);
  const find = (a: number) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const unite = (a: number, b: number) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  for (let t = 0; t < tris; t++) { unite(idx[3 * t], idx[3 * t + 1]); unite(idx[3 * t], idx[3 * t + 2]); }
  const compOf = new Map<number, number>();
  const triComp = new Int32Array(tris);
  for (let t = 0; t < tris; t++) {
    const r = find(idx[3 * t]);
    if (!compOf.has(r)) compOf.set(r, compOf.size);
    triComp[t] = compOf.get(r)!;
  }
  const n = compOf.size;
  if (n < 2 || n > maxPieces) return null;
  // Triangle order survives mergeVertices: triangle t of the welded mesh is triangle t of the original.
  const flat = src.index ? src.toNonIndexed() : src;
  const counts = new Int32Array(n);
  for (let t = 0; t < tris; t++) counts[triComp[t]]++;
  const names = Object.keys(flat.attributes);
  const bufs = [...Array(n)].map((_, c) => Object.fromEntries(names.map((k) => [k, new Float32Array(counts[c] * 3 * flat.attributes[k].itemSize)])));
  const fill = new Int32Array(n);
  for (let t = 0; t < tris; t++) {
    const c = triComp[t];
    for (const k of names) {
      const a = flat.attributes[k] as THREE.BufferAttribute, s = a.itemSize;
      bufs[c][k].set((a.array as Float32Array).subarray(3 * t * s, (3 * t + 3) * s), fill[c] * 3 * s);
    }
    fill[c]++;
  }
  return bufs.map((b, c) => {
    const g = new THREE.BufferGeometry();
    for (const k of names) g.setAttribute(k, new THREE.BufferAttribute(b[k], flat.attributes[k].itemSize, (flat.attributes[k] as THREE.BufferAttribute).normalized));
    const m = new THREE.Mesh(g, mesh.material);
    m.name = `${mesh.name || 'piece'} ${c + 1}`;
    m.userData.autoName = true;
    return m;
  });
}

export function describeMaterial(mat: THREE.Material | THREE.Material[]): SourceMaterial {
  const m = (Array.isArray(mat) ? mat[0] : mat) as THREE.MeshPhysicalMaterial;
  if (!m) return { name: '', color: '#bfbfbf', isDefault: true, transmission: 0, opacity: 1, ior: null, metalness: null };
  const hasMaps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'bumpMap', 'aoMap', 'emissiveMap', 'transmissionMap', 'alphaMap'].some((k) => m[k]);
  const name = m.name || '';
  return {
    name,
    color: m.color ? `#${m.color.getHexString(THREE.SRGBColorSpace)}` : '#bfbfbf',
    isDefault: DEFAULT_NAMES.has(name) && !hasMaps && !m.vertexColors,
    transmission: m.transmission || 0,
    opacity: m.transparent ? m.opacity : 1,
    ior: m.ior ?? null,
    metalness: m.metalness ?? null,
  };
}

/** layerOf(mesh) -> layer name or ''. */
export function collectParts(root: THREE.Object3D, layerOf: (m: THREE.Mesh) => string): Part[] {
  const parts: Part[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const id = `p${parts.length}`;
    mesh.userData.c2p = { id, sourceMaterial: mesh.material };
    parts.push({
      id, mesh,
      name: mesh.name || mesh.parent?.name || layerOf(mesh) || `Part ${parts.length + 1}`,
      layer: layerOf(mesh) || '',
      source: describeMaterial(mesh.material),
      group: 'other',
      choice: null,
    });
  });
  return parts;
}

// Identical stones share vertex count and surface area, whatever angle they sit at.
function signature(part: Part) {
  const g = part.mesh.geometry;
  if (!g.boundingSphere) g.computeBoundingSphere();
  const scale = part.mesh.getWorldScale(new THREE.Vector3());
  const sc = Math.abs(scale.x * scale.y * scale.z) ** (1 / 3);
  const pos = g.attributes.position, idx = g.index;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let area = 0;
  const tris = idx ? idx.count / 3 : pos.count / 3;
  for (let t = 0; t < tris; t++) {
    const i0 = idx ? idx.getX(3 * t) : 3 * t, i1 = idx ? idx.getX(3 * t + 1) : 3 * t + 1, i2 = idx ? idx.getX(3 * t + 2) : 3 * t + 2;
    a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
    area += b.sub(a).cross(c.sub(a)).length() / 2;
  }
  return { key: `${pos.count}|${(area * sc * sc).toPrecision(3)}`, maxDim: g.boundingSphere!.radius * 2 * sc };
}

/** Sorts parts into metal / stone / other (name, layer, file material, then shape) and groups identical ones. */
export function classify(parts: Part[], modelMaxDim: number): Map<string, Part[]> {
  const sigs = new Map<string, number>();
  for (const p of parts) {
    const s = signature(p);
    p.kind = s.key;
    p.maxDim = s.maxDim;
    sigs.set(s.key, (sigs.get(s.key) || 0) + 1);
  }
  for (const p of parts) {
    // Names made up from the file name ("ring 3") are not evidence; underscores separate words.
    const label = `${p.mesh.userData.autoName ? '' : p.name} ${p.layer} ${p.source.name}`.replace(/_/g, ' ');
    const stoneWord = STONE_WORDS.test(label), metalWord = METAL_WORDS.test(label);
    const src = p.source;
    if (stoneWord && !metalWord) p.group = 'stone';
    else if (metalWord && !stoneWord) p.group = 'metal';
    else if (src.transmission > 0.3 || src.opacity < 0.9 || (src.ior ?? 0) >= 1.7) p.group = 'stone';
    else if ((src.metalness ?? 0) >= 0.5 && !src.isDefault) p.group = 'metal';
    else if (sigs.get(p.kind!)! >= 3 && p.maxDim! < modelMaxDim * 0.2) p.group = 'stone';
    else if (p.maxDim! >= modelMaxDim * 0.3) p.group = 'metal';
    else p.group = 'other';
  }
  const kinds = new Map<string, Part[]>();
  for (const p of parts) {
    if (!kinds.has(p.kind!)) kinds.set(p.kind!, []);
    kinds.get(p.kind!)!.push(p);
  }
  return kinds;
}

/** One entry per set of identical pieces, metal first, then other, then stones. */
export function buildSets(kinds: Map<string, Part[]>): PartSet[] {
  const sets: PartSet[] = [];
  const strip = (n: string) => n.replace(/[\s_.-]*\d+$/, '') || n;
  for (const list of kinds.values()) {
    const names = new Set(list.map((p) => strip(p.name)));
    const name = list.length === 1 ? list[0].name : names.size === 1 ? [...names][0] : `${strip(list[0].name)} +`;
    sets.push({ key: list[0].kind!, name, ids: list.map((p) => p.id), group: list[0].group });
  }
  const order = { metal: 0, other: 1, stone: 2 };
  return sets.sort((a, b) => order[a.group] - order[b.group] || b.ids.length - a.ids.length);
}
