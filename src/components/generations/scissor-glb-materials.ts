import * as THREE from 'three';

export const HAS_EMBEDDED_GLTF_MATERIAL = '__historyHasEmbeddedGltfMaterial';
/** Set on a mesh whose file declares that its materials are the real, finished
 * look of the piece (see AUTHORED_MATERIALS_MARK). */
export const HAS_AUTHORED_GLTF_MATERIAL = '__historyHasAuthoredGltfMaterial';

/** A GLB opts in with `asset.extras.formanovaMaterials: "authored"`. Hand-built
 * CAD deliveries carry real per-part materials (white gold next to black
 * rhodium, pink sapphires, pearls) and set this. Pipeline GLBs embed grey clay
 * and do not, so they keep getting the jewelry palette. */
const AUTHORED_MATERIALS_KEY = 'formanovaMaterials';
const AUTHORED_MATERIALS_MARK = 'authored';

interface GltfPrimitiveAssociation {
  meshes?: number;
  primitives?: number;
}

interface ParsedGltfMaterialMetadata {
  scene: THREE.Object3D;
  parser: {
    // three.js keys this by Texture | Material | Object3D, not Object3D
    // alone. get() is only ever called with a mesh, so a wider key type is
    // both accurate and safe.
    associations: Map<object, GltfPrimitiveAssociation>;
    json: {
      asset?: { extras?: unknown };
      meshes?: Array<{ primitives?: Array<{ material?: number }> }>;
    };
  };
}

const GEM_RE = /diamond|gem|stone|crystal|jewel|brill|ruby|emerald|sapphire|topaz|opal|garnet|amethyst|pearl|cz|cubic|solitaire|pave|prong_stone|accent_stone|center_stone|main_stone/i;
const METAL_RE = /band|ring|shank|prong|setting|mount|bezel|basket|gallery|shoulder|bridge|head|collet|metal|gold|silver|platinum|frame|base/i;

/** Taken from CADCanvas's REFERENCE_MATERIALS so a stone reads as the same
 * colour in history as it does in the Studio. The previous values were several
 * shades darker, which made every gem look like a different stone once the
 * design was opened. */
const GEM_COLORS: Array<[RegExp, number]> = [
  [/(?:^|[_\s.-])pink(?:$|[_\s.-])/i, 0xf4c6c6],
  [/(?:^|[_\s.-])red(?:$|[_\s.-])|ruby/i, 0xf26a8c],
  [/(?:^|[_\s.-])green(?:$|[_\s.-])|emerald/i, 0x46c684],
  [/(?:^|[_\s.-])blue(?:$|[_\s.-])|sapphire/i, 0x4f7ce0],
  [/(?:^|[_\s.-])purple(?:$|[_\s.-])|amethyst/i, 0xb488e2],
];

function fallbackGemColor(name: string): number {
  return GEM_COLORS.find(([pattern]) => pattern.test(name))?.[1] ?? 0x4f7ce0;
}

function declaresAuthoredMaterials(extras: unknown): boolean {
  return typeof extras === 'object' && extras !== null
    && (extras as Record<string, unknown>)[AUTHORED_MATERIALS_KEY] === AUTHORED_MATERIALS_MARK;
}

/** Record whether each mesh primitive had an explicit material in the GLTF
 * document, and whether the file declares those materials as authored. Both
 * are stored per mesh so they survive the scene clones the preview cache makes. */
export function markEmbeddedGltfMaterials(gltf: ParsedGltfMaterialMetadata): void {
  const authored = declaresAuthoredMaterials(gltf.parser.json.asset?.extras);
  gltf.scene.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const association = gltf.parser.associations.get(child);
    const primitive = association?.meshes === undefined || association.primitives === undefined
      ? undefined
      : gltf.parser.json.meshes?.[association.meshes]?.primitives?.[association.primitives];
    const embedded = primitive?.material !== undefined;
    child.userData[HAS_EMBEDDED_GLTF_MATERIAL] = embedded;
    child.userData[HAS_AUTHORED_GLTF_MATERIAL] = authored && embedded;
  });
}

// Glass windows (lockets, amulet frames) must stay see-through so whatever sits
// behind them shows; the gem fallback below is a mostly opaque blue.
const GLASS_RE = /glass|window/i;

export function createHistoryFallbackMaterial(meshName: string): THREE.Material {
  if (GLASS_RE.test(meshName)) {
    return new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      envMapIntensity: 1,
      side: THREE.DoubleSide,
    });
  }

  const isGem = GEM_RE.test(meshName) && !METAL_RE.test(meshName);

  if (isGem) {
    return new THREE.MeshPhysicalMaterial({
      color: fallbackGemColor(meshName),
      metalness: 0,
      roughness: 0.04,
      transmission: 0.22,
      thickness: 0.35,
      ior: 2.1,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      // CADCanvas REFERENCE_BASE_ENV.gem. Gems take far more environment than
      // metal, which is most of why a stone looked flat here.
      envMapIntensity: 2.3,
      side: THREE.DoubleSide,
    });
  }

  // Matches CADCanvas's gold18k reference material (0xffd88a at roughness
  // 0.08) so a ring looks the same in history as it does once opened in the
  // Studio. The previous darker, rougher gold read as a different metal.
  return new THREE.MeshStandardMaterial({
    color: 0xffd88a,
    metalness: 1,
    roughness: 0.08,
    // CADCanvas REFERENCE_BASE_ENV.metal.
    envMapIntensity: 1.15,
    side: THREE.DoubleSide,
  });
}

/** Preserve authored materials; add display-only fallbacks to materialless GLTF primitives.
 * `forceJewelryPalette` overrides embedded materials (pipeline GLBs embed grey
 * clay), except on a file that marks its materials as authored. */
export function applyHistoryPreviewMaterials(model: THREE.Object3D, forceJewelryPalette = false): void {
  model.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;

    const mesh = child as THREE.Mesh;
    const keepEmbedded = forceJewelryPalette
      ? mesh.userData[HAS_AUTHORED_GLTF_MATERIAL] === true
      : mesh.userData[HAS_EMBEDDED_GLTF_MATERIAL] === true;
    if (keepEmbedded) {
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((material) => material.clone())
        : mesh.material.clone();
      return;
    }

    mesh.material = createHistoryFallbackMaterial(mesh.name);
  });
}
