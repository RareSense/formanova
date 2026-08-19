import * as THREE from 'three';

/**
 * Khronos PBR Neutral tone mapping, installed over three's CustomToneMapping
 * slot.
 *
 * Why this exists: three 0.160 predates THREE.NeutralToneMapping (added in
 * r162), so the curve has to be supplied by hand. CADCanvas already does this
 * for the Studio viewport. That file is protected and cannot be edited, so the
 * curve lives here too and the two must stay identical: a ring rendered in a
 * history preview should look the same as the one the user opens in the Studio.
 *
 * The alternative, ACESFilmic, crushes highlights and pulls saturation out of
 * them, which reads as a different metal on gold and a different stone on
 * coloured gems. Neutral preserves colour, which is what jewellery needs.
 *
 * Patching THREE.ShaderChunk is global and permanent for the page, which is
 * fine and intended: every renderer that selects CustomToneMapping should get
 * this same curve.
 */
const NEUTRAL_TONE_MAPPING_CHUNK = /* glsl */`
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
}
`;

/** Matches CADCanvas's default (1.0 * intensity, intensity defaulting to 1). */
export const NEUTRAL_TONE_MAPPING_EXPOSURE = 1.0;

let installed = false;

/** Installs the neutral curve once per page, then configures the renderer to
 * use it at the same exposure as the Studio viewport. */
export function applyNeutralToneMapping(renderer: THREE.WebGLRenderer): void {
  if (!installed) {
    // Same literal replace CADCanvas performs, so both paths produce an
    // identical shader rather than merely a similar one.
    THREE.ShaderChunk.tonemapping_pars_fragment =
      THREE.ShaderChunk.tonemapping_pars_fragment.replace(
        "vec3 CustomToneMapping( vec3 color ) { return color; }",
        NEUTRAL_TONE_MAPPING_CHUNK,
      );
    installed = true;
  }
  renderer.toneMapping = THREE.CustomToneMapping;
  renderer.toneMappingExposure = NEUTRAL_TONE_MAPPING_EXPOSURE;
}
