import * as THREE from "three";

// ── Refraction config for gemstones (used by MeshRefractionMaterial overlay) ──
export interface GemRefractionConfig {
  color: string;
  ior: number;
  sparkle: number;       // aberrationStrength
  brightness: number;    // envMapIntensity
  bounces: number;
  fresnel: number;
}

export const DIAMOND_DEFAULTS: GemRefractionConfig = {
  color: "#ffffff",
  ior: 2.42,
  sparkle: 0.015,
  brightness: 3.0,
  bounces: 5,
  fresnel: 0.9,
};

export const GEM_REFRACTION_CONFIGS: Record<string, GemRefractionConfig> = {
  diamond:        { color: "#ffffff", ior: 2.42, sparkle: 0.015, brightness: 3.0, bounces: 5, fresnel: 0.9 },
  ruby:           { color: "#e31b23", ior: 1.77, sparkle: 0.015, brightness: 3.0, bounces: 5, fresnel: 0.9 },
  sapphire:       { color: "#0f52ba", ior: 1.77, sparkle: 0.015, brightness: 3.0, bounces: 5, fresnel: 0.9 },
  emerald:        { color: "#50c878", ior: 1.58, sparkle: 0.015, brightness: 3.0, bounces: 5, fresnel: 0.9 },
  "black-diamond": { color: "#1a1a2e", ior: 2.42, sparkle: 0.015, brightness: 3.0, bounces: 5, fresnel: 0.9 },
  amethyst:       { color: "#9966cc", ior: 1.54, sparkle: 0.015, brightness: 3.0, bounces: 5, fresnel: 0.9 },
  topaz:          { color: "#ffc87c", ior: 1.64, sparkle: 0.015, brightness: 3.0, bounces: 5, fresnel: 0.9 },
  aquamarine:     { color: "#7fffd4", ior: 1.57, sparkle: 0.015, brightness: 3.0, bounces: 5, fresnel: 0.9 },
};

// ── Structured Material System ──

export type MaterialType = "gold" | "silver" | "platinum" | "titanium" | "copper" | "brass" | "rhodium";
export type MaterialAlloy = "yellow" | "rose" | "white" | "black" | "natural";
export type MaterialFinish = "polished" | "brushed" | "matte" | "satin";

export interface MaterialDef {
  id: string;
  name: string;
  category: "metal" | "gemstone";
  type?: MaterialType;
  alloy?: MaterialAlloy;
  finish?: MaterialFinish;
  preview: string;
  /** For gemstones, refraction config used by MeshRefractionMaterial overlay */
  refractionConfig?: GemRefractionConfig;
  create: () => THREE.MeshPhysicalMaterial;
}

// ── Available options for UI selectors ──
export const MATERIAL_TYPES: { id: MaterialType; label: string }[] = [
  { id: "gold", label: "Gold" },
  { id: "silver", label: "Silver" },
  { id: "platinum", label: "Platinum" },
  { id: "titanium", label: "Titanium" },
  { id: "copper", label: "Copper" },
  { id: "brass", label: "Brass" },
  { id: "rhodium", label: "Rhodium" },
];

export const MATERIAL_ALLOYS: { id: MaterialAlloy; label: string }[] = [
  { id: "natural", label: "Natural" },
  { id: "yellow", label: "Yellow" },
  { id: "rose", label: "Rose" },
  { id: "white", label: "White" },
  { id: "black", label: "Black" },
];

export const MATERIAL_FINISHES: { id: MaterialFinish; label: string }[] = [
  { id: "polished", label: "Polished" },
  { id: "brushed", label: "Brushed" },
  { id: "matte", label: "Matte" },
  { id: "satin", label: "Satin" },
];


// Base metal colors per type + alloy
// Roughness, clearcoat, clearcoatRoughness are per-metal reference values (polished baseline)
// extracted from reference renderer to match exact visual output.
interface MetalBase {
  color: number;
  envMapIntensity: number;
  reflectivity: number;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
}

function getMetalBase(type: MaterialType, alloy: MaterialAlloy): MetalBase {
  const bases: Record<MaterialType, Partial<Record<MaterialAlloy, MetalBase>>> = {
    gold: {
      yellow:  { color: 0xFFD700, envMapIntensity: 1.5, reflectivity: 1.0, roughness: 0.15, clearcoat: 0.3, clearcoatRoughness: 0.1 },
      rose:    { color: 0xb76e79, envMapIntensity: 1.5, reflectivity: 1.0, roughness: 0.15, clearcoat: 0.3, clearcoatRoughness: 0.1 },
      white:   { color: 0xe8e8e8, envMapIntensity: 1.8, reflectivity: 1.0, roughness: 0.12, clearcoat: 0.4, clearcoatRoughness: 0.08 },
      natural: { color: 0xFFD700, envMapIntensity: 1.5, reflectivity: 1.0, roughness: 0.15, clearcoat: 0.3, clearcoatRoughness: 0.1 },
    },
    silver: {
      natural: { color: 0xC0C0C0, envMapIntensity: 1.8, reflectivity: 1.0, roughness: 0.1, clearcoat: 0.5, clearcoatRoughness: 0.05 },
    },
    platinum: {
      natural: { color: 0xe5e4e2, envMapIntensity: 1.9, reflectivity: 1.0, roughness: 0.1, clearcoat: 0.5, clearcoatRoughness: 0.05 },
    },
    titanium: {
      natural: { color: 0x878681, envMapIntensity: 1.6, reflectivity: 1.0, roughness: 0.15, clearcoat: 0.3, clearcoatRoughness: 0.1 },
      black:   { color: 0x2a2a2a, envMapIntensity: 1.8, reflectivity: 1.0, roughness: 0.12, clearcoat: 0.4, clearcoatRoughness: 0.08 },
    },
    copper: {
      natural: { color: 0xb87333, envMapIntensity: 1.5, reflectivity: 1.0, roughness: 0.15, clearcoat: 0.3, clearcoatRoughness: 0.1 },
    },
    brass: {
      natural: { color: 0xd4af37, envMapIntensity: 1.7, reflectivity: 1.0, roughness: 0.15, clearcoat: 0.3, clearcoatRoughness: 0.1 },
    },
    rhodium: {
      natural: { color: 0xe0e0e0, envMapIntensity: 2.0, reflectivity: 1.0, roughness: 0.1, clearcoat: 0.5, clearcoatRoughness: 0.05 },
      black:   { color: 0x2a2a2a, envMapIntensity: 2.0, reflectivity: 1.0, roughness: 0.1, clearcoat: 0.5, clearcoatRoughness: 0.05 },
    },
  };

  const typeMap = bases[type] ?? {};
  return typeMap[alloy] ?? typeMap["natural"] ?? { color: 0xc0c0c0, envMapIntensity: 1.5, reflectivity: 1.0, roughness: 0.15, clearcoat: 0.3, clearcoatRoughness: 0.1 };
}

// Finish multipliers relative to the per-metal polished baseline
function finishRoughnessMultiplier(finish: MaterialFinish): number {
  switch (finish) {
    case "polished": return 1.0;
    case "satin": return 1.5;
    case "brushed": return 2.5;
    case "matte": return 3.5;
  }
}

function finishClearcoatMultiplier(finish: MaterialFinish): number {
  switch (finish) {
    case "polished": return 1.0;
    case "satin": return 0.5;
    case "brushed": return 0.15;
    case "matte": return 0.0;
  }
}

// Generate a metal material from structured attributes
// Uses per-metal base values from reference renderer, scaled by finish
export function createMetalMaterial(type: MaterialType, alloy: MaterialAlloy, finish: MaterialFinish): THREE.MeshPhysicalMaterial {
  const base = getMetalBase(type, alloy);
  const roughness = Math.min(base.roughness * finishRoughnessMultiplier(finish), 0.7);
  const clearcoat = base.clearcoat * finishClearcoatMultiplier(finish);
  const clearcoatRoughness = base.clearcoatRoughness * finishRoughnessMultiplier(finish);
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(base.color),
    metalness: 1.0,
    roughness,
    envMapIntensity: base.envMapIntensity,
    clearcoat,
    clearcoatRoughness: Math.min(clearcoatRoughness, 0.5),
    reflectivity: base.reflectivity,
  });
}

// Compose display name from attributes
export function composeMaterialName(type: MaterialType, alloy: MaterialAlloy, finish: MaterialFinish): string {
  const parts: string[] = [];
  if (finish !== "polished") parts.push(MATERIAL_FINISHES.find(f => f.id === finish)?.label ?? finish);
  if (alloy !== "natural") parts.push(MATERIAL_ALLOYS.find(a => a.id === alloy)?.label ?? alloy);
  parts.push(MATERIAL_TYPES.find(t => t.id === type)?.label ?? type);
  return parts.join(" ");
}

// Compose a preview gradient
function metalPreview(type: MaterialType, alloy: MaterialAlloy): string {
  const base = getMetalBase(type, alloy);
  const hex = `#${base.color.toString(16).padStart(6, "0")}`;
  const lighter = lightenHex(hex, 30);
  return `linear-gradient(135deg, ${hex}, ${lighter})`;
}

function lightenHex(hex: string, pct: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + pct);
  const g = Math.min(255, ((num >> 8) & 0xff) + pct);
  const b = Math.min(255, (num & 0xff) + pct);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

// ── Pre-built Material Library (backward-compatible) ──
export const MATERIAL_LIBRARY: MaterialDef[] = [
  // ── Metals — structured ──
  { id: "gold-yellow-polished", name: "Yellow Gold", category: "metal", type: "gold", alloy: "yellow", finish: "polished",
    preview: metalPreview("gold", "yellow"),
    create: () => createMetalMaterial("gold", "yellow", "polished") },
  { id: "gold-rose-polished", name: "Rose Gold", category: "metal", type: "gold", alloy: "rose", finish: "polished",
    preview: metalPreview("gold", "rose"),
    create: () => createMetalMaterial("gold", "rose", "polished") },
  { id: "gold-white-polished", name: "White Gold", category: "metal", type: "gold", alloy: "white", finish: "polished",
    preview: metalPreview("gold", "white"),
    create: () => createMetalMaterial("gold", "white", "polished") },
  { id: "gold-yellow-brushed", name: "Brushed Gold", category: "metal", type: "gold", alloy: "yellow", finish: "brushed",
    preview: metalPreview("gold", "yellow"),
    create: () => createMetalMaterial("gold", "yellow", "brushed") },
  { id: "gold-yellow-satin", name: "Satin Gold", category: "metal", type: "gold", alloy: "yellow", finish: "satin",
    preview: metalPreview("gold", "yellow"),
    create: () => createMetalMaterial("gold", "yellow", "satin") },
  { id: "gold-yellow-matte", name: "Matte Gold", category: "metal", type: "gold", alloy: "yellow", finish: "matte",
    preview: metalPreview("gold", "yellow"),
    create: () => createMetalMaterial("gold", "yellow", "matte") },
  { id: "platinum-natural-polished", name: "Platinum", category: "metal", type: "platinum", alloy: "natural", finish: "polished",
    preview: metalPreview("platinum", "natural"),
    create: () => createMetalMaterial("platinum", "natural", "polished") },
  { id: "silver-natural-polished", name: "Sterling Silver", category: "metal", type: "silver", alloy: "natural", finish: "polished",
    preview: metalPreview("silver", "natural"),
    create: () => createMetalMaterial("silver", "natural", "polished") },
  { id: "silver-natural-brushed", name: "Brushed Silver", category: "metal", type: "silver", alloy: "natural", finish: "brushed",
    preview: metalPreview("silver", "natural"),
    create: () => createMetalMaterial("silver", "natural", "brushed") },
  { id: "rhodium-black-polished", name: "Black Rhodium", category: "metal", type: "rhodium", alloy: "black", finish: "polished",
    preview: metalPreview("rhodium", "black"),
    create: () => createMetalMaterial("rhodium", "black", "polished") },
  { id: "rhodium-natural-polished", name: "Rhodium", category: "metal", type: "rhodium", alloy: "natural", finish: "polished",
    preview: metalPreview("rhodium", "natural"),
    create: () => createMetalMaterial("rhodium", "natural", "polished") },
  { id: "copper-natural-polished", name: "Copper", category: "metal", type: "copper", alloy: "natural", finish: "polished",
    preview: metalPreview("copper", "natural"),
    create: () => createMetalMaterial("copper", "natural", "polished") },
  { id: "brass-natural-polished", name: "Brass", category: "metal", type: "brass", alloy: "natural", finish: "polished",
    preview: metalPreview("brass", "natural"),
    create: () => createMetalMaterial("brass", "natural", "polished") },
  { id: "titanium-natural-polished", name: "Titanium", category: "metal", type: "titanium", alloy: "natural", finish: "polished",
    preview: metalPreview("titanium", "natural"),
    create: () => createMetalMaterial("titanium", "natural", "polished") },
  { id: "titanium-black-polished", name: "Black Titanium", category: "metal", type: "titanium", alloy: "black", finish: "polished",
    preview: metalPreview("titanium", "black"),
    create: () => createMetalMaterial("titanium", "black", "polished") },

  // ── Gemstones — with refraction config for MeshRefractionMaterial overlay ──
  {
    id: "diamond", name: "Diamond", category: "gemstone",
    preview: "linear-gradient(135deg, #e8f4ff, #ffffff)",
    refractionConfig: GEM_REFRACTION_CONFIGS.diamond,
    create: () => new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xffffff), metalness: 0.0, roughness: 0.0,
      transmission: 1.0, ior: 2.42, thickness: 2.5, envMapIntensity: 3.0,
      clearcoat: 1.0, clearcoatRoughness: 0.0,
      attenuationDistance: 4.5, attenuationColor: new THREE.Color(0xffffff),
      side: THREE.DoubleSide,
    }),
  },
  {
    id: "ruby", name: "Ruby", category: "gemstone",
    preview: "linear-gradient(135deg, #9b111e, #e0115f)",
    refractionConfig: GEM_REFRACTION_CONFIGS.ruby,
    create: () => new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xe0115f), metalness: 0.0, roughness: 0.0,
      transmission: 1.0, ior: 1.77, thickness: 2.0, envMapIntensity: 2.5,
      clearcoat: 1.0, clearcoatRoughness: 0.0,
      attenuationDistance: 3.0, attenuationColor: new THREE.Color(0x9b111e),
      side: THREE.DoubleSide,
    }),
  },
  {
    id: "emerald", name: "Emerald", category: "gemstone",
    preview: "linear-gradient(135deg, #046307, #50c878)",
    refractionConfig: GEM_REFRACTION_CONFIGS.emerald,
    create: () => new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0x50c878), metalness: 0.0, roughness: 0.0,
      transmission: 1.0, ior: 1.58, thickness: 2.0, envMapIntensity: 2.5,
      clearcoat: 1.0, clearcoatRoughness: 0.0,
      attenuationDistance: 3.0, attenuationColor: new THREE.Color(0x046307),
      side: THREE.DoubleSide,
    }),
  },
  {
    id: "sapphire", name: "Sapphire", category: "gemstone",
    preview: "linear-gradient(135deg, #0f52ba, #6593f5)",
    refractionConfig: GEM_REFRACTION_CONFIGS.sapphire,
    create: () => new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0x6593f5), metalness: 0.0, roughness: 0.0,
      transmission: 1.0, ior: 1.77, thickness: 2.0, envMapIntensity: 2.5,
      clearcoat: 1.0, clearcoatRoughness: 0.0,
      attenuationDistance: 3.0, attenuationColor: new THREE.Color(0x0f52ba),
      side: THREE.DoubleSide,
    }),
  },
  {
    id: "black-diamond", name: "Black Diamond", category: "gemstone",
    preview: "linear-gradient(135deg, #0a0a0a, #333344)",
    refractionConfig: GEM_REFRACTION_CONFIGS["black-diamond"],
    create: () => new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0x1a1a2e), metalness: 0.3, roughness: 0.05,
      transmission: 0.4, ior: 2.42, thickness: 1.5, envMapIntensity: 2.0,
      clearcoat: 1.0, clearcoatRoughness: 0.0,
      attenuationDistance: 2.0, attenuationColor: new THREE.Color(0x0a0a0a),
      side: THREE.DoubleSide,
    }),
  },
  {
    id: "amethyst", name: "Amethyst", category: "gemstone",
    preview: "linear-gradient(135deg, #6b3fa0, #9966cc)",
    refractionConfig: GEM_REFRACTION_CONFIGS.amethyst,
    create: () => new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0x9966cc), metalness: 0.0, roughness: 0.0,
      transmission: 1.0, ior: 1.54, thickness: 2.0, envMapIntensity: 2.5,
      clearcoat: 1.0, clearcoatRoughness: 0.0,
      attenuationDistance: 3.5, attenuationColor: new THREE.Color(0x6b3fa0),
      side: THREE.DoubleSide,
    }),
  },
  {
    id: "topaz", name: "Topaz", category: "gemstone",
    preview: "linear-gradient(135deg, #ffc87c, #ffe4b5)",
    refractionConfig: GEM_REFRACTION_CONFIGS.topaz,
    create: () => new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xffc87c), metalness: 0.0, roughness: 0.0,
      transmission: 1.0, ior: 1.64, thickness: 2.0, envMapIntensity: 2.5,
      clearcoat: 1.0, clearcoatRoughness: 0.0,
      attenuationDistance: 3.5, attenuationColor: new THREE.Color(0xffc87c),
      side: THREE.DoubleSide,
    }),
  },
  {
    id: "aquamarine", name: "Aquamarine", category: "gemstone",
    preview: "linear-gradient(135deg, #7fffd4, #b2fff0)",
    refractionConfig: GEM_REFRACTION_CONFIGS.aquamarine,
    create: () => new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0x7fffd4), metalness: 0.0, roughness: 0.0,
      transmission: 1.0, ior: 1.57, thickness: 2.0, envMapIntensity: 2.5,
      clearcoat: 1.0, clearcoatRoughness: 0.0,
      attenuationDistance: 4.0, attenuationColor: new THREE.Color(0x7fffd4),
      side: THREE.DoubleSide,
    }),
  },
];

// ── Legacy ID mapping for backward compat ──
const LEGACY_ID_MAP: Record<string, string> = {
  "yellow-gold": "gold-yellow-polished",
  "rose-gold": "gold-rose-polished",
  "white-gold": "gold-white-polished",
  "platinum": "platinum-natural-polished",
  "sterling-silver": "silver-natural-polished",
  "black-rhodium": "rhodium-black-polished",
  "copper": "copper-natural-polished",
  "bronze": "brass-natural-polished",
  "titanium": "titanium-natural-polished",
  "brushed-gold": "gold-yellow-brushed",
  "polished-brass": "brass-natural-polished",
  "gunmetal": "titanium-black-polished",
};

export function resolveMaterialId(id: string): string {
  return LEGACY_ID_MAP[id] ?? id;
}

export function findMaterial(id: string): MaterialDef | undefined {
  const resolved = resolveMaterialId(id);
  return MATERIAL_LIBRARY.find((m) => m.id === resolved);
}

/** Find a material by its display name (e.g. "Rose Gold", "Diamond") — used to
 *  recover user-applied materials from re-imported GLBs where the material name
 *  was baked into the file by our exporter. */
export function findMaterialByName(name: string): MaterialDef | undefined {
  if (!name) return undefined;
  const lower = name.toLowerCase().trim();
  return MATERIAL_LIBRARY.find((m) => m.name.toLowerCase() === lower);
}

// ── Simple Gem Material (PBR transmission, no custom shader) ──
// This is the crash-safe default for all gemstones. It produces a sparkly,
// glass-like appearance using standard MeshPhysicalMaterial transmission
// without the heavy ray-traced MeshRefractionMaterial shader that crashes
// Chrome on macOS (ANGLE Metal backend).
export function createSimpleGemMaterial(color: string = "#ffffff"): THREE.MeshPhysicalMaterial {
  const c = new THREE.Color(color);
  return new THREE.MeshPhysicalMaterial({
    color: c,
    emissive: c,
    emissiveIntensity: 0.12,   // gives the color a floor even if transmission is dark
    roughness: 0.05,
    metalness: 0.0,
    transmission: 0.5,         // not fully transparent — color property still contributes
    thickness: 3.0,
    ior: 1.8,
    clearcoat: 1.0,
    clearcoatRoughness: 0.0,
    envMapIntensity: 2.0,
    attenuationDistance: 0.8,  // short = aggressive tint, color visible even on ANGLE
    attenuationColor: c,
    side: THREE.DoubleSide,
  });
}
