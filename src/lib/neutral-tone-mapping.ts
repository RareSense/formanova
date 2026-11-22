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
vec3 jewelGrade( vec3 c ) {
  vec3 d = pow( max( c, 0.0 ), vec3( 1.0 / 2.2 ) );
  d = clamp( ( d - 0.5 ) * 1.18 + 0.5, 0.0, 1.0 );
  vec3 l = pow( d, vec3( 2.2 ) );
  float y = dot( l, vec3( 0.2126, 0.7152, 0.0722 ) );
  return max( mix( vec3( y ), l, 1.04 ), 0.0 );
}
vec3 CustomToneMapping( vec3 color ) {
  // ACES Filmic (three's curve, as the reference jewelry viewer uses), then the
  // jewelry grade. The neutral curve below is kept only as the install marker.
  return jewelGrade( ACESFilmicToneMapping( color ) );
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
  return jewelGrade( mix( color, vec3( newPeak ), g ) );
}
`;

/** Matches CADCanvas's default (0.97 * intensity, intensity defaulting to 1).
 * The grade above (contrast 1.18, saturation 1.04) is CADCanvas's jewelGrade. */
export const NEUTRAL_TONE_MAPPING_EXPOSURE = 0.97;

let installed = false;

/** Installs the neutral curve once per page, then configures the renderer to
 * use it at the same exposure as the Studio viewport. */
export function applyNeutralToneMapping(renderer: THREE.WebGLRenderer): void {
  // CADCanvas may have installed the identical chunk first.
  if (THREE.ShaderChunk.tonemapping_pars_fragment.includes("StartCompression = 0.8 - 0.04")) installed = true;
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

/**
 * The environment CADCanvas lights with by default (its `diamond` key, a
 * bright softbox studio shared by metal and stones).
 *
 * On polished metal the environment IS the appearance: every highlight and
 * reflection is the room, not the lights. The history preview used to load a
 * different HDRI, so matching the tone mapping and the light rig still left it
 * looking like a different piece once opened in the Studio.
 */
export const STUDIO_ENVIRONMENT_HDR = '/hdri/ijewel-metal-068.exr';

/**
 * The Studio viewport's backdrop: a vertical white to light grey gradient,
 * mirroring CADCanvas's makeReferenceBackground.
 *
 * Deliberately fixed rather than themed. It is a photographic sweep, the same
 * idea as the paper behind a product shot, so the ring is judged against a
 * neutral ground in every theme. History previews used the theme background
 * instead, which is near-black in dark mode and made the same model read
 * completely differently.
 *
 * CADCanvas is protected and cannot import this, so the two must stay in step.
 */
export function makeStudioBackdrop(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.CanvasTexture(canvas);
  const gradient = context.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(1, '#f4f5f7');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 2, 512);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
