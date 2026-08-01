import React, { useRef, useState, useEffect, Suspense, useMemo, forwardRef, useImperativeHandle, useCallback } from "react";
import { Canvas, useThree, useFrame, ThreeEvent, invalidate } from "@react-three/fiber";
import {
  OrbitControls,
  TransformControls,
  GizmoHelper,
  GizmoViewport,
} from "@react-three/drei";
import { OrbitControls as OrbitControlsImpl, RGBELoader } from "three-stdlib";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import {
  MeshBVH,
  MeshBVHUniformStruct,
  SAH,
  shaderIntersectFunction,
  shaderStructs,
} from "three-mesh-bvh";
import { findMaterial, findMaterialByName } from "@/components/cad-studio/materials";
import type { MaterialDef } from "@/components/cad-studio/materials";
import { getQualitySettings, getGPURendererString, getSettingsForMode, getDynamicGemCaps } from "@/lib/gpu-detect";
import type { QualityMode } from "@/lib/gpu-detect";
import type { GemMode } from "./GemInstanceRenderer";
export type { GemMode };
import { DebugHUD, isDebugMode, type DebugStats } from "@/components/text-to-cad/DebugHUD";
import { trackWebGLContextLost, trackWebGLContextRestored } from "@/lib/posthog-events";
import { authenticatedFetch } from '@/lib/authenticated-fetch';

// ── Quality settings (cached, runs once) ──
const Q = getQualitySettings();

// ENGINE PORT JUSTIFICATION: CADCanvas is intentionally a legacy, protected,
// single-file engine. This rendering port remains here because the requested
// mutation boundary forbids changing its public API, UI consumers, or adding
// sibling engine modules. Existing workflow/API concerns are not expanded.

type ReferenceMaterialKind = "metal" | "gem" | "pearl";

interface ReferenceMaterialSpec {
  label: string;
  kind: ReferenceMaterialKind;
  color: number;
  rough?: number;
  atten?: number;
  ior?: number;
  disp?: number;
  sheen?: number;
  irid?: number;
  opal?: boolean;
  dark?: boolean;
}

// Exact material constants from the approved standalone reference.
const REFERENCE_MATERIALS: Record<string, ReferenceMaterialSpec> = {
  gold18k:      { label: "Yellow Gold", kind: "metal", color: 0xffd88a, rough: 0.08 },
  roseGold:     { label: "Rose Gold", kind: "metal", color: 0xf6c1a6, rough: 0.08 },
  whiteGold:    { label: "White Gold", kind: "metal", color: 0xf7f4ec, rough: 0.07 },
  platinum:     { label: "Platinum", kind: "metal", color: 0xe9e9e7, rough: 0.11 },
  silver:       { label: "Silver", kind: "metal", color: 0xfbfaf6, rough: 0.05 },
  blackRhodium: { label: "Black Rhodium", kind: "metal", color: 0x3b3b40, rough: 0.28 },

  diamond:      { label: "Diamond", kind: "gem", color: 0xffffff, atten: 0xffffff, ior: 2.42, disp: 0.02 },
  champagne:    { label: "Champagne", kind: "gem", color: 0xf6e3bd, atten: 0xc89a4e, ior: 2.42, disp: 0.02 },
  ruby:         { label: "Ruby", kind: "gem", color: 0xf26a8c, atten: 0x9e0f34, ior: 1.76 },
  sapphire:     { label: "Sapphire", kind: "gem", color: 0x4f7ce0, atten: 0x0c2f9e, ior: 1.76 },
  emerald:      { label: "Emerald", kind: "gem", color: 0x46c684, atten: 0x02702f, ior: 1.57, rough: 0.03 },
  amethyst:     { label: "Amethyst", kind: "gem", color: 0xb488e2, atten: 0x5c1e96, ior: 1.54 },
  citrine:      { label: "Citrine", kind: "gem", color: 0xf2bb4d, atten: 0xa96400, ior: 1.54 },
  aquamarine:   { label: "Aquamarine", kind: "gem", color: 0xaee2de, atten: 0x2f9e96, ior: 1.57 },
  topaz:        { label: "London Topaz", kind: "gem", color: 0x4b9dbd, atten: 0x0e4a66, ior: 1.61 },
  garnet:       { label: "Garnet", kind: "gem", color: 0xcd5050, atten: 0x570a10, ior: 1.73 },
  peridot:      { label: "Peridot", kind: "gem", color: 0xbcd45c, atten: 0x647f04, ior: 1.65 },
  tanzanite:    { label: "Tanzanite", kind: "gem", color: 0x7480e2, atten: 0x28329e, ior: 1.69 },
  morganite:    { label: "Morganite", kind: "gem", color: 0xf4c6c6, atten: 0xc06a78, ior: 1.58 },
  blackDiamond: { label: "Black Diamond", kind: "gem", color: 0x17171c, atten: 0x000000, ior: 2.42, rough: 0.04, dark: true },

  pearlWhite:   { label: "White Pearl", kind: "pearl", color: 0xfdfaf3, sheen: 0xf6dfda },
  pearlGolden:  { label: "Golden Pearl", kind: "pearl", color: 0xf0d9a2, sheen: 0xf6c86a },
  pearlPink:    { label: "Pink Pearl", kind: "pearl", color: 0xf6d5d8, sheen: 0xf2aab6 },
  pearlBlack:   { label: "Tahitian", kind: "pearl", color: 0x2e3438, sheen: 0x4fa08c, irid: 0.85 },
  opal:         { label: "Opal", kind: "pearl", color: 0xf2f0ea, sheen: 0xffffff, irid: 1, opal: true },
};

const REFERENCE_BASE_ENV = { metal: 1.15, gem: 2.3, pearl: 1.1 } as const;
const REFERENCE_ENVIRONMENTS = {
  room: null,
  photostudio: "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/brown_photostudio_02_1k.hdr",
  bright: "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_08_1k.hdr",
  sunset: "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r180/examples/textures/equirectangular/venice_sunset_1k.hdr",
} as const;
type ReferenceEnvironmentKey = keyof typeof REFERENCE_ENVIRONMENTS;

const REFERENCE_TYPE_RULES: [RegExp, string][] = [
  [/pearl/i, "pearlWhite"], [/opal/i, "opal"],
  [/ruby/i, "ruby"], [/sapphire/i, "sapphire"], [/emerald/i, "emerald"],
  [/amethyst/i, "amethyst"], [/citrine/i, "citrine"], [/aqua/i, "aquamarine"],
  [/topaz/i, "topaz"], [/garnet/i, "garnet"], [/peridot/i, "peridot"],
  [/tanzanit/i, "tanzanite"], [/morganite/i, "morganite"],
  [/onyx|black[_ ]?diamond/i, "blackDiamond"],
];
const REFERENCE_GEM_RE = /diamond|gem|stone|crystal|jewel|brill|cz|cubic|solitaire|pave|moissanite|briolette|cabochon/i;

function classifyReferenceMaterial(name: string): string {
  for (const [pattern, key] of REFERENCE_TYPE_RULES) {
    if (pattern.test(name)) return key;
  }
  return REFERENCE_GEM_RE.test(name) ? "diamond" : "gold18k";
}

function referenceKeyForMaterial(material: MaterialDef | undefined, meshName: string): string | null {
  const idMap: Record<string, string> = {
    "gold-yellow-polished": "gold18k",
    "gold-rose-polished": "roseGold",
    "gold-white-polished": "whiteGold",
    "platinum-natural-polished": "platinum",
    "silver-natural-polished": "silver",
    "rhodium-black-polished": "blackRhodium",
    diamond: "diamond",
    ruby: "ruby",
    sapphire: "sapphire",
    emerald: "emerald",
    amethyst: "amethyst",
    topaz: "topaz",
    aquamarine: "aquamarine",
    "black-diamond": "blackDiamond",
  };

  if (material?.id && idMap[material.id]) return idMap[material.id];
  if (material?.id?.startsWith("flat-")) {
    const classified = classifyReferenceMaterial(meshName);
    return material.category === "gemstone"
      ? REFERENCE_MATERIALS[classified]?.kind === "metal" ? "diamond" : classified
      : "gold18k";
  }

  // Preserve unsupported explicit CAD material definitions. Unassigned meshes
  // use the reference's exact name-based ring-pipeline classification.
  if (!material) return classifyReferenceMaterial(meshName);
  return null;
}

function makeReferencePhysicalMaterial(spec: ReferenceMaterialSpec): THREE.MeshPhysicalMaterial {
  let material: THREE.MeshPhysicalMaterial;
  if (spec.kind === "metal") {
    material = new THREE.MeshPhysicalMaterial({
      color: spec.color,
      metalness: 1,
      roughness: spec.rough ?? 0.08,
      envMapIntensity: REFERENCE_BASE_ENV.metal,
      side: THREE.DoubleSide,
    });
  } else if (spec.kind === "pearl") {
    material = new THREE.MeshPhysicalMaterial({
      color: spec.color,
      metalness: 0,
      roughness: spec.opal ? 0.14 : 0.24,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      iridescence: spec.irid ?? 0.45,
      iridescenceIOR: 1.9,
      iridescenceThicknessRange: spec.opal ? [100, 800] : [120, 440],
      sheen: 0.6,
      sheenColor: new THREE.Color(spec.sheen ?? 0xffffff),
      sheenRoughness: 0.4,
      envMapIntensity: REFERENCE_BASE_ENV.pearl,
      side: THREE.DoubleSide,
    });
  } else {
    // Exact FAST GEMS fallback from the reference implementation.
    material = new THREE.MeshPhysicalMaterial({
      color: spec.color,
      metalness: 0.25,
      roughness: spec.rough ?? 0.02,
      envMapIntensity: 3,
      side: THREE.DoubleSide,
    });
    if (!spec.dark) {
      material.transparent = true;
      material.opacity = 0.92;
    }
  }
  material.name = spec.label;
  material.userData.referenceMaterial = true;
  return material;
}

function makeReferenceGemPlaceholder(
  spec: ReferenceMaterialSpec,
  geometry: THREE.BufferGeometry,
): THREE.MeshPhysicalMaterial {
  geometry.computeBoundingBox();
  const extent = geometry.boundingBox?.getSize(new THREE.Vector3()) ?? new THREE.Vector3(0.1, 0.1, 0.1);
  const size = Math.max((extent.x + extent.y + extent.z) / 3, 0.02);
  const material = new THREE.MeshPhysicalMaterial({
    color: spec.color,
    metalness: 0,
    roughness: spec.rough ?? 0.005,
    transmission: spec.dark ? 0.25 : 1,
    thickness: size * 1.1,
    ior: spec.ior,
    attenuationColor: new THREE.Color(spec.atten ?? spec.color),
    attenuationDistance: size * 0.9,
    clearcoat: 0.5,
    clearcoatRoughness: 0.02,
    envMapIntensity: REFERENCE_BASE_ENV.gem,
    specularIntensity: 1,
    side: THREE.FrontSide,
  });
  (material as THREE.MeshPhysicalMaterial & { dispersion?: number }).dispersion = spec.disp ?? 0.028;
  material.name = spec.label;
  material.userData.referenceMaterial = true;
  return material;
}

const REFERENCE_GEM_VERTEX_SHADER = /* glsl */`
varying vec3 vWorldPosition;
varying vec3 vNormal;
void main(){
  vec4 wp=modelMatrix*vec4(position,1.0);
  vWorldPosition=wp.xyz;
  vNormal=normalize(mat3(modelMatrix)*normal);
  gl_Position=projectionMatrix*viewMatrix*wp;
}`;

const REFERENCE_GEM_FRAGMENT_SHADER = /* glsl */`
precision highp isampler2D;
precision highp usampler2D;
varying vec3 vWorldPosition;
varying vec3 vNormal;
uniform mat4 modelMatrix;
uniform mat4 modelMatrixInverse;
uniform sampler2D envMap;
uniform float bounces;
${shaderStructs}
${shaderIntersectFunction}
uniform BVH bvh;
uniform float ior;
uniform float fresnel;
uniform float aberrationStrength;
uniform vec3 colorFactor;
uniform float envIntensity;
uniform float selected;

vec3 sampleEnv(vec3 dir){
  vec2 uv=vec2(atan(dir.z,dir.x)*0.1591549431+0.5,asin(clamp(dir.y,-1.0,1.0))*0.3183098862+0.5);
  return texture2D(envMap,uv).rgb;
}
vec3 totalInternalReflection(vec3 incoming,float ior_){
  vec3 rayDirection=refract(incoming,vNormal,1.0/ior_);
  vec3 rayOrigin=vWorldPosition+rayDirection*0.001;
  rayOrigin=(modelMatrixInverse*vec4(rayOrigin,1.0)).xyz;
  rayDirection=normalize((modelMatrixInverse*vec4(rayDirection,0.0)).xyz);
  for(float i=0.0;i<8.0;i++){
    if(i>=bounces)break;
    uvec4 faceIndices=uvec4(0u);
    vec3 faceNormal=vec3(0.0,0.0,1.0);
    vec3 barycoord=vec3(0.0);
    float side=1.0;
    float dist=0.0;
    bvhIntersectFirstHit(bvh,rayOrigin,rayDirection,faceIndices,faceNormal,barycoord,side,dist);
    vec3 hitPos=rayOrigin+rayDirection*max(dist-0.001,0.0);
    vec3 tempDir=refract(rayDirection,faceNormal*side,ior_);
    if(length(tempDir)!=0.0){rayDirection=tempDir;break;}
    rayDirection=reflect(rayDirection,faceNormal*side);
    rayOrigin=hitPos+rayDirection*0.01;
  }
  return normalize((modelMatrix*vec4(rayDirection,0.0)).xyz);
}
void main(){
  vec3 viewDirection=normalize(vWorldPosition-cameraPosition);
  vec3 dG=totalInternalReflection(viewDirection,max(ior,1.0));
  vec3 col;
  if(aberrationStrength>0.0){
    vec3 dR=totalInternalReflection(viewDirection,max(ior*(1.0-aberrationStrength),1.0));
    vec3 dB=totalInternalReflection(viewDirection,max(ior*(1.0+aberrationStrength),1.0));
    col=vec3(sampleEnv(dR).r,sampleEnv(dG).g,sampleEnv(dB).b);
  }else{
    col=sampleEnv(dG);
  }
  col*=envIntensity*colorFactor;
  vec3 reflDir=reflect(viewDirection,vNormal);
  vec3 reflCol=sampleEnv(reflDir)*envIntensity;
  float cosT=clamp(-dot(viewDirection,vNormal),0.0,1.0);
  float F0=pow((ior-1.0)/(ior+1.0),2.0);
  float F=F0+(1.0-F0)*pow(1.0-cosT,5.0);
  col=mix(col,reflCol,F);
  float f=pow(max(0.0,1.0+dot(viewDirection,vNormal)),10.0)*fresnel;
  col=mix(col,vec3(1.0),f);
  col=mix(col,vec3(0.0,0.9,1.0),selected*0.4);
  gl_FragColor=vec4(col,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const referenceBvhCache = new Map<string, MeshBVHUniformStruct>();
function referenceBvhFor(geometry: THREE.BufferGeometry): MeshBVHUniformStruct {
  let struct = referenceBvhCache.get(geometry.uuid);
  if (!struct) {
    struct = new MeshBVHUniformStruct();
    struct.updateFrom(new MeshBVH(geometry.clone(), { strategy: SAH }));
    referenceBvhCache.set(geometry.uuid, struct);
  }
  return struct;
}
function disposeReferenceBvhCache() {
  referenceBvhCache.forEach((struct) => struct.dispose());
  referenceBvhCache.clear();
}

const referenceWhiteEnvironment = new THREE.DataTexture(
  new Float32Array([1, 1, 1, 1]),
  1,
  1,
  THREE.RGBAFormat,
  THREE.FloatType,
);
referenceWhiteEnvironment.needsUpdate = true;

interface ReferenceEnvironmentState {
  rawEnvironment: THREE.Texture | null;
  environmentKey: ReferenceEnvironmentKey;
}
const ReferenceEnvironmentContext = React.createContext<ReferenceEnvironmentState>({
  rawEnvironment: null,
  environmentKey: "photostudio",
});

interface MotionQualityApi {
  begin: () => void;
  pulse: () => void;
  settle: (delayMs?: number) => void;
}
type CanvasWithMotionControls = HTMLCanvasElement & {
  __orbitControls?: OrbitControlsImpl;
};
const MotionQualityContext = React.createContext<MotionQualityApi>({
  begin: () => undefined,
  pulse: () => undefined,
  settle: () => undefined,
});

const ORIGINAL_TONE_MAPPING_CHUNK = THREE.ShaderChunk.tonemapping_pars_fragment;
const REFERENCE_NEUTRAL_TONE_MAPPING = /* glsl */`
vec3 CustomToneMapping( vec3 color ) {
  const float StartCompression = 0.8 - 0.04;
  const float Desaturation = 0.15;
  color *= toneMappingExposure;
  float x = min( color.r, min( color.g, color.b ) );
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max( color.r, max( color.g, color.b ) );
  if ( peak < StartCompression ) return color;
  float d = 1.0 - StartCompression;
  float newPeak = 1.0 - d * d / ( peak + d - StartCompression );
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / ( Desaturation * ( peak - newPeak ) + 1.0 );
  return mix( color, vec3( newPeak ), g );
}`;

function installReferenceNeutralToneMapping() {
  if (THREE.ShaderChunk.tonemapping_pars_fragment.includes("StartCompression = 0.8 - 0.04")) return;
  THREE.ShaderChunk.tonemapping_pars_fragment = ORIGINAL_TONE_MAPPING_CHUNK.replace(
    "vec3 CustomToneMapping( vec3 color ) { return color; }",
    REFERENCE_NEUTRAL_TONE_MAPPING,
  );
}

// Module-level flag: prevents React from overwriting mesh transforms during gizmo drag
let _isTransformDragging = false;

// Stores the quaternion at the start of each gizmo drag for delta computation
let _dragStartQuat: THREE.Quaternion | null = null;
let _dragStartRotDeg: [number, number, number] | null = null;

// ── Shared selection material (reused, never re-created) ──
const SELECTION_MATERIAL = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color(0xff6600),
  transparent: true,
  opacity: 0.35,
  depthWrite: false,
  roughness: 0.4,
  metalness: 0.1,
  emissive: new THREE.Color(0xcc4400),
  emissiveIntensity: 0.3,
  side: THREE.DoubleSide,
});

// ── Dynamic light intensity controller (updates toneMappingExposure + invalidates) ──
function LightController({ intensity }: { intensity: number }) {
  const { gl, invalidate: inv } = useThree();
  useEffect(() => {
    gl.toneMappingExposure = 1.0 * intensity;
    inv();
  }, [intensity, gl, inv]);
  return null;
}

function makeReferenceBackground(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.CanvasTexture(canvas);
  const gradient = context.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(1, "#c9cdd4");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 2, 512);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function getRequestedReferenceEnvironment(): ReferenceEnvironmentKey {
  if (typeof window === "undefined") return "photostudio";
  const requested = new URLSearchParams(window.location.search).get("cadEnvironment");
  return requested && requested in REFERENCE_ENVIRONMENTS
    ? requested as ReferenceEnvironmentKey
    : "photostudio";
}

function ReferenceStudioEnvironment({ children }: { children: React.ReactNode }) {
  const { gl, scene, invalidate: inv } = useThree();
  const environmentKey = useMemo(getRequestedReferenceEnvironment, []);
  const [rawEnvironment, setRawEnvironment] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    let disposed = false;
    let rawTexture: THREE.Texture | null = null;
    let activeTarget: THREE.WebGLRenderTarget | null = null;
    const previousEnvironment = scene.environment;
    const previousBackground = scene.background;
    const previousBackgroundBlurriness = scene.backgroundBlurriness;
    const pmrem = new THREE.PMREMGenerator(gl);
    pmrem.compileEquirectangularShader();

    const background = makeReferenceBackground();
    scene.background = background;
    scene.backgroundBlurriness = 0;

    const room = new RoomEnvironment();
    const roomTarget = pmrem.fromScene(room, 0.04);
    room.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      materials.forEach((material) => material.dispose());
    });
    activeTarget = roomTarget;
    scene.environment = roomTarget.texture;
    inv();

    const sourceUrl = REFERENCE_ENVIRONMENTS[environmentKey];
    if (sourceUrl) {
      const loader = new RGBELoader();
      loader.load(
        sourceUrl,
        (texture) => {
          if (disposed) {
            texture.dispose();
            return;
          }
          texture.mapping = THREE.EquirectangularReflectionMapping;
          rawTexture = texture;
          const target = pmrem.fromEquirectangular(texture);
          if (activeTarget && activeTarget !== roomTarget && activeTarget !== target) activeTarget.dispose();
          activeTarget = target;
          scene.environment = target.texture;
          setRawEnvironment(texture);
          inv();
        },
        undefined,
        (error) => {
          console.error(`[CADCanvas] Failed to load ${environmentKey} environment; using Soft Studio`, error);
          if (!disposed) {
            setRawEnvironment(null);
            scene.environment = roomTarget.texture;
            inv();
          }
        },
      );
    }

    return () => {
      disposed = true;
      scene.environment = previousEnvironment;
      scene.background = previousBackground;
      scene.backgroundBlurriness = previousBackgroundBlurriness;
      rawTexture?.dispose();
      activeTarget?.dispose();
      if (activeTarget !== roomTarget) roomTarget.dispose();
      background.dispose();
      pmrem.dispose();
    };
  }, [environmentKey, gl, inv, scene]);

  const value = useMemo(
    () => ({ rawEnvironment, environmentKey }),
    [rawEnvironment, environmentKey],
  );
  return <ReferenceEnvironmentContext.Provider value={value}>{children}</ReferenceEnvironmentContext.Provider>;
}

function ReferenceStudioLighting() {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    const light = lightRef.current;
    if (!light) return;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = 20;
    light.shadow.camera.left = -3;
    light.shadow.camera.right = 3;
    light.shadow.camera.top = 3;
    light.shadow.camera.bottom = -3;
    light.shadow.bias = -0.002;
    light.shadow.radius = 10;
    light.shadow.camera.updateProjectionMatrix();
  }, []);

  return (
    <>
      <directionalLight ref={lightRef} color={0xffffff} intensity={0.55} position={[1.5, 8, 2]} castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.35, 0]} receiveShadow>
        <planeGeometry args={[12, 12]} />
        <shadowMaterial transparent opacity={0.13} />
      </mesh>
    </>
  );
}

function MotionAdaptiveProvider({
  children,
  baseDpr,
  heavyScene,
}: {
  children: React.ReactNode;
  baseDpr: number;
  heavyScene: boolean;
}) {
  const { gl, camera, size, invalidate: inv } = useThree();
  const inMotionRef = useRef(false);
  const appliedDprRef = useRef(baseDpr);
  const lastMotionAtRef = useRef(0);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const grainRef = useRef<HTMLDivElement | null>(null);
  const previousCameraPosition = useRef(new THREE.Vector3());
  const previousCameraTarget = useRef(new THREE.Vector3());
  const cameraTrackedRef = useRef(false);

  const setRenderScale = useCallback((dpr: number) => {
    if (Math.abs(dpr - appliedDprRef.current) < 0.001) return;
    appliedDprRef.current = dpr;
    gl.setPixelRatio(dpr);
    gl.setSize(size.width, size.height, false);
  }, [gl, size.height, size.width]);

  const exitMotion = useCallback(() => {
    if (!inMotionRef.current && Math.abs(appliedDprRef.current - baseDpr) < 0.001) return;
    inMotionRef.current = false;
    setRenderScale(baseDpr);
    if (grainRef.current) grainRef.current.style.opacity = "0";
    inv();
  }, [baseDpr, inv, setRenderScale]);

  const enterMotion = useCallback(() => {
    if (inMotionRef.current) return;
    inMotionRef.current = true;
    const motionDpr = heavyScene
      ? Math.max(0.22, baseDpr * 0.24)
      : Math.max(0.3, baseDpr * 0.33);
    setRenderScale(motionDpr);
    if (grainRef.current) grainRef.current.style.opacity = heavyScene ? ".72" : ".6";
    inv();
  }, [baseDpr, heavyScene, inv, setRenderScale]);

  const settle = useCallback((delayMs = 420) => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => {
      const controls = (gl.domElement as CanvasWithMotionControls).__orbitControls;
      if (controls) {
        const hadDamping = controls.enableDamping;
        controls.enableDamping = false;
        controls.update();
        controls.enableDamping = hadDamping;
        previousCameraPosition.current.copy(camera.position);
        previousCameraTarget.current.copy(controls.target);
      }
      lastMotionAtRef.current = 0;
      exitMotion();
    }, delayMs);
  }, [camera.position, exitMotion, gl.domElement]);

  const begin = useCallback(() => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    lastMotionAtRef.current = performance.now();
    enterMotion();
  }, [enterMotion]);

  const pulse = useCallback(() => {
    lastMotionAtRef.current = performance.now();
    enterMotion();
  }, [enterMotion]);

  useEffect(() => {
    const grain = document.createElement("div");
    grain.setAttribute("aria-hidden", "true");
    grain.style.cssText =
      "position:absolute;inset:-50%;pointer-events:none;z-index:5;opacity:0;" +
      "transition:opacity .12s linear;mix-blend-mode:overlay;" +
      "background-image:url(\"data:image/svg+xml;utf8," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140">' +
        '<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch"/>' +
        '<feColorMatrix type="saturate" values="0"/></filter>' +
        '<rect width="140" height="140" filter="url(%23n)" opacity="0.55"/></svg>',
      ) +
      "\");background-repeat:repeat;will-change:transform;";
    const parent = gl.domElement.parentElement;
    parent?.appendChild(grain);
    grainRef.current = grain;
    return () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
      grain.remove();
      grainRef.current = null;
      gl.setPixelRatio(baseDpr);
      gl.setSize(size.width, size.height, false);
    };
  }, [baseDpr, gl, size.height, size.width]);

  useEffect(() => {
    if (inMotionRef.current) enterMotion();
    else setRenderScale(baseDpr);
  }, [baseDpr, enterMotion, setRenderScale]);

  useFrame(() => {
    const controls = (gl.domElement as CanvasWithMotionControls).__orbitControls;
    if (!controls) return;
    if (!cameraTrackedRef.current) {
      previousCameraPosition.current.copy(camera.position);
      previousCameraTarget.current.copy(controls.target);
      cameraTrackedRef.current = true;
    }
    const orbitRadius = Math.max(0.001, camera.position.distanceTo(controls.target));
    const moved = camera.position.distanceTo(previousCameraPosition.current) +
      controls.target.distanceTo(previousCameraTarget.current);
    if (moved > orbitRadius * 2e-4) lastMotionAtRef.current = performance.now();
    previousCameraPosition.current.copy(camera.position);
    previousCameraTarget.current.copy(controls.target);

    const wantsMotion = _isTransformDragging || performance.now() - lastMotionAtRef.current < 110;
    if (wantsMotion) {
      enterMotion();
      if (grainRef.current) {
        grainRef.current.style.transform =
          `translate3d(${(Math.random() * 100 | 0) - 50}px,${(Math.random() * 100 | 0) - 50}px,0)`;
      }
      inv();
    } else {
      exitMotion();
    }
  });

  const value = useMemo(() => ({ begin, pulse, settle }), [begin, pulse, settle]);
  return <MotionQualityContext.Provider value={value}>{children}</MotionQualityContext.Provider>;
}

// Post-processing removed for performance

// ── Invalidate helper for demand mode ──
function useInvalidate() {
  const { invalidate: inv } = useThree();
  return inv;
}

// ── Disable OrbitControls while dragging TransformControls ──
// Transform is applied around the object's local origin (pivot).
// Three.js TransformControls already handles this correctly:
//   - Rotation rotates around the object's own position (pivot)
//   - Scale scales from the object's own position (pivot)
//   - Move changes position only
// The key fix is syncing the resulting transform back to React state.
function TransformControlsWrapper({
  object,
  mode,
  siblingObjects,
  onDragStart,
  onDragEnd,
  onRotationDelta,
}: {
  object: THREE.Object3D;
  mode: "translate" | "rotate" | "scale";
  siblingObjects?: THREE.Object3D[];
  onDragStart?: () => void;
  onDragEnd?: (obj: THREE.Object3D) => void;
  onRotationDelta?: (obj: THREE.Object3D, deltaDeg: [number, number, number]) => void;
}) {
  const { gl } = useThree();
  const inv = useInvalidate();
  const motionQuality = React.useContext(MotionQualityContext);
  const controlsRef = useRef<any>(null);
  const prevQuatRef = useRef<THREE.Quaternion>(new THREE.Quaternion());

  // Snapshots for multi-mesh transforms (siblings = other selected meshes)
  const primaryStartPos = useRef(new THREE.Vector3());
  const primaryStartQuat = useRef(new THREE.Quaternion());
  const primaryStartScale = useRef(new THREE.Vector3(1, 1, 1));
  const siblingStarts = useRef<{ obj: THREE.Object3D; pos: THREE.Vector3; quat: THREE.Quaternion; scale: THREE.Vector3 }[]>([]);
  const groupPivot = useRef(new THREE.Vector3());
  // Freeze sibling refs at drag start so dependency changes don't cause re-mounts mid-drag
  const frozenSiblingsRef = useRef<THREE.Object3D[]>([]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const handler = (e: any) => {
      const orbitControls = (gl.domElement as CanvasWithMotionControls).__orbitControls;
      if (orbitControls) orbitControls.enabled = !e.value;
      _isTransformDragging = e.value;
      if (e.value) {
        motionQuality.begin();
        // Drag started — snapshot the current quaternion for delta tracking
        prevQuatRef.current.copy(object.quaternion);
        // Freeze siblings at drag start so they don't change mid-drag
        frozenSiblingsRef.current = siblingObjects ? [...siblingObjects] : [];
        // Snapshot primary + siblings for multi-mesh transform
        primaryStartPos.current.copy(object.position);
        primaryStartQuat.current.copy(object.quaternion);
        primaryStartScale.current.copy(object.scale);
        const allSiblings = frozenSiblingsRef.current.map((s) => ({
          obj: s,
          pos: s.position.clone(),
          quat: s.quaternion.clone(),
          scale: s.scale.clone(),
        }));
        siblingStarts.current = allSiblings;
        
        // Compute shared pivot = center of combined bounding box of all selected meshes
        if (allSiblings.length > 0) {
          const box = new THREE.Box3();
          // Include primary object
          const pBox = new THREE.Box3().setFromObject(object);
          box.union(pBox);
          // Include all siblings
          for (const s of allSiblings) {
            const sBox = new THREE.Box3().setFromObject(s.obj);
            box.union(sBox);
          }
          box.getCenter(groupPivot.current);
        } else {
          groupPivot.current.copy(object.position);
        }
        
        onDragStart?.();
        inv();
      }
      // When drag ends, pass the object back so we can sync state
      if (!e.value) {
        motionQuality.settle(420);
        if (onDragEnd) onDragEnd(object);
      }
    };
    controls.addEventListener("dragging-changed", handler);
    const onChange = () => {
      motionQuality.pulse();
      // Apply delta to all sibling (other selected) meshes
      const siblings = siblingStarts.current;
      if (siblings.length > 0) {
        if (mode === "translate") {
          const delta = object.position.clone().sub(primaryStartPos.current);
          for (const s of siblings) {
            s.obj.position.copy(s.pos).add(delta);
          }
        } else if (mode === "rotate") {
          // Compute delta quaternion from primary object
          const deltaQuat = object.quaternion.clone().multiply(primaryStartQuat.current.clone().invert());
          const pivot = groupPivot.current;
          for (const s of siblings) {
            // Rotate sibling's local orientation
            s.obj.quaternion.copy(deltaQuat).multiply(s.quat);
            // Rotate sibling's position around the shared pivot
            const offset = s.pos.clone().sub(pivot);
            offset.applyQuaternion(deltaQuat);
            s.obj.position.copy(pivot).add(offset);
          }
          // Also rotate primary object's position around pivot
          const primaryOffset = primaryStartPos.current.clone().sub(pivot);
          primaryOffset.applyQuaternion(deltaQuat);
          object.position.copy(pivot).add(primaryOffset);
        } else if (mode === "scale") {
          // Compute scale ratios from primary mesh's local scale change
          const sx = primaryStartScale.current.x > 0 ? object.scale.x / primaryStartScale.current.x : 1;
          const sy = primaryStartScale.current.y > 0 ? object.scale.y / primaryStartScale.current.y : 1;
          const sz = primaryStartScale.current.z > 0 ? object.scale.z / primaryStartScale.current.z : 1;

          const pivot = groupPivot.current;

          for (const s of siblings) {
            // Apply the same scale ratios directly to each sibling
            s.obj.scale.set(s.scale.x * sx, s.scale.y * sy, s.scale.z * sz);

            // Scale position offset from pivot using the same ratios
            const offset = s.pos.clone().sub(pivot);
            offset.set(offset.x * sx, offset.y * sy, offset.z * sz);
            s.obj.position.copy(pivot).add(offset);
          }

          // Also scale primary object's position around pivot
          const primaryOffset = primaryStartPos.current.clone().sub(pivot);
          primaryOffset.set(primaryOffset.x * sx, primaryOffset.y * sy, primaryOffset.z * sz);
          object.position.copy(pivot).add(primaryOffset);
        }
      }

      // During rotate drag, compute incremental delta and report it
      if (_isTransformDragging && mode === "rotate" && onRotationDelta) {
        const prevInv = prevQuatRef.current.clone().invert();
        const deltaQuat = object.quaternion.clone().multiply(prevInv);
        // Convert delta quaternion to axis-angle, then to per-axis degrees
        const axis = new THREE.Vector3();
        let angle = 0;
        deltaQuat.normalize();
        // Decompose delta into axis-angle
        const sinHalf = Math.sqrt(deltaQuat.x ** 2 + deltaQuat.y ** 2 + deltaQuat.z ** 2);
        if (sinHalf > 1e-6) {
          axis.set(deltaQuat.x / sinHalf, deltaQuat.y / sinHalf, deltaQuat.z / sinHalf);
          angle = 2 * Math.atan2(sinHalf, deltaQuat.w);
          // Normalize angle to [-PI, PI]
          if (angle > Math.PI) angle -= 2 * Math.PI;
          const D = 180 / Math.PI;
          const deltaDeg: [number, number, number] = [
            axis.x * angle * D,
            axis.y * angle * D,
            axis.z * angle * D,
          ];
          onRotationDelta(object, deltaDeg);
        }
        prevQuatRef.current.copy(object.quaternion);
      }
      inv();
    };
    controls.addEventListener("objectChange", onChange);
    return () => {
      controls.removeEventListener("dragging-changed", handler);
      controls.removeEventListener("objectChange", onChange);
      // Do NOT reset _isTransformDragging here — the cleanup may fire mid-drag
      // when dependencies (e.g. siblingObjects) change. The flag is correctly
      // managed by the dragging-changed event handler above.
    };
  }, [gl, onDragEnd, onRotationDelta, inv, object, mode, siblingObjects, motionQuality]);

  const hasSiblings = (siblingObjects?.length ?? 0) > 0;

  return (
    <TransformControls
      ref={controlsRef}
      object={object}
      mode={mode}
      size={1.5}
      space={hasSiblings ? "world" : "local"}
    />
  );
}

function OrbitControlsWithRef(props: React.ComponentProps<typeof OrbitControls>) {
  const { gl } = useThree();
  const motionQuality = React.useContext(MotionQualityContext);
  const ref = useRef<OrbitControlsImpl>(null);
  useEffect(() => {
    const controls = ref.current;
    if (!controls) return;
    (gl.domElement as CanvasWithMotionControls).__orbitControls = controls;
    const begin = () => motionQuality.begin();
    const settle = () => motionQuality.settle(420);
    const wheel = () => {
      motionQuality.pulse();
      motionQuality.settle(420);
    };
    controls.addEventListener("start", begin);
    controls.addEventListener("end", settle);
    gl.domElement.addEventListener("pointerup", settle);
    gl.domElement.addEventListener("pointercancel", settle);
    gl.domElement.addEventListener("wheel", wheel, { passive: true });
    return () => {
      controls.removeEventListener("start", begin);
      controls.removeEventListener("end", settle);
      gl.domElement.removeEventListener("pointerup", settle);
      gl.domElement.removeEventListener("pointercancel", settle);
      gl.domElement.removeEventListener("wheel", wheel);
      if ((gl.domElement as CanvasWithMotionControls).__orbitControls === controls) {
        delete (gl.domElement as CanvasWithMotionControls).__orbitControls;
      }
    };
  }, [gl, motionQuality]);
  return <OrbitControls ref={ref} {...props} />;
}

// ── Mesh data extracted from GLB ──
interface MeshData {
  name: string;
  geometry: THREE.BufferGeometry;
  originalMaterial: THREE.Material;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  rotationDeg: [number, number, number]; // cumulative degrees, can exceed ±360
  scale: THREE.Vector3;
  origPos: THREE.Vector3;
  origQuat: THREE.Quaternion;
  origRotationDeg: [number, number, number];
  origScale: THREE.Vector3;
}

/** Convert quaternion to Euler degrees (XYZ order) */
function quatToDeg(q: THREE.Quaternion): [number, number, number] {
  const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
  const D = 180 / Math.PI;
  return [e.x * D, e.y * D, e.z * D];
}

/** Unwrap raw Euler degrees against a previous value so deltas < 180° stay continuous */
function unwrapDeg(raw: [number, number, number], prev: [number, number, number]): [number, number, number] {
  const out: [number, number, number] = [...raw];
  for (let i = 0; i < 3; i++) {
    while (out[i] - prev[i] > 180) out[i] -= 360;
    while (out[i] - prev[i] < -180) out[i] += 360;
  }
  return out;
}

/** Convert degrees to quaternion */
function degToQuat(deg: [number, number, number]): THREE.Quaternion {
  const R = Math.PI / 180;
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(deg[0] * R, deg[1] * R, deg[2] * R, 'XYZ'));
}

// ── Snapshot for undo ──
export interface CanvasSnapshot {
  meshDataList: MeshData[];
  assignedMaterials: Record<string, MaterialDef>;
}

// ── Loaded Model ──
const LoadedModel = forwardRef<
  {
    applyMaterial: (matId: string, meshNames: string[]) => void;
    resetTransform: (meshNames: string[]) => void;
    deleteMeshes: (meshNames: string[]) => void;
    duplicateMeshes: (meshNames: string[]) => void;
    flipNormals: (meshNames: string[]) => void;
    centerOrigin: (meshNames: string[]) => void;
    subdivideMesh: (meshNames: string[], iterations: number) => void;
    setWireframe: (on: boolean) => void;
    smoothMesh: (meshNames: string[], iterations: number) => void;
    getSnapshot: () => CanvasSnapshot;
    restoreSnapshot: (snap: CanvasSnapshot) => void;
    applyTransform: (meshNames: string[]) => void;
    removeAllTextures: () => void;
    applyMagicTextures: () => void;
    getSelectedTransform: () => MeshTransformData | null;
    setMeshTransform: (axis: 'x' | 'y' | 'z', property: 'position' | 'rotation' | 'scale', value: number) => void;
    exportSceneBlob: () => Promise<Blob>;
    exportSceneStlBlob: (scaleMm: number) => Promise<Blob>;
    exportSceneRawBlob: () => Promise<Blob>;
  },
  {
  url: string;
    additionalGlbUrls?: string[];
    selectedMeshNames: Set<string>;
    hiddenMeshNames: Set<string>;
    onMeshClick: (name: string, multi: boolean) => void;
    transformMode: string;
    onMeshesDetected?: (meshes: { name: string; verts: number; faces: number }[]) => void;
    onTransformStart?: () => void;
    onTransformEnd?: () => void;
    onLoadStart?: () => void;
    onLoadEnd?: () => void;
    onModelReady?: () => void;
    magicTexturing?: boolean;
    onDebugGemStats?: (total: number, refraction: number, fallback: number, effectiveBounces: number) => void;
    onSceneWeightChange?: (heavy: boolean) => void;
    gemMode?: GemMode;
    onGemModeForced?: (mode: GemMode) => void;
  }
>(({ url, additionalGlbUrls = [], selectedMeshNames, hiddenMeshNames, onMeshClick, transformMode, onMeshesDetected, onTransformStart, onTransformEnd, onLoadStart, onLoadEnd, onModelReady, magicTexturing = false, onDebugGemStats, onSceneWeightChange, gemMode = "simple", onGemModeForced }, ref) => {
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const loadedUrlRef = useRef<string>("");

  // Fetch GLB — uses authenticatedFetch for /artifacts/ proxy URLs, plain fetch otherwise
  useEffect(() => {
    if (!url || loadedUrlRef.current === url) return;
    loadedUrlRef.current = url;
    let cancelled = false;
    onLoadStart?.();

    (async () => {
      try {
        const needsAuth = url.includes('/artifacts/');
        const response = needsAuth ? await authenticatedFetch(url) : await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch GLB: ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();

        if (cancelled) return;

        const loader = new GLTFLoader();
        loader.parse(arrayBuffer, "", (gltf) => {
          if (cancelled) return;
          console.log("[CADCanvas] GLB parsed successfully, size:", arrayBuffer.byteLength);
          setScene(gltf.scene);
          onLoadEnd?.();
        }, (error) => {
          console.error("[CADCanvas] Failed to parse GLB:", error);
          loadedUrlRef.current = "";
          onLoadEnd?.();
        });
      } catch (error) {
        console.error("[CADCanvas] Failed to fetch GLB:", error);
        if (!cancelled) {
          loadedUrlRef.current = "";
          onLoadEnd?.();
        }
      }
    })();

    return () => { cancelled = true; };
  }, [url, onLoadStart, onLoadEnd]);
  const [meshDataList, setMeshDataList] = useState<MeshData[]>([]);
  const [assignedMaterials, setAssignedMaterials] = useState<Record<string, MaterialDef>>({});
  // Keep refs that always point to the latest state — avoids stale closures in R3F reconciler
  const meshDataListRef = useRef<MeshData[]>([]);
  meshDataListRef.current = meshDataList;
  const assignedMaterialsRef = useRef<Record<string, MaterialDef>>({});
  assignedMaterialsRef.current = assignedMaterials;
  const meshRefs = useRef<Map<string, THREE.Mesh>>(new Map());
  const flatGeoCache = useRef<Map<string, THREE.BufferGeometry>>(new Map());
  const materialCache = useRef<Map<string, THREE.Material>>(new Map());
  // Store normalisation factors so exportSceneRawBlob can reverse the transform
  const normScaleRef = useRef<number>(1);
  const normCenterRef = useRef<THREE.Vector3>(new THREE.Vector3());
  // Tracks meshes where the user explicitly applied a material AFTER selecting them.
  // When this set contains a mesh name, the applied material is shown instead of the blue overlay.
  // Cleared when selection changes; populated by applyMaterial.
  const materialAppliedAfterSelect = useRef<Set<string>>(new Set());
  const prevSelectedRef = useRef<Set<string>>(new Set());
  const inv = useInvalidate();
  const { camera, gl: glRenderer } = useThree();
  const { rawEnvironment } = React.useContext(ReferenceEnvironmentContext);

  useEffect(() => () => {
    disposeReferenceBvhCache();
    flatGeoCache.current.forEach((geometry) => geometry.dispose());
    flatGeoCache.current.clear();
    materialCache.current.forEach((material) => material.dispose());
    materialCache.current.clear();
  }, []);

  // ── Decompose scene into individual mesh data ──
  useEffect(() => {
    if (!scene) return;
    disposeReferenceBvhCache();
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const s = maxDim === 0 ? 1 : 2.2 / maxDim;
    normScaleRef.current = s;
    normCenterRef.current = center.clone();

    const list: MeshData[] = [];
    let idx = 0;
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (!mesh.geometry.attributes.normal) {
          mesh.geometry.computeVertexNormals();
          mesh.geometry.userData.normalSource = "computed";
        } else if (!mesh.geometry.userData.normalSource) {
          mesh.geometry.userData.normalSource = "file";
        }
        const name = mesh.name || `Mesh_${idx}`;
        mesh.updateWorldMatrix(true, false);
        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        const worldScale = new THREE.Vector3();
        mesh.matrixWorld.decompose(worldPos, worldQuat, worldScale);

        const pos = new THREE.Vector3(
          (worldPos.x - center.x) * s,
          (worldPos.y - center.y) * s,
          (worldPos.z - center.z) * s
        );
        const quat = worldQuat.clone();
        const scl = worldScale.multiplyScalar(s);
        const origMat = Array.isArray(mesh.material) ? mesh.material[0].clone() : mesh.material.clone();
        // Ensure double-sided rendering to prevent disappearing faces at certain angles
        if ((origMat as THREE.MeshStandardMaterial).side !== undefined) {
          (origMat as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
        }

        const initDeg = quatToDeg(quat);
        list.push({
          name,
          geometry: mesh.geometry,
          originalMaterial: origMat,
          position: pos.clone(),
          quaternion: quat.clone(),
          rotationDeg: [...initDeg],
          scale: scl.clone(),
          origPos: pos.clone(),
          origQuat: quat.clone(),
          origRotationDeg: [...initDeg],
          origScale: scl.clone(),
        });
        idx++;
      }
    });

    // Dispose old caches
    flatGeoCache.current.forEach((g) => g.dispose());
    flatGeoCache.current.clear();
    materialCache.current.forEach((m) => m.dispose());
    materialCache.current.clear();

    // ── Magic Texturing: auto-assign materials based on mesh name + material heuristics ──
    // Only run if magicTexturing is enabled
    const autoMaterials: Record<string, MaterialDef> = {};

    if (magicTexturing) {
    // PRIORITY 0: If the GLB's embedded material name matches a library material
    //             (i.e. previously exported from Formanova), honour that assignment
    //             and skip heuristics entirely.
    let recognisedCount = 0;

    list.forEach((md) => {
      const matName = md.originalMaterial?.name;
      if (matName) {
        const libMatch = findMaterialByName(matName);
        if (libMatch) {
          autoMaterials[md.name] = libMatch;
          recognisedCount++;
          console.log(`[MagicTex] "${md.name}" → ${libMatch.name} (recognised from GLB material name "${matName}")`);
        }
      }
    });

    // If the majority of meshes had recognised materials, skip heuristic texturing
    const useRecognised = recognisedCount > 0 && recognisedCount >= list.length * 0.5;

    if (useRecognised) {
      // Fill any unrecognised meshes with a sensible fallback based on the recognised set
      const fallbackGold = findMaterial("yellow-gold")!;
      list.forEach((md) => {
        if (!autoMaterials[md.name]) {
          autoMaterials[md.name] = fallbackGold;
          console.log(`[MagicTex] "${md.name}" → Yellow Gold (fallback for unrecognised mesh in recognised GLB)`);
        }
      });
      console.log(`[MagicTex] Recognised ${recognisedCount}/${list.length} materials from GLB — skipping heuristics`);
    } else {
      // ── Standard heuristic texturing for fresh/pipeline GLBs ──
      const gemKeywords = ["gem", "diamond", "stone", "ruby", "sapphire", "emerald", "crystal", "halo_gem", "center_gem", "pave", "brilliant", "round_cut", "cushion", "oval", "marquise", "princess", "facet"];
      const platinumKeywords = ["prong", "claw", "bead", "milgrain", "setting", "basket", "collet"];
      const diamondMatDef = findMaterial("diamond")!;
      const platinumMatDef = findMaterial("platinum")!;
      const goldMatDef = findMaterial("yellow-gold")!;

      // Compute median vertex count to identify small meshes (likely gems)
      const vertCounts = list.map((md) => md.geometry?.attributes?.position?.count || 0).sort((a, b) => a - b);
      const medianVerts = vertCounts[Math.floor(vertCounts.length / 2)] || 0;

      // Helper: detect if original material looks like a gem (transparent, refractive, non-metallic)
      const looksLikeGem = (mat: THREE.Material): boolean => {
        if (!(mat instanceof THREE.MeshPhysicalMaterial || mat instanceof THREE.MeshStandardMaterial)) return false;
        const phys = mat as THREE.MeshPhysicalMaterial;
        if (phys.transmission !== undefined && phys.transmission > 0.1) return true;
        if (phys.transparent && phys.opacity < 0.8) return true;
        if (phys.metalness < 0.3 && phys.roughness < 0.15) return true;
        if (phys.metalness < 0.3) {
          const c = phys.color;
          if (c && c.r > 0.7 && c.g > 0.7 && c.b > 0.7 && phys.roughness < 0.4) return true;
        }
        return false;
      };

      const looksLikeMetal = (mat: THREE.Material): boolean => {
        if (!(mat instanceof THREE.MeshPhysicalMaterial || mat instanceof THREE.MeshStandardMaterial)) return false;
        return mat.metalness > 0.7;
      };

      list.forEach((md) => {
        if (autoMaterials[md.name]) return; // already recognised above
        const lower = md.name.toLowerCase();
        const verts = md.geometry?.attributes?.position?.count || 0;

        if (gemKeywords.some((kw) => lower.includes(kw))) {
          autoMaterials[md.name] = diamondMatDef;
        } else if (platinumKeywords.some((kw) => lower.includes(kw))) {
          autoMaterials[md.name] = platinumMatDef;
        } else if (looksLikeGem(md.originalMaterial)) {
          autoMaterials[md.name] = diamondMatDef;
          console.log(`[MagicTex] "${md.name}" → diamond (material heuristic)`);
        } else if (verts > 0 && verts < medianVerts * 0.3 && !looksLikeMetal(md.originalMaterial)) {
          autoMaterials[md.name] = diamondMatDef;
          console.log(`[MagicTex] "${md.name}" → diamond (size heuristic: ${verts} verts)`);
        } else {
          autoMaterials[md.name] = goldMatDef;
        }
      });
    }
    } else {
      // ── Flat mesh classification (default when magic texturing is off) ──
      // gem → blue (#4a90d9), metal → green (#77dd77), flat shading, no maps
      const gemRe = /diamond|gem|stone|crystal|jewel|brill|ruby|emerald|sapphire|topaz|opal|garnet|amethyst|pearl|cz|cubic|solitaire|pave|prong_stone|accent_stone|center_stone|main_stone/i;
      const metalRe = /band|ring|shank|prong|setting|mount|bezel|basket|gallery|shoulder|bridge|head|collet|metal|gold|silver|platinum|frame|base/i;

      list.forEach((md) => {
        const lower = md.name.toLowerCase();
        const phys = md.originalMaterial as THREE.MeshPhysicalMaterial;
        let isGem = gemRe.test(lower);
        if (metalRe.test(lower)) isGem = false;
        if (!gemRe.test(lower) && !metalRe.test(lower)) {
          if (phys.transmission > 0.5 || phys.ior > 2.0) isGem = true;
        }
        const color = isGem ? 0x4a90d9 : 0x77dd77;
        autoMaterials[md.name] = {
          preview: `#${color.toString(16).padStart(6, '0')}`,
          id: `flat-${isGem ? 'gem' : 'metal'}-${md.name}`,
          name: isGem ? 'Gem (flat)' : 'Metal (flat)',
          category: isGem ? 'gemstone' : 'metal',
          create: () => new THREE.MeshPhysicalMaterial({
            color,
            metalness: 0,
            roughness: isGem ? 0.6 : 0.8,
            flatShading: true,
            side: THREE.DoubleSide,
          }),
        };
      });
    } // end if (magicTexturing) / else

    // ── Scene complexity guardrail ──
    const totalVerts = list.reduce((sum, md) => sum + (md.geometry?.attributes?.position?.count || 0), 0);
    const gemCount = Object.values(autoMaterials).filter(m => m.category === "gemstone" && m.refractionConfig).length;
    
    if (totalVerts > Q.vertexBudget) {
      console.warn(`[CADCanvas] ⚠ Scene complexity warning: ${totalVerts.toLocaleString()} vertices exceeds ${Q.tier} tier budget of ${Q.vertexBudget.toLocaleString()}`);
      // Import toast dynamically to avoid circular deps — fire-and-forget
      import("sonner").then(({ toast }) => {
        toast.warning(`Heavy model detected (${(totalVerts / 1000).toFixed(0)}K vertices)`, {
          description: "Rendering quality has been automatically adjusted for stability.",
          duration: 6000,
        });
      });
    }

    if (gemCount > Q.maxGemRefraction) {
      console.warn(`[CADCanvas] ⚠ ${gemCount} refraction gems exceed ${Q.tier} tier limit of ${Q.maxGemRefraction} — excess will use fallback material`);
    }

    setMeshDataList(list);
    setAssignedMaterials(autoMaterials);
    inv();

    if (onMeshesDetected) {
      onMeshesDetected(list.map((m) => ({
        name: m.name,
        verts: m.geometry?.attributes?.position?.count || 0,
        faces: m.geometry?.index ? m.geometry.index.count / 3 : (m.geometry?.attributes?.position?.count || 0) / 3,
      })));
    }

    // ── Auto-frame: fit camera from NORMALIZED mesh bounds (stable across GLB unit scales) ──
    {
      const framedBox = new THREE.Box3();
      const meshBounds = new THREE.Box3();
      const transform = new THREE.Matrix4();

      for (const md of list) {
        if (!md.geometry.boundingBox) md.geometry.computeBoundingBox();
        if (!md.geometry.boundingBox) continue;

        meshBounds.copy(md.geometry.boundingBox);
        transform.compose(md.position, md.quaternion, md.scale);
        meshBounds.applyMatrix4(transform);
        framedBox.union(meshBounds);
      }

      if (!framedBox.isEmpty()) {
        const orbitCtrl = (glRenderer.domElement as any).__orbitControls;
        if (orbitCtrl) {
          orbitCtrl.target.set(0, 0, 0);
          orbitCtrl.object.position.set(0, 0.7, 5.4);
          orbitCtrl.minDistance = 0.5;
          orbitCtrl.maxDistance = 20;
          orbitCtrl.update();
        } else {
          camera.position.set(0, 0.7, 5.4);
          (camera as THREE.PerspectiveCamera).lookAt(0, 0, 0);
        }

        inv();
      }
    }

    // Signal model is fully processed and ready to render.
    // GLB decomposition + material mapping blocks the main thread, so we need a generous
    // delay to ensure React has committed mesh JSX, R3F has reconciled, and the GPU has
    // actually painted at least one frame before the loading overlay is dismissed.
    setTimeout(() => {
      inv(); // force a render frame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            onModelReady?.();
          });
        });
      });
    }, 500);
  }, [scene, onMeshesDetected, inv, onModelReady, camera, glRenderer]);

  // ── Merge additional GLB parts into the existing scene ──
  const mergedUrlsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!additionalGlbUrls.length) return;
    const newUrls = additionalGlbUrls.filter((u) => !mergedUrlsRef.current.has(u));
    if (!newUrls.length) return;

    newUrls.forEach((partUrl) => {
      mergedUrlsRef.current.add(partUrl);
      (async () => {
        try {
          const needsAuth = partUrl.includes('/artifacts/');
          const resp = needsAuth ? await authenticatedFetch(partUrl) : await fetch(partUrl);
          if (!resp.ok) throw new Error(`Failed to fetch GLB: ${resp.status}`);
          const arrayBuffer = await resp.arrayBuffer();

          const loader = new GLTFLoader();
          loader.parse(arrayBuffer, "", (gltf) => {
            const clone = gltf.scene.clone(true);
            const box = new THREE.Box3().setFromObject(clone);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const s = maxDim === 0 ? 1 : 2.2 / maxDim;
            normScaleRef.current = s;
            normCenterRef.current = center.clone();

            const newParts: MeshData[] = [];
            let idx = 0;
            clone.traverse((child) => {
              if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;
                if (!mesh.geometry.attributes.normal) {
                  mesh.geometry.computeVertexNormals();
                  mesh.geometry.userData.normalSource = "computed";
                } else if (!mesh.geometry.userData.normalSource) {
                  mesh.geometry.userData.normalSource = "file";
                }
                const baseName = mesh.name || `Part_${idx}`;
                // Deduplicate names
                let name = baseName;
                let suffix = 1;
                const existingNames = new Set(meshDataList.map((m) => m.name));
                while (existingNames.has(name)) {
                  name = `${baseName}_${suffix++}`;
                }

                mesh.updateWorldMatrix(true, false);
                const wp = new THREE.Vector3();
                const wq = new THREE.Quaternion();
                const ws = new THREE.Vector3();
                mesh.matrixWorld.decompose(wp, wq, ws);

                const pos = new THREE.Vector3(
                  (wp.x - center.x) * s,
                  (wp.y - center.y) * s,
                  (wp.z - center.z) * s
                );
                const quat = wq.clone();
                const scl = ws.multiplyScalar(s);
                const origMat = Array.isArray(mesh.material) ? mesh.material[0].clone() : mesh.material.clone();
                if ((origMat as any).side !== undefined) (origMat as any).side = THREE.DoubleSide;

                const partDeg = quatToDeg(quat);
                newParts.push({
                  name,
                  geometry: mesh.geometry,
                  originalMaterial: origMat,
                  position: pos.clone(),
                  quaternion: quat.clone(),
                  rotationDeg: [...partDeg],
                  scale: scl.clone(),
                  origPos: pos.clone(),
                  origQuat: quat.clone(),
                  origRotationDeg: [...partDeg],
                  origScale: scl.clone(),
                });
                idx++;
              }
            });

            if (newParts.length === 0) return;

            // Auto-assign materials to new parts
            const gemKeywordsLocal = ["gem", "diamond", "stone", "ruby", "sapphire", "emerald", "crystal", "halo_gem", "center_gem", "pave"];
            const platKeywordsLocal = ["prong", "claw", "bead", "milgrain"];
            const dMat = findMaterial("diamond")!;
            const pMat = findMaterial("platinum")!;
            const gMat = findMaterial("yellow-gold")!;

            const newMaterials: Record<string, MaterialDef> = {};
            newParts.forEach((md) => {
              const lower = md.name.toLowerCase();
              if (gemKeywordsLocal.some((kw) => lower.includes(kw))) {
                newMaterials[md.name] = dMat;
              } else if (platKeywordsLocal.some((kw) => lower.includes(kw))) {
                newMaterials[md.name] = pMat;
              } else {
                newMaterials[md.name] = gMat;
              }
            });

            setMeshDataList((prev) => [...prev, ...newParts]);
            setAssignedMaterials((prev) => ({ ...prev, ...newMaterials }));
            inv();

            if (onMeshesDetected) {
              // Re-report all meshes
              setMeshDataList((current) => {
                onMeshesDetected(current.map((m) => ({
                  name: m.name,
                  verts: m.geometry?.attributes?.position?.count || 0,
                  faces: m.geometry?.index ? m.geometry.index.count / 3 : (m.geometry?.attributes?.position?.count || 0) / 3,
                })));
                return current;
              });
            }

            console.log(`[CADCanvas] Merged ${newParts.length} part(s) from additional GLB`);
          }, (err) => {
            console.error("[CADCanvas] Failed to parse additional GLB:", err);
          });
        } catch (err) {
          console.error("[CADCanvas] Failed to fetch additional GLB:", err);
        }
      })();
    });
  }, [additionalGlbUrls, meshDataList, inv, onMeshesDetected]);

  // ── Sync transform from Three.js object back to React state ──
  // Position and scale are read directly. Rotation is NOT derived from quaternion
  // (Euler decomposition is lossy/clamped). Instead rotation is tracked incrementally.
  const syncTransformFromObject = useCallback((meshName: string, obj: THREE.Object3D) => {
    setMeshDataList((prev) => prev.map((md) => {
      if (md.name !== meshName) return md;
      return {
        ...md,
        position: obj.position.clone(),
        quaternion: obj.quaternion.clone(),
        // rotationDeg is NOT updated here — it's updated incrementally via handleRotationDelta
        scale: obj.scale.clone(),
      };
    }));
  }, []);

  // Called during rotate gizmo drag with incremental degree deltas (no Euler decomposition)
  const handleRotationDelta = useCallback((obj: THREE.Object3D, deltaDeg: [number, number, number]) => {
    // Apply rotation delta to ALL selected meshes (primary + siblings)
    setMeshDataList((prev) => prev.map((md) => {
      if (!selectedMeshNames.has(md.name)) return md;
      const meshObj = meshRefs.current.get(md.name);
      if (!meshObj) return md;
      return {
        ...md,
        quaternion: meshObj.quaternion.clone(),
        rotationDeg: [
          md.rotationDeg[0] + deltaDeg[0],
          md.rotationDeg[1] + deltaDeg[1],
          md.rotationDeg[2] + deltaDeg[2],
        ],
      };
    }));
  }, [selectedMeshNames]);

  // Called when TransformControls drag starts
  const handleDragStart = useCallback(() => {
    onTransformStart?.();
  }, [onTransformStart]);

  // Called when TransformControls drag ends
  const handleDragEnd = useCallback((obj: THREE.Object3D) => {
    // Sync ALL selected meshes (primary was moved by gizmo, siblings by our delta logic)
    for (const [name, meshObj] of meshRefs.current.entries()) {
      if (selectedMeshNames.has(name)) {
        syncTransformFromObject(name, meshObj);
      }
    }
    onTransformEnd?.();
    inv();
  }, [syncTransformFromObject, onTransformEnd, inv, selectedMeshNames]);

  // ── Imperative API ──
  useImperativeHandle(ref, () => ({
    applyMaterial: (matId: string, meshNames: string[]) => {
      const matDef = findMaterial(matId);
      if (!matDef) return;
      meshNames.forEach((n) => {
        flatGeoCache.current.delete(n);
        const key = `assigned_${n}_${matDef.id}`;
        const old = materialCache.current.get(key);
        if (old) old.dispose();
        materialCache.current.delete(key);
        // Mark: user explicitly applied material after selecting this mesh
        materialAppliedAfterSelect.current.add(n);
      });
      console.log('[Material Apply] Applying', matDef.id, 'to meshes:', meshNames);
      setAssignedMaterials((prev) => {
        const next = { ...prev };
        meshNames.forEach((n) => { next[n] = matDef; });
        console.log('[Material Apply] Updated assignedMaterials keys:', Object.keys(next));
        return next;
      });
      inv();
    },
    resetTransform: (meshNames: string[]) => {
      const names = new Set(meshNames);
      setMeshDataList((prev) => prev.map((md) => {
        if (!names.has(md.name)) return md;
        return { ...md, position: md.origPos.clone(), quaternion: md.origQuat.clone(), rotationDeg: [...md.origRotationDeg], scale: md.origScale.clone() };
      }));
      inv();
    },
    deleteMeshes: (meshNames: string[]) => {
      disposeReferenceBvhCache();
      const names = new Set(meshNames);
      setMeshDataList((prev) => prev.filter((m) => !names.has(m.name)));
      setAssignedMaterials((prev) => {
        const next = { ...prev };
        meshNames.forEach((n) => {
          delete next[n];
          const fg = flatGeoCache.current.get(n);
          if (fg) { fg.dispose(); flatGeoCache.current.delete(n); }
        });
        return next;
      });
      inv();
    },
    duplicateMeshes: (meshNames: string[]) => {
      const names = new Set(meshNames);
      const newItems: MeshData[] = [];
      setMeshDataList((prev) => {
        prev.forEach((md) => {
          if (names.has(md.name)) {
            const newPos = md.position.clone();
            newPos.x += 0.5;
            const dupName = `${md.name}_copy`;
            // Avoid duplicate names
            let finalName = dupName;
            let suffix = 2;
            const existingNames = new Set(prev.map(m => m.name));
            while (existingNames.has(finalName)) {
              finalName = `${md.name}_copy_${suffix++}`;
            }
            const newMd: MeshData = {
              ...md,
              name: finalName,
              geometry: md.geometry.clone(),
              position: newPos,
              origPos: newPos.clone(),
            };
            newItems.push(newMd);
          }
        });
        return [...prev, ...newItems];
      });
      // Sync duplicated meshes back to parent mesh list
      if (onMeshesDetected && newItems.length > 0) {
        setTimeout(() => {
          setMeshDataList((current) => {
            onMeshesDetected(current.map((m) => ({
              name: m.name,
              verts: m.geometry?.attributes?.position?.count || 0,
              faces: m.geometry?.index ? m.geometry.index.count / 3 : (m.geometry?.attributes?.position?.count || 0) / 3,
            })));
            return current;
          });
        }, 0);
      }
      // Copy materials for duplicated meshes
      setAssignedMaterials((prev) => {
        const next = { ...prev };
        newItems.forEach((item) => {
          const origName = item.name.replace(/_copy(_\d+)?$/, '');
          if (prev[origName]) next[item.name] = prev[origName];
        });
        return next;
      });
      inv();
    },
    flipNormals: (meshNames: string[]) => {
      const names = new Set(meshNames);
      setMeshDataList((prev) => {
        prev.forEach((md) => {
          if (names.has(md.name)) {
            const normals = md.geometry.attributes.normal;
            if (normals) {
              for (let i = 0; i < normals.count; i++) {
                normals.setXYZ(i, -normals.getX(i), -normals.getY(i), -normals.getZ(i));
              }
              normals.needsUpdate = true;
            }
          }
        });
        return [...prev]; // trigger re-render
      });
      inv();
    },
    centerOrigin: (meshNames: string[]) => {
      disposeReferenceBvhCache();
      const names = new Set(meshNames);
      setMeshDataList((prev) => prev.map((md) => {
        if (!names.has(md.name)) return md;
        md.geometry.computeBoundingBox();
        const c = new THREE.Vector3();
        md.geometry.boundingBox?.getCenter(c);
        md.geometry.translate(-c.x, -c.y, -c.z);
        return { ...md, position: md.position.clone().add(c) };
      }));
      inv();
    },
    subdivideMesh: (meshNames: string[], _iterations: number) => {
      const names = new Set(meshNames);
      meshDataList.forEach((md) => {
        if (names.has(md.name)) md.geometry.computeVertexNormals();
      });
      inv();
    },
    setWireframe: (on: boolean) => {
      meshRefs.current.forEach((meshObj) => {
        const mat = meshObj.material as THREE.MeshStandardMaterial;
        if (mat && "wireframe" in mat) mat.wireframe = on;
      });
      inv();
    },
    smoothMesh: (meshNames: string[], _iterations: number) => {
      const names = new Set(meshNames);
      meshDataList.forEach((md) => {
        if (names.has(md.name)) md.geometry.computeVertexNormals();
      });
      inv();
    },
    // Remove all auto-assigned textures, revert to original GLB materials
    removeAllTextures: () => {
      setAssignedMaterials({});
      flatGeoCache.current.forEach((g) => g.dispose());
      flatGeoCache.current.clear();
      materialCache.current.forEach((m) => m.dispose());
      materialCache.current.clear();
      inv();
      console.log("[CADCanvas] All magic textures removed");
    },
    // Apply magic texturing on demand
    applyMagicTextures: () => {
      const list = meshDataListRef.current;
      if (!list.length) return;
      
      const newMaterials: Record<string, MaterialDef> = {};
      let recognisedCount = 0;

      // Priority 0: recognised from GLB material name
      list.forEach((md) => {
        const matName = md.originalMaterial?.name;
        if (matName) {
          const libMatch = findMaterialByName(matName);
          if (libMatch) {
            newMaterials[md.name] = libMatch;
            recognisedCount++;
          }
        }
      });

      const useRecognised = recognisedCount > 0 && recognisedCount >= list.length * 0.5;

      if (useRecognised) {
        const fallbackGold = findMaterial("yellow-gold")!;
        list.forEach((md) => {
          if (!newMaterials[md.name]) newMaterials[md.name] = fallbackGold;
        });
      } else {
        const gemKeywords = ["gem", "diamond", "stone", "ruby", "sapphire", "emerald", "crystal", "halo_gem", "center_gem", "pave", "brilliant", "round_cut", "cushion", "oval", "marquise", "princess", "facet"];
        const platinumKeywords = ["prong", "claw", "bead", "milgrain", "setting", "basket", "collet"];
        const diamondMatDef = findMaterial("diamond")!;
        const platinumMatDef = findMaterial("platinum")!;
        const goldMatDef = findMaterial("yellow-gold")!;
        const vertCounts = list.map((md) => md.geometry?.attributes?.position?.count || 0).sort((a, b) => a - b);
        const medianVerts = vertCounts[Math.floor(vertCounts.length / 2)] || 0;

        const looksLikeGem = (mat: THREE.Material): boolean => {
          if (!(mat instanceof THREE.MeshPhysicalMaterial || mat instanceof THREE.MeshStandardMaterial)) return false;
          const phys = mat as THREE.MeshPhysicalMaterial;
          if (phys.transmission !== undefined && phys.transmission > 0.1) return true;
          if (phys.transparent && phys.opacity < 0.8) return true;
          if (phys.metalness < 0.3 && phys.roughness < 0.15) return true;
          return false;
        };

        const looksLikeMetal = (mat: THREE.Material): boolean => {
          if (!(mat instanceof THREE.MeshPhysicalMaterial || mat instanceof THREE.MeshStandardMaterial)) return false;
          return mat.metalness > 0.7;
        };

        list.forEach((md) => {
          if (newMaterials[md.name]) return;
          const lower = md.name.toLowerCase();
          const verts = md.geometry?.attributes?.position?.count || 0;
          if (gemKeywords.some((kw) => lower.includes(kw))) {
            newMaterials[md.name] = diamondMatDef;
          } else if (platinumKeywords.some((kw) => lower.includes(kw))) {
            newMaterials[md.name] = platinumMatDef;
          } else if (looksLikeGem(md.originalMaterial)) {
            newMaterials[md.name] = diamondMatDef;
          } else if (verts > 0 && verts < medianVerts * 0.3 && !looksLikeMetal(md.originalMaterial)) {
            newMaterials[md.name] = diamondMatDef;
          } else {
            newMaterials[md.name] = goldMatDef;
          }
        });
      }

      flatGeoCache.current.forEach((g) => g.dispose());
      flatGeoCache.current.clear();
      materialCache.current.forEach((m) => m.dispose());
      materialCache.current.clear();
      setAssignedMaterials(newMaterials);
      inv();
      console.log("[CADCanvas] Magic textures applied on demand");
    },
    // Apply Transform: bake current transform into geometry, reset transform to identity
    applyTransform: (meshNames: string[]) => {
      disposeReferenceBvhCache();
      const names = new Set(meshNames);
      setMeshDataList((prev) => prev.map((md) => {
        if (!names.has(md.name)) return md;
        // Build the object matrix: T * Q * S
        const matrix = new THREE.Matrix4();
        matrix.compose(md.position, md.quaternion, md.scale);
        // Apply matrix to geometry vertices
        const newGeo = md.geometry.clone();
        newGeo.applyMatrix4(matrix);
        newGeo.computeVertexNormals();
        // Reset transform to identity
        const identityPos = new THREE.Vector3(0, 0, 0);
        const identityQuat = new THREE.Quaternion();
        const identityScale = new THREE.Vector3(1, 1, 1);
        const zeroDeg: [number, number, number] = [0, 0, 0];
        return {
          ...md,
          geometry: newGeo,
          position: identityPos,
          quaternion: identityQuat,
          rotationDeg: [...zeroDeg],
          scale: identityScale,
          origPos: identityPos.clone(),
          origQuat: identityQuat.clone(),
          origRotationDeg: [...zeroDeg],
          origScale: identityScale.clone(),
        };
      }));
      // Clear caches since geometry changed
      flatGeoCache.current.forEach((g) => g.dispose());
      flatGeoCache.current.clear();
      materialCache.current.forEach((m) => m.dispose());
      materialCache.current.clear();
      inv();
    },
    getSnapshot: (): CanvasSnapshot => ({
      meshDataList: meshDataList.map((md) => ({
        ...md,
        position: md.position.clone(),
        quaternion: md.quaternion.clone(),
        rotationDeg: [...md.rotationDeg],
        scale: md.scale.clone(),
        origPos: md.origPos.clone(),
        origQuat: md.origQuat.clone(),
        origRotationDeg: [...md.origRotationDeg],
        origScale: md.origScale.clone(),
      })),
      assignedMaterials: { ...assignedMaterials },
    }),
    restoreSnapshot: (snap: CanvasSnapshot) => {
      disposeReferenceBvhCache();
      setMeshDataList(snap.meshDataList);
      setAssignedMaterials(snap.assignedMaterials);
      // Clear the "material applied after select" tracking so overlay reappears on undo
      materialAppliedAfterSelect.current.clear();
      flatGeoCache.current.forEach((g) => g.dispose());
      flatGeoCache.current.clear();
      materialCache.current.forEach((m) => m.dispose());
      materialCache.current.clear();
      inv();
    },
    getSelectedTransform: (): MeshTransformData | null => {
      const selected = meshDataList.find((m) => selectedMeshNames.has(m.name));
      if (!selected) return null;
      return {
        position: [selected.position.x, selected.position.y, selected.position.z],
        rotation: [...selected.rotationDeg],
        scale: [selected.scale.x, selected.scale.y, selected.scale.z],
      };
    },
    setMeshTransform: (axis: 'x' | 'y' | 'z', property: 'position' | 'rotation' | 'scale', value: number) => {
      const axisIdx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;

      setMeshDataList((prev) => {
        const allSelected = prev.filter((m) => selectedMeshNames.has(m.name));
        if (allSelected.length === 0) return prev;
        const primaryMd = allSelected[0];
        const primaryName = primaryMd.name;
        const isMulti = allSelected.length > 1;

        if (!isMulti) {
          // ── Single mesh: apply value directly ──
          return prev.map((md) => {
            if (md.name !== primaryName) return md;
            if (property === 'position') {
              const newPos = md.position.clone();
              if (axisIdx === 0) newPos.x = value;
              else if (axisIdx === 1) newPos.y = value;
              else newPos.z = value;
              return { ...md, position: newPos };
            } else if (property === 'rotation') {
              const newDeg: [number, number, number] = [...md.rotationDeg];
              newDeg[axisIdx] = value;
              return { ...md, rotationDeg: newDeg, quaternion: degToQuat(newDeg) };
            } else {
              const newScale = md.scale.clone();
              if (axisIdx === 0) newScale.x = value;
              else if (axisIdx === 1) newScale.y = value;
              else newScale.z = value;
              return { ...md, scale: newScale };
            }
          });
        }

        // ── Multi-mesh: transform as group around shared pivot ──
        const selectedNames = new Set(allSelected.map(m => m.name));

        // Compute shared pivot from mesh refs (or fall back to state positions)
        const box = new THREE.Box3();
        let hasValidBounds = false;
        for (const md of allSelected) {
          const meshObj = meshRefs.current.get(md.name);
          if (meshObj) {
            box.union(new THREE.Box3().setFromObject(meshObj));
            hasValidBounds = true;
          }
        }
        const pivot = new THREE.Vector3();
        if (hasValidBounds && !box.isEmpty()) {
          box.getCenter(pivot);
        } else {
          for (const md of allSelected) pivot.add(md.position);
          pivot.divideScalar(allSelected.length);
        }

        if (property === 'position') {
          const currentVal = axisIdx === 0 ? primaryMd.position.x : axisIdx === 1 ? primaryMd.position.y : primaryMd.position.z;
          const delta = value - currentVal;
          return prev.map((md) => {
            if (!selectedNames.has(md.name)) return md;
            const newPos = md.position.clone();
            if (axisIdx === 0) newPos.x += delta;
            else if (axisIdx === 1) newPos.y += delta;
            else newPos.z += delta;
            return { ...md, position: newPos };
          });
        } else if (property === 'rotation') {
          const currentVal = primaryMd.rotationDeg[axisIdx];
          const deltaDeg = value - currentVal;
          const worldAxis = new THREE.Vector3(
            axisIdx === 0 ? 1 : 0,
            axisIdx === 1 ? 1 : 0,
            axisIdx === 2 ? 1 : 0,
          );
          const deltaQuat = new THREE.Quaternion().setFromAxisAngle(worldAxis, deltaDeg * Math.PI / 180);
          return prev.map((md) => {
            if (!selectedNames.has(md.name)) return md;
            const newQuat = deltaQuat.clone().multiply(md.quaternion);
            const newDeg: [number, number, number] = [
              md.rotationDeg[0] + (axisIdx === 0 ? deltaDeg : 0),
              md.rotationDeg[1] + (axisIdx === 1 ? deltaDeg : 0),
              md.rotationDeg[2] + (axisIdx === 2 ? deltaDeg : 0),
            ];
            const offset = md.position.clone().sub(pivot);
            offset.applyQuaternion(deltaQuat);
            const newPos = pivot.clone().add(offset);
            return { ...md, quaternion: newQuat, rotationDeg: newDeg, position: newPos };
          });
        } else {
          // Scale: compute ratio from primary's current scale on this axis
          const currentVal = axisIdx === 0 ? primaryMd.scale.x : axisIdx === 1 ? primaryMd.scale.y : primaryMd.scale.z;
          if (currentVal === 0) return prev;
          const ratio = value / currentVal;
          return prev.map((md) => {
            if (!selectedNames.has(md.name)) return md;
            const newScale = md.scale.clone();
            if (axisIdx === 0) newScale.x *= ratio;
            else if (axisIdx === 1) newScale.y *= ratio;
            else newScale.z *= ratio;
            const offset = md.position.clone().sub(pivot);
            if (axisIdx === 0) offset.x *= ratio;
            else if (axisIdx === 1) offset.y *= ratio;
            else offset.z *= ratio;
            return { ...md, scale: newScale, position: pivot.clone().add(offset) };
          });
        }
      });
      // The imperative sync effect (meshDataList → meshRefs) will handle updating Three.js objects
      inv();
    },
    exportSceneBlob: async (): Promise<Blob> => {
      // ── React state is the single source of truth ──
      // meshDataListRef  → geometry + transforms (position, quaternion, scale)
      // assignedMaterialsRef → user-applied MaterialDef per mesh
      // We never read from meshRefs here — those contain runtime artefacts
      // (selection overlays, hidden gem placeholders, refraction materials).
      const exportScene = new THREE.Scene();
      const currentMeshData = meshDataListRef.current;
      const currentAssigned = assignedMaterialsRef.current;

      const meshNames = currentMeshData.map(m => m.name);
      const assignedNames = Object.keys(currentAssigned);
      const unmatched = assignedNames.filter(n => !meshNames.includes(n));
      console.log('[GLB Export] meshDataList names:', meshNames);
      console.log('[GLB Export] assignedMaterials keys:', assignedNames);
      console.log('[GLB Export] assignedMaterials entries:', Object.entries(currentAssigned).map(([k, v]) => `${k} → ${v.id} (${v.category})`));
      if (unmatched.length > 0) console.warn('[GLB Export] ⚠ Assigned material keys NOT in meshDataList:', unmatched);
      console.log('[GLB Export] Starting. meshDataList:', currentMeshData.length, 'assignedMaterials:', assignedNames.length);

      currentMeshData.forEach((md) => {
        const assigned = currentAssigned[md.name];
        let material: THREE.Material;

        if (assigned) {
          // Generate the runtime material from the MaterialDef, then copy only
          // GLTF-serialisable properties into a clean MeshPhysicalMaterial so the
          // exporter never encounters custom shaders or leftover internal state.
          const referenceKey = referenceKeyForMaterial(assigned, md.name);
          const referenceSpec = referenceKey ? REFERENCE_MATERIALS[referenceKey] : undefined;
          const src = referenceSpec
            ? makeReferencePhysicalMaterial(referenceSpec)
            : assigned.create() as THREE.MeshPhysicalMaterial;
          const exportMat = new THREE.MeshPhysicalMaterial({
            color: src.color.clone(),
            metalness: src.metalness,
            roughness: src.roughness,
            emissive: src.emissive?.clone() ?? new THREE.Color(0x000000),
            emissiveIntensity: src.emissiveIntensity ?? 0,
            opacity: src.opacity ?? 1,
            transparent: src.transparent ?? false,
            side: THREE.DoubleSide,
            // Physical extensions (KHR_materials_*)
            clearcoat: src.clearcoat ?? 0,
            clearcoatRoughness: src.clearcoatRoughness ?? 0,
            transmission: src.transmission ?? 0,
            ior: src.ior ?? 1.5,
            thickness: src.thickness ?? 0,
            attenuationColor: src.attenuationColor?.clone() ?? new THREE.Color(0xffffff),
            attenuationDistance: src.attenuationDistance ?? Infinity,
            iridescence: src.iridescence ?? 0,
            iridescenceIOR: src.iridescenceIOR ?? 1.3,
            iridescenceThicknessRange: src.iridescenceThicknessRange
              ? [...src.iridescenceThicknessRange] as [number, number]
              : [100, 400],
            sheen: src.sheen ?? 0,
            sheenColor: src.sheenColor?.clone() ?? new THREE.Color(0x000000),
            sheenRoughness: src.sheenRoughness ?? 1,
            specularIntensity: src.specularIntensity ?? 1,
            // Maps (if any were set by create())
            ...(src.map && { map: src.map }),
            ...(src.normalMap && { normalMap: src.normalMap }),
            ...(src.roughnessMap && { roughnessMap: src.roughnessMap }),
            ...(src.metalnessMap && { metalnessMap: src.metalnessMap }),
            ...(src.emissiveMap && { emissiveMap: src.emissiveMap }),
          });
          exportMat.name = assigned.name;
          // Dispose the intermediate source material — we only need the clean copy
          src.dispose();
          material = exportMat;
          console.log(`[GLB Export] ${md.name}: "${assigned.name}" (${assigned.category}) → color:#${exportMat.color.getHexString()} metal:${exportMat.metalness} rough:${exportMat.roughness} transmission:${exportMat.transmission} ior:${exportMat.ior} clearcoat:${exportMat.clearcoat}`);
        } else {
          // No user assignment — export the original GLB material
          material = md.originalMaterial.clone();
          console.log(`[GLB Export] ${md.name}: no assignment, using original material`);
        }

        const geo = md.geometry.clone();
        const mesh = new THREE.Mesh(geo, material);
        mesh.name = md.name;

        // Transforms from React state — always up-to-date
        mesh.position.copy(md.position);
        mesh.quaternion.copy(md.quaternion);
        mesh.scale.copy(md.scale);

        exportScene.add(mesh);
      });

      console.log('[GLB Export] Export scene built:', exportScene.children.length, 'meshes');
      const exporter = new GLTFExporter();
      const result = await exporter.parseAsync(exportScene, { binary: true });
      const blob = new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' });
      console.log('[GLB Export] Done. Blob size:', blob.size, 'bytes');
      return blob;
    },
    exportSceneStlBlob: async (scaleMm: number): Promise<Blob> => {
      // ── Identical data source as GLB export: meshDataListRef ──
      // React state is the single source of truth for geometry + transforms.
      const exportScene = new THREE.Scene();
      const currentMeshData = meshDataListRef.current;

      const meshNames = currentMeshData.map(m => m.name);
      console.log('[STL Export] Starting. meshDataList:', currentMeshData.length, 'names:', meshNames, 'scale:', scaleMm, 'mm/unit');

      if (currentMeshData.length === 0) {
        console.warn('[STL Export] ⚠ meshDataList is EMPTY — nothing to export');
      }

      currentMeshData.forEach((md) => {
        const material = new THREE.MeshStandardMaterial();
        const geo = md.geometry.clone();
        const mesh = new THREE.Mesh(geo, material);
        mesh.name = md.name;

        // Transforms from React state — always up-to-date (matches GLB export)
        mesh.position.copy(md.position);
        mesh.quaternion.copy(md.quaternion);
        mesh.scale.copy(md.scale).multiplyScalar(scaleMm);

        exportScene.add(mesh);
        console.log(`[STL Export] Added mesh "${md.name}" — verts:${geo.attributes.position?.count ?? 0} pos:(${md.position.x.toFixed(3)},${md.position.y.toFixed(3)},${md.position.z.toFixed(3)})`);
      });

      console.log('[STL Export] Export scene built:', exportScene.children.length, 'meshes');

      const exporter = new STLExporter();
      // Binary mode — more robust for multi-mesh scenes and produces smaller files
      const result = exporter.parse(exportScene, { binary: true });
      const blob = new Blob([result], { type: 'model/stl' });
      console.log(`[STL Export] Done. Blob size: ${blob.size} bytes, meshes: ${exportScene.children.length}, scale: ${scaleMm}mm/unit`);
      return blob;
    },
    exportSceneRawBlob: async (): Promise<Blob> => {
      // ── Export geometry at original real-world metre scale ──
      // Reverses the viewport normalisation (s = 2.2/maxDim, center offset)
      const exportScene = new THREE.Scene();
      const currentMeshData = meshDataListRef.current;
      const s = normScaleRef.current;
      const center = normCenterRef.current;

      console.log('[Raw Export] Starting. meshDataList:', currentMeshData.length, 'normScale:', s);

      currentMeshData.forEach((md) => {
        const material = new THREE.MeshStandardMaterial();
        const geo = md.geometry.clone();
        const mesh = new THREE.Mesh(geo, material);
        mesh.name = md.name;

        // Reverse normalisation: rawPos = (normalisedPos / s) + center
        const rawPosition = md.position.clone().divideScalar(s).add(center);
        const rawScale = md.scale.clone().divideScalar(s);
        // Quaternion is unaffected by uniform scaling
        mesh.position.copy(rawPosition);
        mesh.quaternion.copy(md.quaternion);
        mesh.scale.copy(rawScale);

        exportScene.add(mesh);
      });

      const exporter = new GLTFExporter();
      const result = await exporter.parseAsync(exportScene, { binary: true });
      const blob = new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' });
      console.log(`[Raw Export] Done. Blob size: ${blob.size} bytes, normScale: ${normScaleRef.current}`);
      return blob;
    },
  }), [meshDataList, assignedMaterials, inv, syncTransformFromObject, onTransformEnd, selectedMeshNames]);

  // Selection-change detection moved into useMemo below (synchronous)

  // ── Separate gemstone meshes from standard meshes ──
  // Track previous assignedMaterials to detect changes and clear stale cache entries synchronously
  const prevAssignedRef = useRef<Record<string, MaterialDef>>({});

  const { standardElements, gemElements } = useMemo(() => {
    // ── Clear "material applied after select" when selection changes (synchronous) ──
    const prevSel = prevSelectedRef.current;
    const selectionChanged = selectedMeshNames.size !== prevSel.size ||
      [...selectedMeshNames].some(n => !prevSel.has(n));
    if (selectionChanged) {
      materialAppliedAfterSelect.current.clear();
      prevSelectedRef.current = new Set(selectedMeshNames);
      // Ensure canvas re-renders with demand frameloop
      requestAnimationFrame(() => inv());
    }

    // Clear cache entries for meshes whose assigned material changed since last render
    const prevAssigned = prevAssignedRef.current;
    for (const name of Object.keys(assignedMaterials)) {
      if (prevAssigned[name]?.id !== assignedMaterials[name]?.id) {
        for (const [key] of materialCache.current) {
          if (key.includes(`_${name}_`)) {
            materialCache.current.get(key)?.dispose();
            materialCache.current.delete(key);
          }
        }
      }
    }
    for (const name of Object.keys(prevAssigned)) {
      if (!assignedMaterials[name] && prevAssigned[name]) {
        for (const [key] of materialCache.current) {
          if (key.includes(`_${name}_`)) {
            materialCache.current.get(key)?.dispose();
            materialCache.current.delete(key);
          }
        }
      }
    }
    prevAssignedRef.current = { ...assignedMaterials };

    const standard: (MeshData & { material: THREE.Material; isSelected: boolean })[] = [];
    const gems: { meshData: MeshData; materialSpec: ReferenceMaterialSpec; materialKey: string; isSelected: boolean }[] = [];
    let refractionGemCount = 0;

    meshDataList.forEach((md) => {
      // Skip hidden meshes entirely
      if (hiddenMeshNames.has(md.name)) return;

      const isSelected = selectedMeshNames.has(md.name);
      const assigned = assignedMaterials[md.name];
      const referenceKey = referenceKeyForMaterial(assigned, md.name);
      const referenceSpec = referenceKey ? REFERENCE_MATERIALS[referenceKey] : undefined;

      // Selection highlight — show blue overlay when selected, UNLESS the user
      // explicitly applied a material after selecting (materialAppliedAfterSelect).
      if (isSelected && !materialAppliedAfterSelect.current.has(md.name)) {
        standard.push({ ...md, material: SELECTION_MATERIAL, isSelected });
        return;
      }

      // Check if this mesh is assigned a gemstone material with refraction config
      if (referenceSpec?.kind === "gem") {
        // ── GEM MODE: "simple" → use high-quality PBR transmission (crash-safe, no custom shader) ──
        if (gemMode === "simple") {
          const simpleKey = `reference_fast_${md.name}_${referenceKey}`;
          let simpleMat = materialCache.current.get(simpleKey);
          if (!simpleMat) {
            simpleMat = makeReferencePhysicalMaterial(referenceSpec);
            materialCache.current.set(simpleKey, simpleMat);
          }
          standard.push({ ...md, material: simpleMat, isSelected });
          return;
        }

        if (!rawEnvironment) {
          const placeholderKey = `reference_placeholder_${md.name}_${referenceKey}`;
          let placeholder = materialCache.current.get(placeholderKey);
          if (!placeholder) {
            placeholder = makeReferenceGemPlaceholder(referenceSpec, md.geometry);
            materialCache.current.set(placeholderKey, placeholder);
          }
          standard.push({ ...md, material: placeholder, isSelected });
          return;
        }

        // Full BVH ray-traced gem shader, capped by the existing GPU-quality budget.
        if (refractionGemCount < Q.maxGemRefraction) {
          gems.push({ meshData: md, materialSpec: referenceSpec, materialKey: referenceKey!, isSelected });
          const hiddenKey = `reference_hidden_${md.name}`;
          let hiddenMat = materialCache.current.get(hiddenKey);
          if (!hiddenMat) {
            hiddenMat = new THREE.MeshBasicMaterial({ visible: false });
            materialCache.current.set(hiddenKey, hiddenMat);
          }
          standard.push({ ...md, material: hiddenMat, isSelected });
          refractionGemCount++;
        } else {
          // Over budget — use cheap fallback material (still looks like a gem, just no refraction)
          const fallbackKey = `reference_fallback_${md.name}_${referenceKey}`;
          let fallback = materialCache.current.get(fallbackKey);
          if (!fallback) {
            fallback = makeReferencePhysicalMaterial(referenceSpec);
            materialCache.current.set(fallbackKey, fallback);
          }
          standard.push({ ...md, material: fallback, isSelected });
        }
        return;
      }

      const cacheKey = referenceSpec
        ? `reference_${md.name}_${referenceKey}`
        : assigned ? `assigned_${md.name}_${assigned.id}` : `orig_${md.name}`;
      let material = materialCache.current.get(cacheKey);
      if (!material) {
        material = referenceSpec
          ? makeReferencePhysicalMaterial(referenceSpec)
          : assigned ? assigned.create() : md.originalMaterial.clone();
        if ('side' in material) (material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
        materialCache.current.set(cacheKey, material);
      }
      standard.push({ ...md, material, isSelected });
    });

    return { standardElements: standard, gemElements: gems, refractionGemCount };
  }, [meshDataList, assignedMaterials, selectedMeshNames, hiddenMeshNames, gemMode, rawEnvironment, inv]);

  // Report gem stats to parent for DebugHUD (event-driven, not per-frame)
  const gemTotal = Object.values(assignedMaterials).filter(m => m?.category === "gemstone").length;
  const gemRefraction = gemElements.length;
  const gemFallback = gemTotal - gemRefraction;
  useEffect(() => {
    let gemCount = 0;
    let triangleCount = 0;
    for (const mesh of meshDataList) {
      if (hiddenMeshNames.has(mesh.name)) continue;
      const positionCount = mesh.geometry.attributes.position?.count ?? 0;
      triangleCount += (mesh.geometry.index?.count ?? positionCount) / 3;
      const assigned = assignedMaterials[mesh.name];
      const referenceKey = referenceKeyForMaterial(assigned, mesh.name);
      if (referenceKey && REFERENCE_MATERIALS[referenceKey]?.kind !== "metal") gemCount++;
      else if (!referenceKey && assigned?.category === "gemstone") gemCount++;
    }
    onSceneWeightChange?.(gemCount >= 18 || triangleCount > 350000);
  }, [assignedMaterials, hiddenMeshNames, meshDataList, onSceneWeightChange]);

  useEffect(() => {
    onDebugGemStats?.(gemTotal, gemRefraction, gemFallback, 3);
  }, [gemTotal, gemRefraction, gemFallback, onDebugGemStats]);

  // ── Imperative transform sync: prevents React props from fighting TransformControls ──
  useEffect(() => {
    if (_isTransformDragging) return;
    meshDataList.forEach((md) => {
      const mesh = meshRefs.current.get(md.name);
      if (mesh) {
        mesh.position.copy(md.position);
        mesh.quaternion.copy(md.quaternion);
        mesh.scale.copy(md.scale);
      }
    });
    inv();
  }, [meshDataList, inv]);

  // Find selected mesh ref for TransformControls (primary = first selected)
  const selectedMeshName = meshDataList.find((m) => selectedMeshNames.has(m.name))?.name;
  const selectedMeshRef = selectedMeshName ? meshRefs.current.get(selectedMeshName) : undefined;

  // Collect sibling mesh refs (other selected meshes, excluding the primary)
  const [siblingObjects, setSiblingObjects] = useState<THREE.Object3D[]>([]);
  useEffect(() => {
    if (!selectedMeshName || selectedMeshNames.size <= 1) {
      setSiblingObjects([]);
      return;
    }

    const siblings: THREE.Object3D[] = [];
    for (const name of selectedMeshNames) {
      if (name === selectedMeshName) continue;
      const obj = meshRefs.current.get(name);
      if (obj) siblings.push(obj);
    }

    setSiblingObjects(siblings);
  }, [selectedMeshName, selectedMeshNames, meshDataList]);

  return (
    <group>
      {standardElements.map((md) => (
        <mesh
          key={md.name}
          ref={(r) => { if (r) meshRefs.current.set(md.name, r); }}
          geometry={md.geometry}
          material={md.material}
          castShadow
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            if (_isTransformDragging) return;
            onMeshClick(md.name, e.nativeEvent.shiftKey || e.nativeEvent.ctrlKey || e.nativeEvent.metaKey);
          }}
        />
      ))}

      {/* BVH gemstone overlay rendered separately from transform-authority meshes. */}
      {gemElements.map((gem) => (
        <SyncedGemOverlay
          key={`gem_${gem.meshData.name}`}
          meshName={gem.meshData.name}
          geometry={gem.meshData.geometry}
          position={gem.meshData.position}
          quaternion={gem.meshData.quaternion}
          scale={gem.meshData.scale}
          materialSpec={gem.materialSpec}
          materialKey={gem.materialKey}
          isSelected={gem.isSelected}
          meshRefs={meshRefs}
          onMeshClick={onMeshClick}
        />
      ))}

      {selectedMeshRef && transformMode !== "orbit" && (
        <TransformControlsWrapper
          object={selectedMeshRef}
          siblingObjects={siblingObjects}
          mode={transformMode as "translate" | "rotate" | "scale"}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onRotationDelta={handleRotationDelta}
        />
      )}
    </group>
  );
});

LoadedModel.displayName = "LoadedModel";

// Gem overlay: the hidden source mesh remains the transform authority while
// the reference implementation's custom BVH shader renders on top.

/**
 * SyncedGemOverlay renders one gem mesh with the reference BVH shader.
 * Syncs world transform from the source (hidden) mesh every frame.
 * Existing transforms and multi-selection remain authoritative.
 */
function SyncedGemOverlay({
  meshName,
  geometry,
  position,
  quaternion,
  scale,
  materialSpec,
  materialKey,
  isSelected,
  meshRefs,
  onMeshClick,
}: {
  meshName: string;
  geometry: THREE.BufferGeometry;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  materialSpec: ReferenceMaterialSpec;
  materialKey: string;
  isSelected: boolean;
  meshRefs: React.MutableRefObject<Map<string, THREE.Mesh>>;
  onMeshClick: (name: string, multi: boolean) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Pre-allocate reusable objects to avoid GC pressure in frame loop
  const _pos = useMemo(() => new THREE.Vector3(), []);
  const _quat = useMemo(() => new THREE.Quaternion(), []);
  const _scale = useMemo(() => new THREE.Vector3(), []);

  // Sync position from the hidden source mesh every frame
  useFrame(() => {
    const source = meshRefs.current.get(meshName);
    if (!meshRef.current || !source) return;

    source.updateWorldMatrix(true, false);
    source.matrixWorld.decompose(_pos, _quat, _scale);

    meshRef.current.position.copy(_pos);
    meshRef.current.quaternion.copy(_quat);
    meshRef.current.scale.copy(_scale);
  });

  return (
    <ReferenceGemMesh
      meshRef={meshRef}
      geometry={geometry}
      position={position}
      quaternion={quaternion}
      scale={scale}
      materialSpec={materialSpec}
      materialKey={materialKey}
      isSelected={isSelected}
      meshName={meshName}
      onMeshClick={onMeshClick}
    />
  );
}

/**
 * Consumes the active reference HDR and renders the custom BVH gem material.
 */
function ReferenceGemMesh({
  meshRef,
  geometry,
  position,
  quaternion,
  scale,
  materialSpec,
  materialKey,
  isSelected,
  meshName,
  onMeshClick,
}: {
  meshRef: React.RefObject<THREE.Mesh>;
  geometry: THREE.BufferGeometry;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  materialSpec: ReferenceMaterialSpec;
  materialKey: string;
  isSelected: boolean;
  meshName: string;
  onMeshClick: (name: string, multi: boolean) => void;
}) {
  const { rawEnvironment } = React.useContext(ReferenceEnvironmentContext);
  const gemMaterial = useMemo(() => {
    const filter = new THREE.Color(materialSpec.color).lerp(
      new THREE.Color(materialSpec.atten ?? materialSpec.color),
      materialSpec.atten === 0xffffff ? 0 : 0.55,
    );
    const material = new THREE.ShaderMaterial({
      uniforms: {
        envMap: { value: rawEnvironment ?? referenceWhiteEnvironment },
        bvh: { value: referenceBvhFor(geometry) },
        modelMatrixInverse: { value: new THREE.Matrix4() },
        bounces: { value: 3 },
        ior: { value: materialSpec.ior ?? 1.5 },
        aberrationStrength: { value: materialSpec.disp ?? 0.008 },
        fresnel: { value: 0.25 },
        colorFactor: { value: filter },
        envIntensity: { value: 1.2 },
        selected: { value: 0 },
      },
      vertexShader: REFERENCE_GEM_VERTEX_SHADER,
      fragmentShader: REFERENCE_GEM_FRAGMENT_SHADER,
      side: THREE.FrontSide,
      toneMapped: true,
    });
    material.name = materialSpec.label;
    material.userData.referenceGem = materialKey;
    return material;
  }, [geometry, materialKey, materialSpec, rawEnvironment]);

  useEffect(() => {
    gemMaterial.uniforms.envMap.value = rawEnvironment ?? referenceWhiteEnvironment;
    gemMaterial.needsUpdate = true;
  }, [gemMaterial, rawEnvironment]);

  useEffect(() => () => gemMaterial.dispose(), [gemMaterial]);

  const updateGemUniforms = useCallback(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.updateWorldMatrix(true, false);
    gemMaterial.uniforms.modelMatrixInverse.value.copy(mesh.matrixWorld).invert();
    gemMaterial.uniforms.selected.value = isSelected
      ? 0.3 + 0.25 * Math.sin(performance.now() * 0.006)
      : 0;
  }, [gemMaterial, isSelected, meshRef]);

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      position={position}
      quaternion={quaternion}
      scale={scale}
      material={gemMaterial}
      onBeforeRender={updateGemUniforms}
      castShadow
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        if (_isTransformDragging) return;
        onMeshClick(meshName, e.nativeEvent.shiftKey || e.nativeEvent.ctrlKey || e.nativeEvent.metaKey);
      }}
    />
  );
}


export interface MeshTransformData {
  position: [number, number, number];
  rotation: [number, number, number]; // degrees
  scale: [number, number, number];
}

export interface CADCanvasHandle {
  applyMaterial: (matId: string, meshNames: string[]) => void;
  resetTransform: (meshNames: string[]) => void;
  deleteMeshes: (meshNames: string[]) => void;
  duplicateMeshes: (meshNames: string[]) => void;
  flipNormals: (meshNames: string[]) => void;
  centerOrigin: (meshNames: string[]) => void;
  subdivideMesh: (meshNames: string[], iterations: number) => void;
  setWireframe: (on: boolean) => void;
  smoothMesh: (meshNames: string[], iterations: number) => void;
  applyTransform: (meshNames: string[]) => void;
  removeAllTextures: () => void;
  applyMagicTextures: () => void;
  getSnapshot: () => CanvasSnapshot;
  restoreSnapshot: (snap: CanvasSnapshot) => void;
  getSelectedTransform: () => MeshTransformData | null;
  setMeshTransform: (axis: 'x' | 'y' | 'z', property: 'position' | 'rotation' | 'scale', value: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetCamera: () => void;
  exportSceneBlob: () => Promise<Blob>;
  exportSceneStlBlob: (scaleMm: number) => Promise<Blob>;
  exportSceneRawBlob: () => Promise<Blob>;
}

interface CADCanvasProps {
  hasModel: boolean;
  glbUrl?: string;
  additionalGlbUrls?: string[];
  selectedMeshNames: Set<string>;
  hiddenMeshNames?: Set<string>;
  onMeshClick: (name: string, multi: boolean) => void;
  transformMode: string;
  onMeshesDetected?: (meshes: { name: string; verts: number; faces: number }[]) => void;
  onTransformStart?: () => void;
  onTransformEnd?: () => void;
  lightIntensity?: number;
  onModelReady?: () => void;
  magicTexturing?: boolean;
  qualityMode?: QualityMode;
  gemMode?: GemMode;
  onGemModeForced?: (mode: GemMode) => void;
}

const CADCanvas = forwardRef<CADCanvasHandle, CADCanvasProps>(
  ({ hasModel, glbUrl, additionalGlbUrls = [], selectedMeshNames, hiddenMeshNames = new Set(), onMeshClick, transformMode, onMeshesDetected, onTransformStart, onTransformEnd, lightIntensity = 1, onModelReady, magicTexturing = false, qualityMode = "balanced", gemMode = "simple", onGemModeForced }, ref) => {
    const modelUrl = glbUrl || "/models/ring.glb";
    const modelRef = useRef<CADCanvasHandle>(null);
    const [heavyScene, setHeavyScene] = useState(false);

    useEffect(() => () => {
      if (THREE.ShaderChunk.tonemapping_pars_fragment.includes("StartCompression = 0.8 - 0.04")) {
        THREE.ShaderChunk.tonemapping_pars_fragment = ORIGINAL_TONE_MAPPING_CHUNK;
      }
    }, []);
    
    // Compute effective quality settings based on mode
    const effectiveQ = useMemo(() => getSettingsForMode(qualityMode), [qualityMode]);
    const baseDpr = useMemo(() => {
      const deviceDpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
      return Math.min(deviceDpr, 2, effectiveQ.dpr[1]);
    }, [effectiveQ]);



    const getOrbitControls = useCallback(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('canvas');
      return canvas ? (canvas as any).__orbitControls : null;
    }, []);

    useImperativeHandle(ref, () => ({
      applyMaterial: (matId, meshNames) => modelRef.current?.applyMaterial(matId, meshNames),
      resetTransform: (meshNames) => modelRef.current?.resetTransform(meshNames),
      deleteMeshes: (meshNames) => modelRef.current?.deleteMeshes(meshNames),
      duplicateMeshes: (meshNames) => modelRef.current?.duplicateMeshes(meshNames),
      flipNormals: (meshNames) => modelRef.current?.flipNormals(meshNames),
      centerOrigin: (meshNames) => modelRef.current?.centerOrigin(meshNames),
      subdivideMesh: (meshNames, iters) => modelRef.current?.subdivideMesh(meshNames, iters),
      setWireframe: (on) => modelRef.current?.setWireframe(on),
      smoothMesh: (meshNames, iters) => modelRef.current?.smoothMesh(meshNames, iters),
      applyTransform: (meshNames) => modelRef.current?.applyTransform(meshNames),
      removeAllTextures: () => modelRef.current?.removeAllTextures(),
      applyMagicTextures: () => modelRef.current?.applyMagicTextures(),
      getSnapshot: () => modelRef.current!.getSnapshot(),
      restoreSnapshot: (snap) => modelRef.current?.restoreSnapshot(snap),
      getSelectedTransform: () => modelRef.current?.getSelectedTransform() ?? null,
      setMeshTransform: (axis, property, value) => modelRef.current?.setMeshTransform(axis, property, value),
      exportSceneBlob: () => modelRef.current!.exportSceneBlob(),
      exportSceneStlBlob: (scaleMm) => modelRef.current!.exportSceneStlBlob(scaleMm),
      exportSceneRawBlob: () => modelRef.current!.exportSceneRawBlob(),
      zoomIn: () => {
        const controls = getOrbitControls();
        if (!controls) return;
        const dir = new THREE.Vector3().subVectors(controls.target, controls.object.position).normalize();
        controls.object.position.addScaledVector(dir, controls.object.position.distanceTo(controls.target) * 0.2);
        controls.update();
      },
      zoomOut: () => {
        const controls = getOrbitControls();
        if (!controls) return;
        const dir = new THREE.Vector3().subVectors(controls.target, controls.object.position).normalize();
        controls.object.position.addScaledVector(dir, -controls.object.position.distanceTo(controls.target) * 0.2);
        controls.update();
      },
      resetCamera: () => {
        const controls = getOrbitControls();
        if (!controls) return;
        controls.object.position.set(0, 0.7, 5.4);
        controls.target.set(0, 0, 0);
        controls.update();
      },
    }));

    const [isLoading, setIsLoading] = useState(false);

    // ── Debug HUD state (only active when ?debug=1) ──
    const debugActive = isDebugMode();
    const [debugStats, setDebugStats] = useState<DebugStats>({
      totalVerts: 0, totalFaces: 0, meshCount: 0,
      gemMeshCountTotal: 0, gemMeshCountRefraction: 0, gemMeshCountFallback: 0,
      tier: Q.tier, dpr: Q.dpr, antialias: Q.antialias,
      refractionEnabled: false, effectiveGemBounces: Q.gemBounces,
      gpuRenderer: getGPURendererString(),
      contextLost: false, contextLostCount: 0,
    });
    const contextLostCountRef = useRef(0);

    // Update debug stats whenever meshes are detected (event-driven, not per-frame)
    const handleMeshesDetectedWithDebug = useCallback((meshes: { name: string; verts: number; faces: number }[]) => {
      onMeshesDetected?.(meshes);
      if (!debugActive) return;
      const totalVerts = meshes.reduce((s, m) => s + m.verts, 0);
      const totalFaces = meshes.reduce((s, m) => s + m.faces, 0);
      setDebugStats(prev => ({ ...prev, totalVerts, totalFaces, meshCount: meshes.length }));
    }, [onMeshesDetected, debugActive]);

    // ── WebGL context lost/restored listeners — ALWAYS ACTIVE (circuit breaker) ──
    const canvasContainerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
      const container = canvasContainerRef.current;
      if (!container) return;
      let canvasEl: HTMLCanvasElement | null = null;
      let onLost: ((event: Event) => void) | null = null;
      let onRestored: (() => void) | null = null;

      // Small delay to let R3F mount the canvas
      const timer = setTimeout(() => {
        canvasEl = container.querySelector('canvas');
        if (!canvasEl) return;

        onLost = (e: Event) => {
          e.preventDefault(); // allow restore
          contextLostCountRef.current++;
          const count = contextLostCountRef.current;
          console.error('[CADCanvas] ⚠ WebGL context LOST — event #' + count);

          // ── Circuit breaker: force simple gem mode for this session ──
          onGemModeForced?.("simple");

          // GPU toast suppressed — silent recovery, admin or not
          console.warn('[CADCanvas] GPU recovered — switched to Simple Gems silently');

          if (debugActive) {
            setDebugStats(prev => ({ ...prev, contextLost: true, contextLostCount: count }));
            trackWebGLContextLost({
              totalVerts: debugStats.totalVerts,
              totalFaces: debugStats.totalFaces,
              meshCount: debugStats.meshCount,
              gemMeshCountTotal: debugStats.gemMeshCountTotal,
              gemMeshCountRefraction: debugStats.gemMeshCountRefraction,
              tier: debugStats.tier,
              dpr: debugStats.dpr,
              gpuRenderer: debugStats.gpuRenderer,
              effectiveGemBounces: debugStats.effectiveGemBounces,
              contextLostCount: count,
            });
          }
        };

        onRestored = () => {
          console.log('[CADCanvas] ✓ WebGL context restored');
          if (debugActive) {
            setDebugStats(prev => ({ ...prev, contextLost: false }));
            trackWebGLContextRestored({
              tier: debugStats.tier,
              gpuRenderer: debugStats.gpuRenderer,
              contextLostCount: contextLostCountRef.current,
            });
          }
        };

        canvasEl.addEventListener('webglcontextlost', onLost);
        canvasEl.addEventListener('webglcontextrestored', onRestored);
      }, 500);

      return () => {
        clearTimeout(timer);
        if (canvasEl && onLost) canvasEl.removeEventListener('webglcontextlost', onLost);
        if (canvasEl && onRestored) canvasEl.removeEventListener('webglcontextrestored', onRestored);
      };
    }, [debugActive, onGemModeForced]); // intentionally not including debugStats to avoid re-registering

    // Track loading state from LoadedModel
    const handleLoadStart = useCallback(() => setIsLoading(true), []);
    const handleLoadEnd = useCallback(() => setIsLoading(false), []);

    return (
      <div ref={canvasContainerRef} className="w-full h-full relative" style={{ backgroundColor: '#f5f5f3' }}>
        {/* Debug HUD */}
        {debugActive && <DebugHUD stats={debugStats} />}
        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="text-center">
              <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
              <div className="font-display text-lg text-foreground/80 uppercase tracking-[0.15em] mb-1">Loading Model</div>
              <div className="font-mono text-[11px] text-muted-foreground tracking-wide">Parsing geometry…</div>
            </div>
          </div>
        )}
        <Canvas
          gl={{
            antialias: effectiveQ.antialias,
            alpha: false,
            preserveDrawingBuffer: true,
            toneMapping: THREE.CustomToneMapping,
            toneMappingExposure: 1.0 * lightIntensity,
            powerPreference: effectiveQ.tier === "low" ? "low-power" : "high-performance",
          }}
          dpr={baseDpr}
          camera={{ fov: 30, near: 0.1, far: 100, position: [0, 0.7, 5.4] }}
          onPointerMissed={() => { if (!_isTransformDragging) onMeshClick("", false); }}
          frameloop="demand"
          onCreated={({ gl }) => {
            installReferenceNeutralToneMapping();
            gl.toneMapping = THREE.CustomToneMapping;
            gl.toneMappingExposure = 1.0 * lightIntensity;
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.shadowMap.enabled = true;
            gl.shadowMap.type = THREE.PCFSoftShadowMap;
          }}
        >
        <Suspense fallback={null}>
          <MotionAdaptiveProvider baseDpr={baseDpr} heavyScene={heavyScene}>
          <ReferenceStudioEnvironment>
            {/* Dynamic light intensity sync */}
            <LightController intensity={lightIntensity} />
            <ReferenceStudioLighting />
            {/* Lighting — scaled by lightIntensity */}


            

            {hasModel && (
              <LoadedModel
                key={modelUrl}
                ref={modelRef}
                url={modelUrl}
                additionalGlbUrls={additionalGlbUrls}
                selectedMeshNames={selectedMeshNames}
                hiddenMeshNames={hiddenMeshNames}
                onMeshClick={onMeshClick}
                transformMode={transformMode}
                onMeshesDetected={handleMeshesDetectedWithDebug}
                onTransformStart={onTransformStart}
                onTransformEnd={onTransformEnd}
                onLoadStart={handleLoadStart}
                onLoadEnd={handleLoadEnd}
                onModelReady={onModelReady}
                magicTexturing={magicTexturing}
                gemMode={gemMode}
                onGemModeForced={onGemModeForced}
                onSceneWeightChange={setHeavyScene}
                onDebugGemStats={debugActive ? (total, refraction, fallback, bounces) => {
                  setDebugStats(prev => ({
                    ...prev,
                    gemMeshCountTotal: total,
                    gemMeshCountRefraction: refraction,
                    gemMeshCountFallback: fallback,
                    refractionEnabled: refraction > 0,
                    effectiveGemBounces: bounces,
                  }));
                } : undefined}
              />
            )}

            <OrbitControlsWithRef
              enablePan={true}
              enableZoom={true}
              enableDamping
              dampingFactor={0.03}
              minDistance={0.5}
              maxDistance={20}
              minPolarAngle={0}
              maxPolarAngle={Math.PI}
              makeDefault
            />
            <GizmoHelper alignment="bottom-right" margin={[70, 70]}>
              <GizmoViewport labelColor="white" axisHeadScale={0.8} />
            </GizmoHelper>

          </ReferenceStudioEnvironment>
          </MotionAdaptiveProvider>
          </Suspense>
        </Canvas>

      </div>
    );
  }
);

CADCanvas.displayName = "CADCanvas";
export default CADCanvas;

// Static ring.glb is preloaded via standard fetch for the default viewport
