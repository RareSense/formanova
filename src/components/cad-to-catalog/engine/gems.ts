// Gem shader of FormaNova's text-to-CAD viewer in Refract mode (CADCanvas.tsx,
// REFERENCE_GEM_*_SHADER), as the CAD to Pictures tool uses it: rays refract
// into the stone, bounce inside its own shape (a BVH of its mesh), sample the
// raw studio HDRI with per-channel dispersion, and mix with the reflection.

import * as THREE from 'three';
import { MeshBVH, MeshBVHUniformStruct, SAH, shaderStructs, shaderIntersectFunction } from 'three-mesh-bvh';

export interface GemSpec {
  color: number;
  atten?: number;
  ior?: number;
  disp?: number;
}

const bvhs = new WeakMap<THREE.BufferGeometry, MeshBVHUniformStruct>(); // shared by identical stones
function bvhFor(geometry: THREE.BufferGeometry): MeshBVHUniformStruct {
  let u = bvhs.get(geometry);
  if (!u) {
    u = new MeshBVHUniformStruct();
    u.updateFrom(new MeshBVH(geometry.clone().toNonIndexed(), { strategy: SAH }));
    bvhs.set(geometry, u);
  }
  return u;
}

const vertexShader = /* glsl */ `
varying vec3 vWorldPosition;
varying vec3 vNormal;
void main(){
  vec4 wp=modelMatrix*vec4(position,1.0);
  vWorldPosition=wp.xyz;
  vNormal=normalize(mat3(modelMatrix)*normal);
  gl_Position=projectionMatrix*viewMatrix*wp;
}`;

const fragmentShader = /* glsl */ `
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
  gl_FragColor=vec4(col,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** One material per stone shape (the BVH is the shape). envMap: the raw (not PMREM) studio HDRI. */
export function referenceGemMaterial(geometry: THREE.BufferGeometry, envMap: THREE.Texture, spec: GemSpec, name: string) {
  const filter = new THREE.Color(spec.color).lerp(new THREE.Color(spec.atten ?? spec.color), spec.atten === 0xffffff ? 0 : 0.55);
  const m = new THREE.ShaderMaterial({
    name,
    vertexShader,
    fragmentShader,
    side: THREE.FrontSide,
    toneMapped: true,
    uniforms: {
      envMap: { value: envMap },
      bvh: { value: bvhFor(geometry) },
      modelMatrixInverse: { value: new THREE.Matrix4() },
      bounces: { value: 3 },
      ior: { value: spec.ior ?? 1.5 },
      aberrationStrength: { value: spec.disp ?? 0.008 },
      fresnel: { value: 0.25 },
      colorFactor: { value: filter },
      envIntensity: { value: 1.2 },
    },
  });
  m.userData.reference = true;
  return m;
}

// FormaNova's tone curve for that viewer, installed as three's CustomToneMapping
// exactly as CADCanvas.tsx installs it (same guard, so either can run first).
const ORIGINAL_TONE_MAPPING_CHUNK = THREE.ShaderChunk.tonemapping_pars_fragment;
export function installReferenceToneMapping() {
  if (THREE.ShaderChunk.tonemapping_pars_fragment.includes('StartCompression = 0.8 - 0.04')) return;
  THREE.ShaderChunk.tonemapping_pars_fragment = ORIGINAL_TONE_MAPPING_CHUNK.replace('vec3 CustomToneMapping( vec3 color ) { return color; }', /* glsl */ `
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
}`);
}
