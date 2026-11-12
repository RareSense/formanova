import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { applyHistoryPreviewMaterials, markEmbeddedGltfMaterials } from './scissor-glb-materials';

/** A one-triangle GLB whose only mesh carries a dark, rough metal material. */
function buildGlb(assetExtras?: Record<string, unknown>): ArrayBuffer {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const json = {
    asset: { version: '2.0', ...(assetExtras ? { extras: assetExtras } : {}) },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'gold_black_rhodium_pave_hoop' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    materials: [{
      name: 'Gold_black_rhodium',
      pbrMetallicRoughness: { baseColorFactor: [0.02, 0.02, 0.03, 1], metallicFactor: 1, roughnessFactor: 0.3 },
    }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }],
    buffers: [{ byteLength: positions.byteLength }],
  };
  let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const padded = new Uint8Array(Math.ceil(jsonBytes.length / 4) * 4).fill(0x20);
  padded.set(jsonBytes);
  jsonBytes = padded;
  const bin = new Uint8Array(positions.buffer);
  const total = 12 + 8 + jsonBytes.length + 8 + bin.length;
  const out = new ArrayBuffer(total);
  const view = new DataView(out);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(out, 20, jsonBytes.length).set(jsonBytes);
  const binAt = 20 + jsonBytes.length;
  view.setUint32(binAt, bin.length, true);
  view.setUint32(binAt + 4, 0x004e4942, true);
  new Uint8Array(out, binAt + 8, bin.length).set(bin);
  return out;
}

async function loadForcedPaletteCard(glb: ArrayBuffer): Promise<THREE.MeshStandardMaterial> {
  const gltf = await new GLTFLoader().parseAsync(glb, '');
  markEmbeddedGltfMaterials(gltf);
  // The preview grid caches the scene and hands every card a clone.
  const model = gltf.scene.clone(true);
  applyHistoryPreviewMaterials(model, true);
  let found: THREE.Mesh | undefined;
  model.traverse((child) => { if ((child as THREE.Mesh).isMesh) found = child as THREE.Mesh; });
  return found!.material as THREE.MeshStandardMaterial;
}

describe('forced-palette cards, through the real GLTF loader', () => {
  it('shows gold on a GLB that does not mark its materials (unchanged behaviour)', async () => {
    const material = await loadForcedPaletteCard(buildGlb());
    expect(material.color.getHex()).toBe(0xffd88a);
  });

  it('keeps the file materials on a GLB marked formanovaMaterials: "authored"', async () => {
    const material = await loadForcedPaletteCard(buildGlb({ formanovaMaterials: 'authored' }));
    expect(material.name).toBe('Gold_black_rhodium');
    expect(material.metalness).toBe(1);
    expect(material.roughness).toBeCloseTo(0.3);
    expect(material.color.getHex()).not.toBe(0xffd88a);
  });
});
