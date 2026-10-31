// The look of the CAD to Pictures tool (FormaNova text-to-CAD "Refract" mode):
// the brown photo-studio light, one soft key light, a soft drop shadow, crevice
// shading (GTAO), FormaNova's tone curve, and a backdrop that stays pure white.

import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { installReferenceToneMapping } from './gems';

/** What the metal reflects; stones always refract the 1k brown studio, as in FormaNova. */
export const STUDIOS = [
  { id: 'photo', name: 'Studio', url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/brown_photostudio_02_2k.hdr' },
  { id: 'softbox', name: 'Softboxes', url: '/hdri/jewelry-studio-v2.hdr' },
  { id: 'diamond', name: 'Diamond', url: '/hdri/diamond-studio.hdr' },
] as const;
export type StudioId = (typeof STUDIOS)[number]['id'];
const GEM_ENV_URL = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/brown_photostudio_02_1k.hdr';

export type Backdrop = 'view' | 'white' | 'clear';
// RenderPass / ShaderPass draw into the read buffer they are given; the write buffer is unused.
const NO_TARGET = null as unknown as THREE.WebGLRenderTarget;
const srgb = (hex: number) => new THREE.Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
const BACKDROPS: Record<Backdrop, [THREE.Vector3, THREE.Vector3, number]> = {
  view: [srgb(0xffffff), srgb(0xc9cdd4), 1], white: [srgb(0xffffff), srgb(0xffffff), 1], clear: [srgb(0), srgb(0), 0],
};

export class Look {
  readonly floor: THREE.Mesh;
  readonly sun: THREE.DirectionalLight;
  /** The raw studio HDRI the gem shader samples (null until loaded). */
  gemEnv: THREE.Texture | null = null;
  studioId: StudioId = 'photo';
  studioReady = false;
  private envMap: THREE.Texture | null = null;
  private pmrem: THREE.PMREMGenerator;
  private studioMaps = new Map<string, Promise<THREE.Texture>>();
  private composer: EffectComposer | null = null;
  private renderPass: RenderPass | null = null;
  private gtao: GTAOPass | null = null;
  private finalPass: ShaderPass | null = null;
  private checked = false;
  private aoParams: Record<string, number> = {};
  private cap: { w: number; h: number; ms: THREE.WebGLRenderTarget; out: THREE.WebGLRenderTarget; ao: GTAOPass } | null = null;
  private floorShadow = new THREE.ShadowMaterial({ opacity: 0.12 });

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, private onChange: () => void) {
    installReferenceToneMapping();
    renderer.toneMapping = THREE.CustomToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap; // blurred: a soft drop shadow
    this.pmrem = new THREE.PMREMGenerator(renderer);

    const key = new THREE.DirectionalLight(0xffffff, 0.55);
    key.position.set(1.5, 8, 2);
    scene.add(key);
    // Shadow only (no visible floor), so pictures work on any background.
    this.sun = new THREE.DirectionalLight(0xffffff, 0.0001);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.radius = 16;
    this.sun.shadow.blurSamples = 16;
    this.sun.shadow.bias = -0.0002;
    this.sun.shadow.normalBias = 0.02;
    scene.add(this.sun, this.sun.target);
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.floorShadow);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    scene.add(this.floor);
    scene.background = this.viewBackdrop();

    new RGBELoader().loadAsync(GEM_ENV_URL).then((t) => {
      t.mapping = THREE.EquirectangularReflectionMapping;
      this.gemEnv = t;
      this.onChange();
    }).catch((e) => console.warn('studio light for stones not loaded', e));
    this.setupComposer();
  }

  get ready() { return !!this.gemEnv && this.studioReady; }

  async setStudio(id: StudioId) {
    const st = STUDIOS.find((x) => x.id === id) || STUDIOS[0];
    this.studioId = st.id;
    if (!this.studioMaps.has(st.id)) {
      this.studioMaps.set(st.id, new RGBELoader().loadAsync(st.url).then((t) => {
        t.mapping = THREE.EquirectangularReflectionMapping;
        return this.pmrem.fromEquirectangular(t).texture;
      }));
    }
    try {
      const env = await this.studioMaps.get(st.id)!;
      if (this.studioId !== st.id) return; // another one was picked meanwhile
      this.envMap = env;
      this.scene.environment = env;
      this.studioReady = true;
      this.onChange();
    } catch (e) {
      this.studioMaps.delete(st.id);
      throw new Error(`Could not load the ${st.name} light (${(e as Error).message})`);
    }
  }

  /** Light, shadow and crevice reach follow the size of the piece. */
  placeFor(radius: number) {
    const r = radius;
    this.sun.position.set(1.5, 8, 2).normalize().multiplyScalar(r * 6.2);
    this.sun.target.position.set(0, 0, 0);
    const c = this.sun.shadow.camera;
    c.left = c.bottom = -r * 1.6; c.right = c.top = r * 1.6; c.near = r; c.far = r * 12;
    c.updateProjectionMatrix();
    this.floor.scale.setScalar(r * 40);
    this.floor.position.y = -r * 0.0005;
    Object.assign(this.aoParams, { radius: r * 0.12, thickness: r * 0.08, distanceExponent: 1, scale: 1 });
    this.gtao?.updateGtaoMaterial(this.aoParams);
    this.cap?.ao.updateGtaoMaterial(this.aoParams);
  }

  /** While the piece is being turned: no crevice shading, so it stays smooth on any computer. */
  setMoving(on: boolean) { if (this.gtao) this.gtao.enabled = !on; }

  setSize(w: number, h: number) {
    if (!this.composer) return;
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  /** Draw the view to the canvas. */
  drawFrame() {
    if (!this.composer) { this.renderer.render(this.scene, this.camera); return; }
    this.setBackdrop('view');
    const back = this.scene.background;
    this.scene.background = null;
    try { this.composer.render(); } finally { this.scene.background = back; }
    // If this graphics card could not build the shading step, fall back to the plain view.
    if (!this.checked) {
      this.checked = true;
      if (this.renderer.info.programs?.some((p) => (p as { diagnostics?: { runnable: boolean } }).diagnostics?.runnable === false)) {
        console.warn('crevice shading off: a shader did not compile');
        this.composer = this.gtao = this.finalPass = null;
        this.renderer.render(this.scene, this.camera);
      }
    }
  }

  /** Draw a picture of w x h into the canvas (already sized to it). Buffers are made once per size and kept. */
  drawPicture(bg: Backdrop, w: number, h: number) {
    if (!this.composer) { this.renderer.render(this.scene, this.camera); return; }
    if (!this.cap || this.cap.w !== w || this.cap.h !== h) {
      if (this.cap) { this.cap.ms.dispose(); this.cap.out.dispose(); this.cap.ao.dispose(); }
      this.cap = {
        w, h,
        ms: new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 }),
        out: new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType }),
        ao: new GTAOPass(this.scene, this.camera, Math.ceil(w / 2), Math.ceil(h / 2)), // half size: 4x less work
      };
      this.cap.ao.blendIntensity = this.gtao!.blendIntensity;
      this.cap.ao.updateGtaoMaterial(this.aoParams);
    }
    this.setBackdrop(bg);
    const back = this.scene.background, f = this.floor.visible;
    this.scene.background = null;
    try {
      this.renderPass!.render(this.renderer, NO_TARGET, this.cap.ms, 0, false);
      this.floor.visible = false; // no crevice shading on the floor
      this.cap.ao.render(this.renderer, this.cap.out, this.cap.ms, 0, false);
      this.floor.visible = f;
      this.finalPass!.render(this.renderer, NO_TARGET, this.cap.out, 0, false);
    } finally { this.scene.background = back; this.floor.visible = f; }
  }

  dispose() {
    this.cap?.ms.dispose(); this.cap?.out.dispose(); this.cap?.ao.dispose();
    this.composer?.dispose();
    this.pmrem.dispose();
  }

  private setBackdrop(bg: Backdrop) {
    const [top, bottom, a] = BACKDROPS[bg];
    const u = this.finalPass!.uniforms;
    u.bgTop.value = top; u.bgBottom.value = bottom; u.bgAlpha.value = a;
    u.toneMappingExposure.value = this.renderer.toneMappingExposure;
  }

  // The scene is drawn into a buffer, GTAO darkens where the metal folds in, and
  // a last step applies the tone curve and the backdrop (kept out of the tone
  // curve, so white stays pure white).
  private setupComposer() {
    try {
      this.composer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
      this.renderPass = new RenderPass(this.scene, this.camera, null, new THREE.Color(0x000000), 0);
      this.composer.addPass(this.renderPass);
      this.gtao = new GTAOPass(this.scene, this.camera, 1, 1);
      this.gtao.blendIntensity = 0.85;
      const aoRender = this.gtao.render.bind(this.gtao);
      this.gtao.render = (...a: Parameters<GTAOPass['render']>) => {
        const f = this.floor.visible;
        this.floor.visible = false;
        try { aoRender(...a); } finally { this.floor.visible = f; }
      };
      this.composer.addPass(this.gtao);
      this.finalPass = new ShaderPass({
        uniforms: { tDiffuse: { value: null }, toneMappingExposure: { value: 1 }, bgTop: { value: null }, bgBottom: { value: null }, bgAlpha: { value: 1 } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        // CustomToneMapping and sRGBTransferOETF come from three's shader prefix (drawn to the screen, tone mapped).
        fragmentShader: `uniform sampler2D tDiffuse; uniform vec3 bgTop, bgBottom; uniform float bgAlpha; varying vec2 vUv;
          void main() {
            vec4 c = texture2D(tDiffuse, vUv);
            vec3 col = c.a > 0.0 ? CustomToneMapping(c.rgb / c.a) : vec3(0.0);
            col = sRGBTransferOETF(vec4(clamp(col, 0.0, 1.0), 1.0)).rgb;
            vec3 bg = mix(bgBottom, bgTop, vUv.y);
            gl_FragColor = bgAlpha > 0.0 ? vec4(mix(bg, col, c.a), 1.0) : vec4(col * c.a, c.a);
          }`,
      });
      this.composer.addPass(this.finalPass);
    } catch (e) {
      console.warn('crevice shading off', e);
      this.composer = null;
    }
  }

  // The view's backdrop as FormaNova's viewer draws it: white at the top fading to #c9cdd4.
  private viewBackdrop() {
    const c = document.createElement('canvas');
    c.width = 2; c.height = 512;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#c9cdd4');
    g.fillStyle = grad;
    g.fillRect(0, 0, 2, 512);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
}
