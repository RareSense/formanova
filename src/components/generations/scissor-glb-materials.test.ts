import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applyHistoryPreviewMaterials,
  markEmbeddedGltfMaterials,
} from './scissor-glb-materials';

function meshNamed(name: string, material = new THREE.MeshStandardMaterial()): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.name = name;
  return mesh;
}

describe('applyHistoryPreviewMaterials', () => {
  it('gives the materialless Shank a rich metallic fallback', () => {
    const model = new THREE.Group();
    const mesh = meshNamed('Shank');
    model.add(mesh);

    applyHistoryPreviewMaterials(model);

    const material = mesh.material as THREE.MeshStandardMaterial;
    expect(material.metalness).toBe(1);
    expect(material.roughness).toBeLessThan(0.4);
    expect(material.color.getHex()).toBe(0xc58b35);
  });

  it('uses the explicit pink semantic for Top_CenterStone_Pink', () => {
    const model = new THREE.Group();
    const mesh = meshNamed('Top_CenterStone_Pink');
    model.add(mesh);

    applyHistoryPreviewMaterials(model);

    const material = mesh.material as THREE.MeshPhysicalMaterial;
    expect(material.metalness).toBe(0);
    expect(material.transmission).toBeGreaterThan(0);
    expect(material.color.getHex()).toBe(0xb51f5d);
  });

  it('uses a visible blue fallback for a gem without a color semantic', () => {
    const model = new THREE.Group();
    const mesh = meshNamed('CenterStone');
    model.add(mesh);

    applyHistoryPreviewMaterials(model);

    const material = mesh.material as THREE.MeshPhysicalMaterial;
    expect(material.color.getHex()).toBe(0x2d78b7);
    expect(material.transmission).toBeGreaterThan(0);
    expect(material.roughness).toBeLessThan(0.3);
  });

  it('preserves authored embedded material properties', () => {
    const authored = new THREE.MeshPhysicalMaterial({
      color: 0x123456,
      metalness: 0.35,
      roughness: 0.67,
      transmission: 0.42,
    });
    const model = new THREE.Group();
    const mesh = meshNamed('Shank', authored);
    model.add(mesh);
    markEmbeddedGltfMaterials({
      scene: model,
      parser: {
        associations: new Map([[mesh, { meshes: 0, primitives: 0 }]]),
        json: { meshes: [{ primitives: [{ material: 0 }] }] },
      },
    });

    applyHistoryPreviewMaterials(model);

    const material = mesh.material as THREE.MeshPhysicalMaterial;
    expect(material).not.toBe(authored);
    expect(material.color.getHex()).toBe(0x123456);
    expect(material.metalness).toBe(0.35);
    expect(material.roughness).toBe(0.67);
    expect(material.transmission).toBe(0.42);
  });
});
