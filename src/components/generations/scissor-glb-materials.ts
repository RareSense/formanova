import { modelHasTextureMaps } from '@/lib/gltf-texture-maps';
import * as THREE from 'three';
import { JEWELRY_PRESETS, blenderMetalRoughness, isStoneLayer, isFlatGemMaterial, isUsableFileMaterial, layerOf, makeJewelryMaterial, makeGemShaderMaterial, updateGemShaderMatrix, gemEntryStep, gemFamily, type JewelryPreset, pickGem, pickMetal, type PartHints } from '@/lib/jewelry-look';

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

const GEM_RE = /diamond|gem|stone|crystal|jewel|brill|ruby|emerald|sapphire|topaz|opal|garnet|amethyst|pearl|cz|cubic|solitaire|pave|prong_stone|accent_stone|center_stone|main_stone|padparad/i;
const METAL_RE = /band|ring|shank|prong|setting|mount|bezel|basket|gallery|shoulder|bridge|head|collet|metal|gold|silver|platinum|frame|base/i;

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

// Glass windows (lockets, amulet frames) must stay see-through so whatever sits behind them shows.
const GLASS_RE = /glass|window/i;

/** Display material for a part without an authored one, from the shared
 * jewelry-look presets (the same table the Studio and admin viewers use). */
export function createHistoryFallbackMaterial(
  meshName: string,
  hints: Omit<PartHints, 'objectName'> = {},
  stoneSize?: number,
  fileRoughness?: number | null,
): THREE.Material {
  const preset = JEWELRY_PRESETS[historyPresetKey(meshName, hints)];
  const look = preset.kind === 'metal' ? { ...preset, rough: blenderMetalRoughness(fileRoughness, preset.rough) } : preset;
  // Simple gems: three's transmission pass renders black in the scissor-split grid canvas.
  return makeJewelryMaterial(look, { stoneSize, simpleGem: true });
}

export function historyPresetKey(meshName: string, hints: Omit<PartHints, 'objectName'> = {}): string {
  const all = { ...hints, objectName: meshName };
  if (GLASS_RE.test(meshName)) return 'clearGlass';
  const text = `${hints.materialName ?? ''} ${meshName}`;
  const isGem = isStoneLayer(hints.layer) || (GEM_RE.test(text) && !METAL_RE.test(meshName));
  return isGem ? pickGem(all) : pickMetal(all);
}

/** Preserve authored materials; add display-only fallbacks to materialless GLTF primitives.
 * `forceJewelryPalette` overrides embedded materials (pipeline GLBs embed grey
 * clay), except on a file that marks its materials as authored. */
/** three's transmission pass draws black in this scissor-split canvas, so a
 * baked see-through stone keeps its colour but is drawn as the Simple gem:
 * mirror-like solid with a little self-light. */
function solidForScissor(material: THREE.Material): THREE.Material {
  const m = material as THREE.MeshPhysicalMaterial;
  if (!m.isMeshPhysicalMaterial || !(m.transmission > 0)) return material;
  const tint = m.attenuationColor && m.attenuationDistance < Infinity ? m.attenuationColor.clone() : m.color.clone();
  m.transmission = 0;
  m.color.copy(tint);
  m.metalness = 0.55;
  m.roughness = Math.min(m.roughness, 0.02);
  m.clearcoat = 1;
  m.emissive.copy(tint);
  m.emissiveIntensity = 0.35;
  return m;
}

/** `_forceJewelryPalette` is kept for callers; the rule is now the same everywhere. */
export interface HistoryGemShader {
  /** Raw studio equirect (createStudioLight().gemRaw). */
  env: THREE.Texture;
  /** Piece size in world units after the card's fit (sets the shader's entry step). */
  pieceSize: number;
}

/** A stone drawn with the shared refraction shader; identical stones share one material. */
function gemShaderFor(mesh: THREE.Mesh, spec: Pick<JewelryPreset, 'color' | 'atten' | 'ior' | 'disp'> & { label?: string }, gem: HistoryGemShader, cache: Map<string, THREE.Material>): THREE.Material {
  const key = `${mesh.geometry.uuid}|${spec.color}|${spec.atten}|${spec.ior}`;
  let m = cache.get(key);
  if (!m) { m = makeGemShaderMaterial(mesh.geometry, gem.env, spec, gemEntryStep(gem.pieceSize)); cache.set(key, m); }
  mesh.onBeforeRender = (_r, _s, _c, _g, mat) => updateGemShaderMatrix(mesh, mat);
  return m;
}

export function applyHistoryPreviewMaterials(model: THREE.Object3D, _forceJewelryPalette = false, gem?: HistoryGemShader): void {
  const gemCache = new Map<string, THREE.Material>();
  // Baked textures mean the file is authored even without the extras mark.
  const textured: THREE.Material[] = [];
  model.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh && mesh.userData[HAS_EMBEDDED_GLTF_MATERIAL] === true) {
      textured.push(...(Array.isArray(mesh.material) ? mesh.material : [mesh.material]));
    }
  });
  const authoredTextures = modelHasTextureMaps(textured);
  model.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;

    const mesh = child as THREE.Mesh;
    // One rule for every viewer (jewelry-look resolvePartLook): a real baked
    // material is shown as authored; a missing or placeholder one (grey clay,
    // "Material", wax) falls back to the shared preset picker.
    const embedded = mesh.userData[HAS_EMBEDDED_GLTF_MATERIAL] === true;
    const first = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const keepEmbedded = (mesh.userData[HAS_AUTHORED_GLTF_MATERIAL] === true && !isFlatGemMaterial(first))
      || (embedded && (authoredTextures || isUsableFileMaterial(first)));
    if (keepEmbedded) {
      const fm = first as THREE.MeshPhysicalMaterial;
      if (gem && !Array.isArray(mesh.material) && fm?.isMeshPhysicalMaterial && fm.transmission > 0 && !GLASS_RE.test(`${fm.name} ${mesh.name}`)) {
        const fam = gemFamily(fm.name) ?? gemFamily(mesh.name);
        const preset = fam ? JEWELRY_PRESETS[pickGem({ materialName: fm.name, objectName: mesh.name, layer: layerOf(mesh) })] : undefined;
        const tint = (fm.attenuationDistance < Infinity ? fm.attenuationColor : fm.color).getHex();
        mesh.material = gemShaderFor(mesh, { label: fm.name, color: tint, atten: tint, ior: fm.ior, disp: preset?.disp }, gem, gemCache);
        return;
      }
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((material) => solidForScissor(material.clone()))
        : solidForScissor(mesh.material.clone());
      return;
    }

    const original = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    mesh.geometry.computeBoundingBox();
    const size = mesh.geometry.boundingBox?.getSize(new THREE.Vector3());
    const key = historyPresetKey(mesh.name, { materialName: mesh.userData[HAS_EMBEDDED_GLTF_MATERIAL] === true ? original?.name : null, layer: layerOf(mesh) });
    const preset = JEWELRY_PRESETS[key];
    if (gem && preset.kind === 'gem' && !preset.dark) {
      mesh.material = gemShaderFor(mesh, preset, gem, gemCache);
      return;
    }
    mesh.material = createHistoryFallbackMaterial(
      mesh.name,
      { materialName: mesh.userData[HAS_EMBEDDED_GLTF_MATERIAL] === true ? original?.name : null, layer: layerOf(mesh) },
      size ? Math.max((size.x + size.y + size.z) / 3, 1e-4) : undefined,
      mesh.userData[HAS_EMBEDDED_GLTF_MATERIAL] === true ? (original as THREE.MeshStandardMaterial)?.roughness : null,
    );
  });
}
