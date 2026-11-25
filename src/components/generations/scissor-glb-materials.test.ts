import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applyHistoryPreviewMaterials,
  markEmbeddedGltfMaterials,
} from './scissor-glb-materials';
import { JEWELRY_PRESETS } from '@/lib/jewelry-look';

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
    // Same gold as every viewer: the shared Blender-derived preset.
    expect(material.color.getHex()).toBe(JEWELRY_PRESETS.gold18k.color);
  });

  it('uses the explicit pink semantic for Top_CenterStone_Pink', () => {
    const model = new THREE.Group();
    const mesh = meshNamed('Top_CenterStone_Pink');
    model.add(mesh);

    applyHistoryPreviewMaterials(model);
    const material = mesh.material as THREE.MeshPhysicalMaterial;
    expect(material.metalness).toBeGreaterThan(0);
    expect(material.userData.jewelryPreset).toBe('pinkSapphire');
  });

  it('shows a gem without a color semantic as diamond', () => {
    const model = new THREE.Group();
    const mesh = meshNamed('CenterStone');
    model.add(mesh);

    applyHistoryPreviewMaterials(model);

    const material = mesh.material as THREE.MeshPhysicalMaterial;
    expect(material.userData.jewelryPreset).toBe('diamond');
    expect(material.clearcoat).toBe(1);
    expect(material.roughness).toBeLessThan(0.3);
  });

  it('preserves authored embedded material properties', () => {
    const authored = new THREE.MeshPhysicalMaterial({
      color: 0x123456,
      metalness: 0.35,
      roughness: 0.67,
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
  });

  it('uses the colored jewelry palette for version cards even when the GLB embeds grey clay', () => {
    const clay = new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0, roughness: 0.8 });
    const model = new THREE.Group();
    const mesh = meshNamed('Shank', clay);
    model.add(mesh);
    markEmbeddedGltfMaterials({
      scene: model,
      parser: {
        associations: new Map([[mesh, { meshes: 0, primitives: 0 }]]),
        json: { meshes: [{ primitives: [{ material: 0 }] }] },
      },
    });

    applyHistoryPreviewMaterials(model, true);

    const material = mesh.material as THREE.MeshStandardMaterial;
    expect(material.color.getHex()).toBe(JEWELRY_PRESETS.gold18k.color);
    expect(material.metalness).toBe(1);
  });

  it('keeps real materials on a forced-palette card when the file is marked as authored', () => {
    const blackRhodium = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, metalness: 1, roughness: 0.3 });
    const pinkSapphire = new THREE.MeshPhysicalMaterial({ color: 0xe86aa6, metalness: 0, roughness: 0.05 });
    const model = new THREE.Group();
    const hoop = meshNamed('gold_black_rhodium_pave_hoop_left', blackRhodium);
    const stone = meshNamed('stone_pink_sapphire_left', pinkSapphire);
    model.add(hoop, stone);
    markEmbeddedGltfMaterials({
      scene: model,
      parser: {
        associations: new Map([[hoop, { meshes: 0, primitives: 0 }], [stone, { meshes: 1, primitives: 0 }]]),
        json: {
          asset: { extras: { formanovaMaterials: 'authored' } },
          meshes: [{ primitives: [{ material: 0 }] }, { primitives: [{ material: 1 }] }],
        },
      },
    });

    applyHistoryPreviewMaterials(model, true);

    const hoopMaterial = hoop.material as THREE.MeshStandardMaterial;
    expect(hoopMaterial).not.toBe(blackRhodium);
    expect(hoopMaterial.color.getHex()).toBe(0x2a2a2e);
    expect(hoopMaterial.roughness).toBe(0.3);
    expect((stone.material as THREE.MeshPhysicalMaterial).color.getHex()).toBe(0xe86aa6);
  });

  it('still gives the palette to a part without a material in a file marked as authored', () => {
    const model = new THREE.Group();
    const mesh = meshNamed('Shank');
    model.add(mesh);
    markEmbeddedGltfMaterials({
      scene: model,
      parser: {
        associations: new Map([[mesh, { meshes: 0, primitives: 0 }]]),
        json: { asset: { extras: { formanovaMaterials: 'authored' } }, meshes: [{ primitives: [{}] }] },
      },
    });

    applyHistoryPreviewMaterials(model, true);

    expect((mesh.material as THREE.MeshStandardMaterial).color.getHex()).toBe(JEWELRY_PRESETS.gold18k.color);
  });

  it('ignores any other marker value and keeps forcing the palette', () => {
    for (const extras of [undefined, {}, { formanovaMaterials: 'clay' }, { formanovaMaterials: true }]) {
      const clay = new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0, roughness: 0.8 });
      const model = new THREE.Group();
      const mesh = meshNamed('Shank', clay);
      model.add(mesh);
      markEmbeddedGltfMaterials({
        scene: model,
        parser: {
          associations: new Map([[mesh, { meshes: 0, primitives: 0 }]]),
          json: { asset: { extras }, meshes: [{ primitives: [{ material: 0 }] }] },
        },
      });

      applyHistoryPreviewMaterials(model, true);

      expect((mesh.material as THREE.MeshStandardMaterial).color.getHex()).toBe(JEWELRY_PRESETS.gold18k.color);
    }
  });

  it('carries the authored mark through a scene clone, as the preview cache does', () => {
    const authored = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, metalness: 1, roughness: 0.3 });
    const model = new THREE.Group();
    const mesh = meshNamed('clasp_arm', authored);
    model.add(mesh);
    markEmbeddedGltfMaterials({
      scene: model,
      parser: {
        associations: new Map([[mesh, { meshes: 0, primitives: 0 }]]),
        json: { asset: { extras: { formanovaMaterials: 'authored' } }, meshes: [{ primitives: [{ material: 0 }] }] },
      },
    });

    const copy = model.clone(true);
    applyHistoryPreviewMaterials(copy, true);

    expect(((copy.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).color.getHex()).toBe(0x2a2a2e);
  });

  it('renders glass windows clear, not as a blue gem or gold', () => {
    for (const name of ['crystal_glass_window', 'glass.stl', 'locket_window']) {
      const model = new THREE.Group();
      const mesh = meshNamed(name);
      model.add(mesh);

      applyHistoryPreviewMaterials(model, true);

      const material = mesh.material as THREE.MeshPhysicalMaterial;
      expect(material.metalness).toBe(0);
      expect(material.transparent).toBe(true);
      expect(material.opacity).toBeLessThan(0.3);
      expect(material.transmission).toBe(0);
      expect(material.color.getHex()).toBe(0xffffff);
    }
  });
});

describe('applyHistoryPreviewMaterials with baked textures', () => {
  it('keeps a textured GLB (and its untextured accents) as authored under the jewelry palette', () => {
    const model = new THREE.Group();
    const tex = new THREE.Texture();
    tex.colorSpace = THREE.SRGBColorSpace;
    const silver = new THREE.MeshStandardMaterial({ map: tex, aoMap: new THREE.Texture(), normalMap: new THREE.Texture() });
    const body = meshNamed('bulldog_body', silver);
    const nose = meshNamed('nose', new THREE.MeshStandardMaterial({ color: 0x050505 }));
    body.userData.__historyHasEmbeddedGltfMaterial = true;
    nose.userData.__historyHasEmbeddedGltfMaterial = true;
    model.add(body, nose);

    applyHistoryPreviewMaterials(model, true);

    const kept = body.material as THREE.MeshStandardMaterial;
    expect(kept.map).toBe(tex);
    expect(kept.map?.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(kept.aoMap).not.toBeNull();
    expect(kept.normalMap).not.toBeNull();
    expect((nose.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0x050505);
  });
});
