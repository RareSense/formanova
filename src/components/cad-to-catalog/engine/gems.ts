// Gem shader of FormaNova's text-to-CAD viewer in Refract mode (CADCanvas.tsx,
// REFERENCE_GEM_*_SHADER), as the CAD to Pictures tool uses it: rays refract
// into the stone, bounce inside its own shape (a BVH of its mesh), sample the
// raw studio HDRI with per-channel dispersion, and mix with the reflection.

import * as THREE from 'three';
import { makeGemShaderMaterial, gemEntryStep } from '@/lib/jewelry-look';

export interface GemSpec {
  color: number;
  atten?: number;
  ior?: number;
  disp?: number;
}

/** The shared jewelry-look gem shader (one per stone shape). envMap: the raw studio equirect. */
export function referenceGemMaterial(geometry: THREE.BufferGeometry, envMap: THREE.Texture, spec: GemSpec, name: string, entryStep = 0.001) {
  return makeGemShaderMaterial(geometry, envMap, { ...spec, label: name }, entryStep);
}

export { gemEntryStep };

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
