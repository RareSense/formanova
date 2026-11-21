import * as THREE from 'three';

export type ViewName = 'front' | 'side' | 'top' | 'back';
export const VIEW_LABEL: Record<ViewName, string> = { front: 'Front', side: 'Side', top: 'Top', back: 'Back' };
export const VIEW_NAMES: ViewName[] = ['front', 'side', 'top', 'back'];
/** Half the picture's width in model units, as a share of the model's largest side: for dimension lines. */
export const VIEW_HALF = 0.58;

/** Pixels per side of each view picture: sharp at the PDF's size, light in memory. */
const VIEW_PX = 900;

/** Camera direction (from the model towards the camera) and up vector, per view and file axis. */
function viewDirection(view: ViewName, upAxis: 'y' | 'z'): { dir: THREE.Vector3; up: THREE.Vector3 } {
  if (upAxis === 'z') {
    if (view === 'front') return { dir: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, 1) };
    if (view === 'back') return { dir: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, 1) };
    if (view === 'side') return { dir: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 0, 1) };
    return { dir: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) };
  }
  if (view === 'front') return { dir: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) };
  if (view === 'back') return { dir: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0) };
  if (view === 'side') return { dir: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) };
  return { dir: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, -1) };
}

/**
 * Front, side, top and back pictures of the model as PNG data URLs: plain light-grey
 * shading on white, square, the piece centred and the same scale in all three,
 * like a bench drawing. Returns null when there is nothing to draw (every
 * part saved without a display mesh).
 */
export function renderViews(root: THREE.Object3D, upAxis: 'y' | 'z'): Record<ViewName, string> | null {
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return null;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const half = Math.max(size.x, size.y, size.z) * VIEW_HALF;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#ffffff');
  const material = new THREE.MeshStandardMaterial({ color: '#cfcfcf', metalness: 0.15, roughness: 0.5, side: THREE.DoubleSide });
  const model = root.clone(true);
  model.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = material; });
  scene.add(model);
  scene.add(new THREE.HemisphereLight('#ffffff', '#8a8a8a', 1.6));
  const key = new THREE.DirectionalLight('#ffffff', 1.4);
  scene.add(key, key.target);

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(VIEW_PX, VIEW_PX);
  const camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.001, half * 20);

  const out = {} as Record<ViewName, string>;
  try {
    for (const view of VIEW_NAMES) {
      const { dir, up } = viewDirection(view, upAxis);
      camera.position.copy(center).addScaledVector(dir, half * 8);
      camera.up.copy(up);
      camera.lookAt(center);
      camera.updateProjectionMatrix();
      // Light from just above and beside the camera, so edges read clearly.
      key.position.copy(camera.position).addScaledVector(up, half * 3);
      key.target.position.copy(center);
      renderer.render(scene, camera);
      out[view] = renderer.domElement.toDataURL('image/png');
    }
  } finally {
    renderer.dispose();
    material.dispose();
  }
  return out;
}
