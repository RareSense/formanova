// Saved camera angles, as the CAD to Pictures tool stores them: relative to
// the piece (direction, distance in "just fits" units, offset in piece radii,
// lens), so one set of angles fits every ring, not just the one it was made on.

import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface Angle {
  name: string;
  dir: [number, number, number] | number[];
  /** 1 = the piece just fits the picture with the usual margin. */
  dist?: number;
  offset?: number[];
  focal?: number;
}

/** Room around the piece: 1 = touching the frame; 1.5 leaves it about two-thirds of the picture. */
export const FIT_MARGIN = 1.5;
/** The picture box is centred in the view and fills 94% of it on its limiting side. */
export const FRAME_SHARE = 0.94;

interface View {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  holder: THREE.Object3D;
  viewSize(): [number, number];
  /** Width / height of the pictures being made (1 = square, the default). */
  pictureAspect?: number;
}

/** The picture box inside the view (x, y from the top left, in CSS px), in the picture's shape. */
export function frameRect(v: View) {
  const [w, h] = v.viewSize();
  const a = v.pictureAspect || 1;
  const bw = Math.min(w, h * a) * FRAME_SHARE;
  const bh = bw / a;
  return { x: (w - bw) / 2, y: (h - bh) / 2, w: bw, h: bh };
}

const sphere = (v: View) => new THREE.Box3().setFromObject(v.holder).getBoundingSphere(new THREE.Sphere());

/** The distance at which a sphere of this radius just fits the picture box (times FIT_MARGIN). */
export function fitDistance(v: View, radius: number, focal: number) {
  const k = frameRect(v).h / v.viewSize()[1];
  const fov = 2 * Math.atan(v.camera.getFilmHeight() / 2 / focal * k);
  const hfov = 2 * Math.atan(Math.tan(fov / 2) * (v.pictureAspect || 1)); // the box's width, by its shape
  return radius / Math.sin(Math.min(fov, hfov) / 2) * FIT_MARGIN;
}

export function applyAngle(v: View, a: Angle) {
  const { camera, controls } = v;
  const s = sphere(v);
  camera.setFocalLength(a.focal || 85);
  const target = s.center.clone().add(new THREE.Vector3(...((a.offset || [0, 0, 0]) as [number, number, number])).multiplyScalar(s.radius));
  const dist = fitDistance(v, s.radius, camera.getFocalLength()) * (a.dist || 1);
  controls.target.copy(target);
  camera.position.copy(target).add(new THREE.Vector3(...(a.dir as [number, number, number])).normalize().multiplyScalar(dist));
  camera.near = dist / 100;
  camera.far = dist * 100;
  camera.updateProjectionMatrix();
  controls.update();
}

export function currentAngle(v: View): Angle {
  const { camera, controls } = v;
  const s = sphere(v);
  const off = camera.position.clone().sub(controls.target);
  const focal = camera.getFocalLength();
  return {
    name: '',
    dir: off.clone().normalize().toArray().map((x) => +x.toFixed(4)),
    dist: +(off.length() / fitDistance(v, s.radius, focal)).toFixed(4),
    offset: controls.target.clone().sub(s.center).divideScalar(s.radius).toArray().map((x) => +x.toFixed(4)),
    focal: +focal.toFixed(1),
  };
}
