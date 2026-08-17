import * as THREE from 'three';

export const HAS_EMBEDDED_GLTF_MATERIAL = '__historyHasEmbeddedGltfMaterial';

interface GltfPrimitiveAssociation {
  meshes?: number;
  primitives?: number;
}

interface ParsedGltfMaterialMetadata {
  scene: THREE.Object3D;
  parser: {
    associations: Map<THREE.Object3D, GltfPrimitiveAssociation>;
    json: {
      meshes?: Array<{ primitives?: Array<{ material?: number }> }>;
    };
  };
}

const GEM_RE = /diamond|gem|stone|crystal|jewel|brill|ruby|emerald|sapphire|topaz|opal|garnet|amethyst|pearl|cz|cubic|solitaire|pave|prong_stone|accent_stone|center_stone|main_stone/i;
const METAL_RE = /band|ring|shank|prong|setting|mount|bezel|basket|gallery|shoulder|bridge|head|collet|metal|gold|silver|platinum|frame|base/i;

const GEM_COLORS: Array<[RegExp, number]> = [
  [/(?:^|[_\s.-])pink(?:$|[_\s.-])/i, 0xb51f5d],
  [/(?:^|[_\s.-])red(?:$|[_\s.-])|ruby/i, 0x9d1535],
  [/(?:^|[_\s.-])green(?:$|[_\s.-])|emerald/i, 0x087f5b],
  [/(?:^|[_\s.-])blue(?:$|[_\s.-])|sapphire/i, 0x1858a8],
  [/(?:^|[_\s.-])purple(?:$|[_\s.-])|amethyst/i, 0x6f3aa8],
];

function fallbackGemColor(name: string): number {
  return GEM_COLORS.find(([pattern]) => pattern.test(name))?.[1] ?? 0x2d78b7;
}

/** Record whether each mesh primitive had an explicit material in the GLTF document. */
export function markEmbeddedGltfMaterials(gltf: ParsedGltfMaterialMetadata): void {
  gltf.scene.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const association = gltf.parser.associations.get(child);
    const primitive = association?.meshes === undefined || association.primitives === undefined
      ? undefined
      : gltf.parser.json.meshes?.[association.meshes]?.primitives?.[association.primitives];
    child.userData[HAS_EMBEDDED_GLTF_MATERIAL] = primitive?.material !== undefined;
  });
}

export function createHistoryFallbackMaterial(meshName: string): THREE.Material {
  const isGem = GEM_RE.test(meshName) && !METAL_RE.test(meshName);

  if (isGem) {
    return new THREE.MeshPhysicalMaterial({
      color: fallbackGemColor(meshName),
      metalness: 0,
      roughness: 0.14,
      transmission: 0.22,
      thickness: 0.35,
      ior: 2.1,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.35,
      side: THREE.DoubleSide,
    });
  }

  return new THREE.MeshStandardMaterial({
    color: 0xc58b35,
    metalness: 1,
    roughness: 0.24,
    envMapIntensity: 1.15,
    side: THREE.DoubleSide,
  });
}

/** Preserve authored materials; add display-only fallbacks to materialless GLTF primitives. */
export function applyHistoryPreviewMaterials(model: THREE.Object3D): void {
  model.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;

    const mesh = child as THREE.Mesh;
    if (mesh.userData[HAS_EMBEDDED_GLTF_MATERIAL] === true) {
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((material) => material.clone())
        : mesh.material.clone();
      return;
    }

    mesh.material = createHistoryFallbackMaterial(mesh.name);
  });
}
