// CatalogEngine: the CAD to Pictures viewer behind a small API. It opens a CAD
// file, shows it in FormaNova's Refract look, lets parts be picked and given
// metals / stones, moves the camera to saved angles and takes pictures.
// React panels read its state and call its methods; it never touches the DOM
// outside its own canvas.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { loadCad, UNIT_SCALE, type LoadInfo, type LoadOptions } from './formats';
import { classify, collectParts, buildSets, splitByConnectivity, type Part, type PartSet, type PartGroup } from './parts';
import { MaterialCache, PRESETS, gemFromName, type Choice } from './materials';
import { Look, type Backdrop, type StudioId } from './look';
import { applyAngle, currentAngle, fitDistance, frameRect, type Angle } from './camera';

export interface EngineState {
  fileName: string;
  parts: Part[];
  sets: PartSet[];
  selected: Set<string>;
  info: LoadInfo | null;
  canUndo: boolean;
  canRedo: boolean;
  ready: boolean;
}

type Snapshot = [string, Choice | null][];

export class CatalogEngine {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 10000);
  readonly controls: OrbitControls;
  readonly holder = new THREE.Group(); // centres the piece and stands it on the floor
  private scene = new THREE.Scene();
  private axis = new THREE.Group(); // file units -> mm, Z-up -> Y-up
  private look: Look;
  private materials = new MaterialCache();
  private model: THREE.Object3D | null = null;
  private byId = new Map<string, Part>();
  private history: Snapshot[] = [];
  private future: Snapshot[] = [];
  private glows: THREE.Mesh[] = [];
  // polygonOffset draws the highlight a hair in front of its part: drawn at exactly the same
  // depth the two fought frame to frame, and the selected part flickered.
  private glowMat = new THREE.MeshBasicMaterial({ color: 0x1565ff, transparent: true, opacity: 0.6, depthWrite: false, depthFunc: THREE.LessEqualDepth, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  private needsRender = true;
  private busy = false;
  private moving = false;
  private stillTimer = 0;
  private loadSeq = 0;
  private listeners = new Set<() => void>();
  private resizeObserver: ResizeObserver;
  private down: [number, number] | null = null;
  private fitDist = 1;
  state: EngineState = { fileName: '', parts: [], sets: [], selected: new Set(), info: null, canUndo: false, canRedo: false, ready: false };

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
    this.camera.filmGauge = 35;
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.zoomToCursor = false; // zoom stays on the piece
    this.controls.addEventListener('change', () => { this.needsRender = true; this.moved(); });
    this.holder.add(this.axis);
    this.scene.add(this.holder);
    this.look = new Look(this.renderer, this.scene, this.camera, () => this.refreshGems());
    this.look.setStudio('photo').catch((e) => console.warn(e));
    this.renderer.setAnimationLoop(() => {
      if (this.busy) return;
      if (this.controls.update()) this.needsRender = true;
      if (!this.needsRender) return;
      this.needsRender = false;
      this.look.drawFrame();
    });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointerup', this.onPointerUp);
  }

  /* ---------- events ---------- */

  subscribe(f: () => void) { this.listeners.add(f); return () => { this.listeners.delete(f); }; }
  private changed() {
    this.state = { ...this.state, canUndo: this.history.length > 0, canRedo: this.future.length > 0, ready: this.look.ready };
    this.listeners.forEach((f) => f());
  }

  /* ---------- opening a file ---------- */

  /** Opens a CAD file; throws with a plain-words reason when it cannot. */
  async open(file: File, files: Map<string, File>, opts: LoadOptions = {}) {
    if (this.busy) throw new Error('Pictures are still being taken');
    const seq = ++this.loadSeq;
    this.clear();
    const { root, info } = await loadCad(file, files, opts);
    if (seq !== this.loadSeq) return null; // another file was opened meanwhile

    // STL/PLY arrive as one mesh; split it so every stone is its own part.
    const meshes: THREE.Mesh[] = [];
    root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    if (meshes.length === 1) replaceWithPieces(meshes[0], splitByConnectivity(meshes[0]));

    const layers = root.userData.layers;
    const layerOf = (mesh: THREE.Mesh) => {
      const i = mesh.userData.attributes?.layerIndex;
      return layers && i >= 0 && layers[i] ? layers[i].name || '' : '';
    };
    root.updateMatrixWorld(true);
    const maxDim = Math.max(...new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).toArray());
    let parts = collectParts(root, layerOf);
    if (!parts.length) throw new Error(info.rhino?.noMesh ? 'every surface in this Rhino file was saved without a display mesh' : 'the file has no surfaces to show');
    let kinds = classify(parts, maxDim);
    // A stone part holding many separate stones (a halo saved as one mesh) would
    // refract as one giant stone: one part per stone.
    let split = false;
    for (const p of parts) {
      if (p.group !== 'stone') continue;
      const pieces = splitByConnectivity(p.mesh);
      if (!pieces) continue;
      pieces.forEach((q, i) => { q.userData.attributes = p.mesh.userData.attributes; q.name = `${p.name} ${i + 1}`; });
      replaceWithPieces(p.mesh, pieces);
      split = true;
    }
    if (split) { parts = collectParts(root, layerOf); kinds = classify(parts, maxDim); }

    for (const p of parts) {
      p.mesh.castShadow = true;
      p.mesh.onBeforeRender = (_r, _s, _c, _g, mat: THREE.Material) => {
        // Shared by identical stones: each draw needs its own inverse matrix.
        if (mat.userData.reference) {
          (mat as THREE.ShaderMaterial).uniforms.modelMatrixInverse.value.copy(p.mesh.matrixWorld).invert();
          (mat as THREE.ShaderMaterial).uniformsNeedUpdate = true;
        }
      };
      // Stones start as refractive gems (a flat file colour cannot refract); metal
      // keeps what the file says; parts with no material at all start as yellow gold.
      p.choice = p.group === 'stone' ? { kind: 'preset', id: gemFromName(`${p.source.name} ${p.name}`) }
        : p.source.isDefault ? { kind: 'preset', id: 'gold-yellow' } : null;
    }
    this.axis.add(root);
    this.axis.scale.setScalar(UNIT_SCALE[info.units] || 1);
    this.axis.rotation.set(info.upAxis === 'z' ? -Math.PI / 2 : 0, 0, 0);
    this.holder.position.set(0, 0, 0);
    this.holder.updateMatrixWorld(true);
    // Exact (vertex) bounds, so rotated stones do not lift the piece off the floor.
    const b = new THREE.Box3().setFromObject(this.holder, true);
    const c = b.getCenter(new THREE.Vector3());
    this.holder.position.set(-c.x, -b.min.y, -c.z);
    this.model = root;
    this.byId = new Map(parts.map((p) => [p.id, p]));
    for (const p of parts) this.apply(p);
    this.look.placeFor(this.sphere().radius);
    this.state = { ...this.state, fileName: file.name, parts, sets: buildSets(kinds), selected: new Set(), info };
    this.history = [];
    this.future = [];
    this.fit();
    this.changed();
    return info;
  }

  get hasModel() { return !!this.model; }
  /** Lighting and gem environment loaded, so a picture comes out right. */
  get isReady() { return this.look.ready; }

  clear() {
    if (!this.model) return;
    this.clearGlow();
    this.axis.remove(this.model);
    this.model.traverse((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry?.dispose());
    this.model = null;
    this.byId.clear();
    this.state = { ...this.state, fileName: '', parts: [], sets: [], selected: new Set(), info: null };
    this.changed();
  }

  /* ---------- materials ---------- */

  private apply(p: Part) {
    p.mesh.material = p.choice ? this.materials.material(p.choice, p.mesh.geometry, p.maxDim || 1, this.look.gemEnv) : p.mesh.userData.c2p.sourceMaterial;
    this.needsRender = true;
  }

  // Stones switch from stand-in glass to the refraction shader once its studio light has loaded.
  private refreshGems() {
    for (const p of this.state.parts) if (p.choice && PRESETS.get(p.choice.id)?.kind === 'gem') this.apply(p);
    this.needsRender = true;
    this.changed();
  }

  /** With nothing selected a metal goes on every metal part and a gem on every stone; else on the selection. */
  choose(choice: Choice | null) {
    let sel = [...this.state.selected].map((id) => this.byId.get(id)!);
    if (!sel.length && choice) sel = this.state.parts.filter((p) => p.group === (PRESETS.get(choice.id)!.kind === 'metal' ? 'metal' : 'stone'));
    if (!sel.length) return;
    this.pushHistory(sel);
    for (const p of sel) { p.choice = choice; this.apply(p); }
    this.changed();
  }

  /** Shade (-1..1) or polish (roughness) of the selected presets; call beginAdjust() once per drag. */
  beginAdjust() { this.pushHistory([...this.state.selected].map((id) => this.byId.get(id)!)); this.changed(); }
  adjust(k: 'shade' | 'rough', v: number) {
    for (const id of this.state.selected) {
      const p = this.byId.get(id)!;
      if (!p.choice) continue;
      p.choice = { ...p.choice, [k]: v };
      this.apply(p);
    }
    this.changed();
  }

  undo() { this.step(this.history, this.future); }
  redo() { this.step(this.future, this.history); }
  private step(from: Snapshot[], to: Snapshot[]) {
    const last = from.pop();
    if (!last) return;
    to.push(last.map(([id]) => [id, this.byId.get(id)!.choice]));
    for (const [id, ch] of last) { const p = this.byId.get(id)!; p.choice = ch; this.apply(p); }
    this.changed();
  }
  private pushHistory(sel: Part[]) {
    this.history.push(sel.map((p) => [p.id, p.choice]));
    this.future = [];
  }

  /** Every part's choice, to keep a piece's own edits while other pieces are open. */
  choices(): Record<string, Choice | null> { return Object.fromEntries(this.state.parts.map((p) => [p.id, p.choice])); }
  restoreChoices(c: Record<string, Choice | null>) {
    for (const p of this.state.parts) if (p.id in c) { p.choice = c[p.id]; this.apply(p); }
    this.changed();
  }

  /** Every metal part gets this metal for fn(), then each part gets its own back. */
  async withMetal<T>(metalId: string | null, fn: () => Promise<T>): Promise<T> {
    if (!metalId) return fn();
    const metal = this.state.parts.filter((p) => p.group === 'metal');
    const saved = metal.map((p) => p.choice);
    for (const p of metal) { p.choice = { kind: 'preset', id: metalId }; this.apply(p); }
    try { return await fn(); } finally {
      metal.forEach((p, k) => { p.choice = saved[k]; this.apply(p); });
    }
  }

  /** "band: Rose Gold; round x12: Diamond" for the AI placement. */
  materialsText() {
    return this.state.sets.map((s) => {
      const p = this.byId.get(s.ids[0])!;
      const m = p.choice ? PRESETS.get(p.choice.id)!.name : p.source.name ? `${p.source.name} (as in the file, colour ${p.source.color})` : `colour ${p.source.color}`;
      return `${s.name}${s.ids.length > 1 ? ` x${s.ids.length}` : ''}: ${m}`;
    }).join('; ');
  }

  /* ---------- selection ---------- */

  select(ids: string[], add = false) {
    const sel = add ? new Set(this.state.selected) : new Set<string>();
    const all = ids.length > 0 && ids.every((id) => sel.has(id));
    for (const id of ids) {
      if (add && all) sel.delete(id);
      else sel.add(id);
    }
    this.clearGlow();
    for (const id of sel) {
      const mesh = this.byId.get(id)!.mesh;
      const g = new THREE.Mesh(mesh.geometry, this.glowMat);
      g.renderOrder = 2;
      g.raycast = () => {};
      mesh.add(g);
      this.glows.push(g);
    }
    this.state = { ...this.state, selected: sel };
    this.needsRender = true;
    this.changed();
  }
  selectGroup(group: PartGroup) { this.select(this.state.parts.filter((p) => p.group === group).map((p) => p.id)); }
  private clearGlow() { for (const g of this.glows) g.removeFromParent(); this.glows = []; }

  private onPointerDown = (e: PointerEvent) => { this.down = [e.clientX, e.clientY]; };
  private onPointerUp = (e: PointerEvent) => {
    if (!this.down || !this.model || e.button !== 0) return;
    const moved = Math.hypot(e.clientX - this.down[0], e.clientY - this.down[1]);
    this.down = null;
    if (moved > 8) return; // turning the view, not a click
    const r = this.renderer.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    const hit = ray.intersectObjects(this.state.parts.map((p) => p.mesh), false)[0];
    this.select(hit ? [hit.object.userData.c2p.id] : [], e.shiftKey || e.ctrlKey || e.metaKey);
  };

  /* ---------- camera ---------- */

  private sphere() { return new THREE.Box3().setFromObject(this.holder).getBoundingSphere(new THREE.Sphere()); }

  /** The default view: the whole piece, three-quarter from above. */
  fit() {
    applyAngle(this, { name: '', dir: [1, 0.75, 1.2] });
    this.fitDist = this.camera.position.distanceTo(this.controls.target);
    this.controls.minDistance = this.fitDist / 8;
    this.controls.maxDistance = this.fitDist * 2.8;
    this.needsRender = true;
  }
  zoom(step: number) {
    const off = this.camera.position.clone().sub(this.controls.target).multiplyScalar(2 ** -step);
    this.camera.position.copy(this.controls.target).add(off);
    this.controls.update();
    this.needsRender = true;
  }
  applyAngle(a: Angle) { applyAngle(this, a); this.needsRender = true; }
  /** A small picture of the piece from each angle (as the CAD to Pictures tool's angle tiles);
   *  the view goes back to where it was. Every angle is drawn and copied in one go, so the screen
   *  never shows the camera moving; encoding happens after. */
  async angleThumbs(angles: Angle[], long = 220): Promise<Blob[]> {
    const back = currentAngle(this);
    let copies: HTMLCanvasElement[];
    try {
      copies = angles.map((a) => { applyAngle(this, a); return this.drawCopy({ background: 'white', long }); });
    } finally {
      applyAngle(this, back);
      this.needsRender = true;
    }
    return Promise.all(copies.map((c) => toBlob(c, 'image/webp')));
  }
  currentAngle(): Angle { return currentAngle(this); }
  fitDistanceFor(radius: number, focal: number) { return fitDistance(this, radius, focal); }
  modelSphere() { return this.sphere(); }

  setLight(v: number) { this.renderer.toneMappingExposure = v; this.needsRender = true; }
  setStudio(id: StudioId) { return this.look.setStudio(id); }
  get studioId() { return this.look.studioId; }

  /* ---------- pictures ---------- */

  /** The current view as a picture: white with a soft shadow, or transparent with no shadow. */
  /** Width / height of the pictures being made. A shoot sets it so each picture is framed and
   *  fitted to its shape (the piece stays centred); 1 (square) the rest of the time. */
  pictureAspect = 1;

  /** Largest picture side, px, this device's graphics can draw (4K needs 4096). */
  maxPicturePx(): number {
    const gl = this.renderer.getContext();
    return Math.min(this.renderer.capabilities.maxTextureSize, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number);
  }

  async capture({ background = 'white' as 'white' | 'clear', long = 2048, type = 'image/png', shadow = background === 'white' } = {}): Promise<Blob> {
    return toBlob(this.drawCopy({ background, long, shadow }), type);
  }

  /** Draws the picture and copies it to an off-screen canvas, then puts the view back, all before
   *  the browser next paints: the screen never shows the picture size or its framing. */
  private drawCopy({ background = 'white' as 'white' | 'clear', long = 2048, shadow = background === 'white' }): HTMLCanvasElement {
    const a = this.pictureAspect;
    const w = a >= 1 ? long : Math.round(long * a);
    const h = a >= 1 ? Math.round(long / a) : long;
    const [vw, vh] = this.viewSize();
    const f = frameRect(this); // render only the picture box, so the picture is what the angle lined up
    this.camera.aspect = vw / vh;
    this.camera.setViewOffset(vw, vh, f.x, f.y, f.w, f.h);
    this.busy = true;
    for (const g of this.glows) g.visible = false;
    this.look.floor.visible = shadow;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    try {
      this.look.drawPicture(background as Backdrop, w, h);
      const copy = document.createElement('canvas');
      copy.width = w;
      copy.height = h;
      copy.getContext('2d')!.drawImage(this.renderer.domElement, 0, 0);
      return copy;
    } finally {
      this.look.floor.visible = true;
      for (const g of this.glows) g.visible = true;
      this.camera.clearViewOffset();
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      this.resize();
      this.busy = false; // resize() asked for a redraw; the loop draws it before the browser paints
    }
  }

  /* ---------- size, motion, teardown ---------- */

  viewSize(): [number, number] { return [Math.max(1, this.container.clientWidth), Math.max(1, this.container.clientHeight)]; }

  private resize() {
    const [w, h] = this.viewSize();
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.look.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.needsRender = true;
  }

  // While the piece is turned: screen resolution and no crevice shading; full quality 0.3 s after it stops.
  private moved() {
    if (!this.moving) this.setMoving(true);
    clearTimeout(this.stillTimer);
    this.stillTimer = window.setTimeout(() => this.setMoving(false), 300);
  }
  private setMoving(on: boolean) {
    this.moving = on;
    this.renderer.setPixelRatio(on ? 1 : Math.min(devicePixelRatio, 2));
    this.look.setMoving(on);
    this.resize();
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointerup', this.onPointerUp);
    clearTimeout(this.stillTimer);
    this.clear();
    this.controls.dispose();
    this.materials.dispose();
    this.look.dispose();
    this.renderer.dispose();
    el.remove();
    this.listeners.clear();
  }
}

function replaceWithPieces(mesh: THREE.Mesh, pieces: THREE.Mesh[] | null) {
  if (!pieces || !mesh.parent) return;
  for (const p of pieces) { p.position.copy(mesh.position); p.quaternion.copy(mesh.quaternion); p.scale.copy(mesh.scale); mesh.parent.add(p); }
  mesh.parent.remove(mesh);
}

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((ok, bad) => canvas.toBlob((b) => (b ? ok(b) : bad(new Error('the browser could not save the picture'))), type, 0.92));
}
