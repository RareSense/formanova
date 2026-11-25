/**
 * The Blender studio light (research-vm ~/work/queue/studio_render.py) as a
 * browser environment map. Blender uses no HDRI file: a mid-dark world (0.05)
 * plus seven area-light softboxes around the piece, view transform Standard,
 * exposure -1.4. This module draws the same softboxes into an equirectangular
 * float texture, so the same reflections (white bands, dark gaps, one spark)
 * show on metal and inside stones in every viewer.
 *
 * Differences that cannot be copied: three.js reflects the softboxes as an
 * infinitely distant environment (no parallax), there is no cavity AO, no
 * F82 edge tint, no true dispersion. See the PR for the full list.
 */
import * as THREE from 'three';

/** World grey seen in reflections. Blender uses 0.05, but its gold also gathers light
 * from the lit backdrop and floor (Cycles bounces); our viewers have no such surfaces,
 * so the world stands in for them. 1.0 gives the closest gold to the Blender
 * three-quarter render (mean gold colour dE ~7; 0.6 was dE 10 and darker, 1.5 dE 13 and too bright). */
export const STUDIO_WORLD = 1.0;
/** Blender: --light-scale default when the world is dark. */
export const STUDIO_LIGHT_SCALE = 10;
/** Blender: --exposure default when the world is dark, in stops. */
export const STUDIO_EXPOSURE_STOPS = -1.4;
/** Renderer exposure equal to Blender's -1.4 stops. */
export const STUDIO_EXPOSURE = Math.pow(2, STUDIO_EXPOSURE_STOPS);
/** Blender: camera-ray backdrop, linear grey 0.88 (shown at exposure 0). */
export const STUDIO_BACKDROP_LINEAR = [0.88, 0.88, 0.89] as const;

export interface Softbox {
  name: string;
  /** Offset from the piece centre in model radii, Blender axes (Z up, -Y toward the camera). */
  offset: [number, number, number];
  /** Width, height in model radii (disk: diameter). */
  size: [number, number];
  /** Blender strength (radiance-like). */
  strength: number;
  disk?: boolean;
}

/** Copied from studio_render.py main(). */
export const STUDIO_SOFTBOXES: Softbox[] = [
  { name: 'top', offset: [0, 0, 4], size: [4, 4], strength: 1.6 },
  { name: 'key', offset: [3, -3, 2.5], size: [2.5, 4], strength: 2.4 },
  { name: 'fill', offset: [-3.5, -2, 1.5], size: [3, 3], strength: 0.9 },
  { name: 'strip_L', offset: [-3, 1.5, 1], size: [0.5, 5], strength: 4 },
  { name: 'strip_R', offset: [3.2, 1, 1.2], size: [0.5, 5], strength: 3.2 },
  { name: 'front_low', offset: [0, -4, -0.4], size: [5, 1.2], strength: 1 },
  { name: 'spark', offset: [1, -2, 3.5], size: [0.12, 0.12], strength: 60, disk: true },
];

type V3 = [number, number, number];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
/** Blender (x, y, z) Z-up, -Y front -> three (x, z, -y) Y-up, +Z front. */
const toThree = (b: V3): V3 => [b[0], b[2], -b[1]];

/** Radiance of a softbox: Blender area-light energy = strength * area * scale, so radiance
 * is strength * scale (calibrated against the Blender ring render, see PR). */
export const softboxRadiance = (s: Softbox) => s.strength * STUDIO_LIGHT_SCALE;

/** Linear RGBA float pixels of the studio light, equirectangular (three's mapping). */
export function studioEnvironmentPixels(width = 1024, height = 512, world = STUDIO_WORLD): Float32Array {
  const boxes = STUDIO_SOFTBOXES.map((s) => {
    const c = toThree(s.offset);
    const n = unit([-c[0], -c[1], -c[2]]); // faces the piece
    // Blender to_track_quat('-Z', 'Y'): local Y stays as close to world up as it can.
    const ref: V3 = Math.abs(n[1]) > 0.99 ? [0, 0, -1] : [0, 1, 0];
    const u = unit(cross(ref, n));
    const v = cross(n, u);
    return { c, n, u, v, half: [s.size[0] / 2, s.size[1] / 2], disk: !!s.disk, L: softboxRadiance(s) };
  });
  const px = new Float32Array(width * height * 4);
  for (let j = 0; j < height; j++) {
    // three equirect: v = asin(y)/pi + 0.5, row 0 = bottom (flipY false on DataTexture).
    const lat = ((j + 0.5) / height - 0.5) * Math.PI;
    for (let i = 0; i < width; i++) {
      const lon = ((i + 0.5) / width - 0.5) * 2 * Math.PI;
      // inverse of u = atan(z, x) / 2pi + 0.5
      const d: V3 = [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
      let L = world;
      for (const b of boxes) {
        const den = -dot(d, b.n);
        if (den <= 1e-4) continue;
        const t = dot(b.c, b.n) / -den;
        if (t <= 0) continue;
        const p: V3 = [d[0] * t - b.c[0], d[1] * t - b.c[1], d[2] * t - b.c[2]];
        const x = dot(p, b.u), y = dot(p, b.v);
        const inside = b.disk ? x * x + y * y <= b.half[0] * b.half[0] : Math.abs(x) <= b.half[0] && Math.abs(y) <= b.half[1];
        if (inside) L += b.L;
      }
      const k = (j * width + i) * 4;
      px[k] = L; px[k + 1] = L; px[k + 2] = L; px[k + 3] = 1;
    }
  }
  return px;
}

/** World level the refraction gem shaders see. Cycles stones gather light from
 * the bright gold seat and many bounces; a one-bounce browser shader looking
 * into the 0.05 world reads near-black, so the stones see a lifted world.
 * Tuned against the Blender stone close-ups. */
export const GEM_ENV_WORLD = 1.0;

const cachedHalf = new Map<number, Uint16Array>();

/** Raw equirectangular studio texture (for the refraction shader and PMREM).
 * Half float: filterable on every WebGL2 GPU, unlike full float. */
export function createStudioEquirect(world = STUDIO_WORLD): THREE.DataTexture {
  const w = 1024, h = 512;
  let half = cachedHalf.get(world);
  if (!half) {
    const f = studioEnvironmentPixels(w, h, world);
    half = new Uint16Array(f.length);
    for (let i = 0; i < f.length; i++) half[i] = THREE.DataUtils.toHalfFloat(Math.min(f[i], 65000));
    cachedHalf.set(world, half);
  }
  const tex = new THREE.DataTexture(half, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export interface StudioLight {
  /** Raw equirect studio texture. */
  raw: THREE.DataTexture;
  /** Raw equirect the refraction gem shaders sample (world lifted to GEM_ENV_WORLD). */
  gemRaw: THREE.DataTexture;
  /** PMREM texture for scene.environment. */
  env: THREE.Texture;
  dispose(): void;
}

export function createStudioLight(renderer: THREE.WebGLRenderer): StudioLight {
  const raw = createStudioEquirect();
  const gemRaw = createStudioEquirect(GEM_ENV_WORLD);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromEquirectangular(raw);
  pmrem.dispose();
  return { raw, gemRaw, env: target.texture, dispose: () => { target.dispose(); raw.dispose(); gemRaw.dispose(); } };
}

/** Camera backdrop: Blender's flat light grey. three does not tone-map a Color background. */
export function studioBackdropColor(): THREE.Color {
  const [r, g, b] = STUDIO_BACKDROP_LINEAR;
  return new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
}
