import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';

/** Loads a studio light (.hdr or .exr) as an equirectangular texture. */
export async function loadEnvironment(url: string): Promise<THREE.Texture> {
  const path = url.split('?')[0].toLowerCase();
  const texture = path.endsWith('.exr')
    ? await new EXRLoader().loadAsync(url)
    : await new RGBELoader().loadAsync(url);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}

/** Studio lights for metal and stones. */
export const IJEWEL_METAL_LIGHT = '/hdri/ijewel-metal-068.exr';
export const IJEWEL_GEM_LIGHT = '/hdri/ijewel-gem-004.exr';
