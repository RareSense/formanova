/**
 * The one refraction shader every FormaNova viewer draws stones with (Studio,
 * history cards, admin / CAD to Catalog). It needs no transmission pass: rays
 * refract into the stone, bounce inside its own shape (a BVH of its mesh) and
 * sample the raw studio light, so it also works in the history grid's
 * scissor-split canvas.
 *
 * What it adds to stand in for Cycles' 24 transmission bounces:
 *  - a ray that leaves the stone heading away from the camera hits the metal
 *    seat; it returns the studio light mirrored off a seat-coloured surface
 *    (the warm glow under Blender's stones);
 *  - split IOR per channel (Blender's dispersion triple).
 */
import * as THREE from 'three';
import { MeshBVH, MeshBVHUniformStruct, SAH, shaderStructs, shaderIntersectFunction } from 'three-mesh-bvh';
import type { JewelryPreset } from './presets';

/** Brightness of the studio light seen through a stone. */
export const GEM_SHADER_ENV_INTENSITY = 2.2;
/** Internal bounces traced per ray. */
export const GEM_SHADER_BOUNCES = 5;
/** Linear colour of the seat light under a stone (Blender 18k yellow F0). */
export const GEM_SEAT_COLOR: [number, number, number] = [1.0, 0.76, 0.4];
/** How much of a ray heading into the seat takes the seat's colour (0..1). */
export const GEM_SEAT_MIX = 0.85;
/** Light the lit metal seat adds on its own (linear, before exposure). */
export const GEM_SEAT_LEVEL = 1.0;

export const GEM_VERTEX_SHADER = /* glsl */ `
varying vec3 vWorldPosition;
varying vec3 vNormal;
void main(){
  vec4 wp=modelMatrix*vec4(position,1.0);
  vWorldPosition=wp.xyz;
  vNormal=normalize(mat3(modelMatrix)*normal);
  gl_Position=projectionMatrix*viewMatrix*wp;
}`;

export const GEM_FRAGMENT_SHADER = /* glsl */ `
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
uniform float entryStep;
uniform float selected;
uniform vec3 seatColor;
uniform float seatMix;
uniform float seatLevel;
uniform float localEps;

vec3 sampleEnv(vec3 dir){
  vec2 uv=vec2(atan(dir.z,dir.x)*0.1591549431+0.5,asin(clamp(dir.y,-1.0,1.0))*0.3183098862+0.5);
  return texture2D(envMap,uv).rgb;
}
vec3 traceStone(vec3 incoming,float ior_){
  vec3 rayDirection=refract(incoming,vNormal,1.0/ior_);
  // Step in by a fraction of the stone's own size (local units), so the first hit is
  // the far wall, not the facet the ray entered through.
  rayDirection=normalize((modelMatrixInverse*vec4(rayDirection,0.0)).xyz);
  vec3 rayOrigin=(modelMatrixInverse*vec4(vWorldPosition,1.0)).xyz+rayDirection*localEps*20.0;
  for(float i=0.0;i<8.0;i++){
    if(i>=bounces)break;
    uvec4 faceIndices=uvec4(0u);
    vec3 faceNormal=vec3(0.0,0.0,1.0);
    vec3 barycoord=vec3(0.0);
    float side=1.0;
    float dist=0.0;
    bvhIntersectFirstHit(bvh,rayOrigin,rayDirection,faceIndices,faceNormal,barycoord,side,dist);
    vec3 hitPos=rayOrigin+rayDirection*max(dist-localEps,0.0);
    vec3 tempDir=refract(rayDirection,faceNormal*side,ior_);
    if(length(tempDir)!=0.0){rayDirection=tempDir;break;}
    rayDirection=reflect(rayDirection,faceNormal*side);
    rayOrigin=hitPos+rayDirection*localEps*4.0;
  }
  return normalize((modelMatrix*vec4(rayDirection,0.0)).xyz);
}
// Light a ray leaving the stone brings back: the studio, or (heading into the
// setting, away from the camera) the studio mirrored off the warm metal seat.
vec3 exitLight(vec3 d,vec3 view){
  vec3 env=sampleEnv(d);
  float into=smoothstep(0.1,0.8,dot(d,view));
  vec3 seat=(sampleEnv(reflect(d,-view))+seatLevel)*seatColor;
  return mix(env,seat,into*seatMix);
}
void main(){
  vec3 viewDirection=normalize(vWorldPosition-cameraPosition);
  vec3 dG=traceStone(viewDirection,max(ior,1.0));
  vec3 col;
  if(aberrationStrength>0.0){
    vec3 dR=traceStone(viewDirection,max(ior*(1.0-aberrationStrength),1.0));
    vec3 dB=traceStone(viewDirection,max(ior*(1.0+aberrationStrength),1.0));
    col=vec3(exitLight(dR,viewDirection).r,exitLight(dG,viewDirection).g,exitLight(dB,viewDirection).b);
  }else{
    col=exitLight(dG,viewDirection);
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

/** Ray offset inside a stone, in its own (local) units: a fixed 0.001 / 0.01 jumped
 * clean out of a 1.3 mm stone stored in metres, so every ray left at the first wall. */
function stoneEps(geometry: THREE.BufferGeometry): number {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const d = geometry.boundingBox!.getSize(new THREE.Vector3()).length();
  return Math.max(d * 0.0005, 1e-9);
}

const bvhs = new WeakMap<THREE.BufferGeometry, MeshBVHUniformStruct>(); // shared by identical stones
export function gemBvhFor(geometry: THREE.BufferGeometry): MeshBVHUniformStruct {
  let u = bvhs.get(geometry);
  if (!u) {
    u = new MeshBVHUniformStruct();
    u.updateFrom(new MeshBVH(geometry.index ? geometry.clone().toNonIndexed() : geometry.clone(), { strategy: SAH }));
    bvhs.set(geometry, u);
  }
  return u;
}

export type GemShaderSpec = Pick<JewelryPreset, 'color' | 'atten' | 'ior' | 'disp'> & { label?: string };

/** Colour factor: the stone's deep colour. */
export function gemShaderColor(p: { color: number; atten?: number }): THREE.Color {
  return new THREE.Color(p.atten ?? p.color);
}

/**
 * One material per stone shape (the BVH is the shape). envMap: the raw (not PMREM)
 * studio equirect. entryStep: world-unit step into the stone before tracing,
 * 0.001 for a piece ~2.2 units across (see gemEntryStep).
 * Each draw needs its own inverse model matrix: call updateGemShaderMatrix in the
 * mesh's onBeforeRender (identical stones share the material).
 */
export function makeGemShaderMaterial(geometry: THREE.BufferGeometry, envMap: THREE.Texture, spec: GemShaderSpec, entryStep = 0.001, opts: { bounces?: number; dispersion?: boolean } = {}): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    name: spec.label ?? 'Gem',
    vertexShader: GEM_VERTEX_SHADER,
    fragmentShader: GEM_FRAGMENT_SHADER,
    side: THREE.FrontSide,
    toneMapped: true,
    uniforms: {
      envMap: { value: envMap },
      bvh: { value: gemBvhFor(geometry) },
      modelMatrixInverse: { value: new THREE.Matrix4() },
      bounces: { value: opts.bounces ?? GEM_SHADER_BOUNCES },
      ior: { value: spec.ior ?? 1.5 },
      aberrationStrength: { value: opts.dispersion === false ? 0 : (spec.disp ?? 0.008) },
      fresnel: { value: 0.25 },
      colorFactor: { value: gemShaderColor(spec) },
      envIntensity: { value: GEM_SHADER_ENV_INTENSITY },
      entryStep: { value: entryStep },
      selected: { value: 0 },
      seatColor: { value: new THREE.Vector3(...GEM_SEAT_COLOR) },
      seatMix: { value: GEM_SEAT_MIX },
      seatLevel: { value: GEM_SEAT_LEVEL },
      localEps: { value: stoneEps(geometry) },
    },
  });
  m.userData.reference = true;
  return m;
}

/** Per-draw uniform update for a shared gem shader material. */
export function updateGemShaderMatrix(mesh: THREE.Object3D, material: THREE.Material) {
  const m = material as THREE.ShaderMaterial;
  if (!m.userData?.reference || !m.uniforms?.modelMatrixInverse) return;
  m.uniforms.modelMatrixInverse.value.copy(mesh.matrixWorld).invert();
  m.uniformsNeedUpdate = true;
}

/** Entry step for a piece of this size in world units (0.001 at 2.2 units). */
export const gemEntryStep = (pieceSize: number) => 0.001 * Math.max(pieceSize, 1e-6) / 2.2;
