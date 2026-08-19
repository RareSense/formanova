/**
 * ScissorGLBGrid — Single-canvas scissor-test renderer for multiple GLB previews.
 *
 * Architecture:
 * - One shared <canvas> covers the grid container
 * - Each GLB card registers a placeholder <div> ref
 * - On each frame, we iterate visible placeholders, set gl.viewport/scissor, swap camera, and render
 * - Per-card OrbitControls for interaction
 * - LRU cache for parsed GLTF scenes (max 20)
 *
 * This avoids the browser's ~8-16 WebGL context limit.
 */

import React, {
  createContext,
  useContext,
  useRef,
  useEffect,
  useCallback,
  useState,
  useMemo,
} from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { applyNeutralToneMapping } from '@/lib/neutral-tone-mapping';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three-stdlib';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Box } from 'lucide-react';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import {
  applyHistoryPreviewMaterials,
  markEmbeddedGltfMaterials,
} from './scissor-glb-materials';
import { PendingCardRegistrationQueue } from './scissor-glb-registration';
import { getThemeBgColor } from './scissor-glb-theme';
import {
  cacheScene,
  disposeScene,
  fetchGlbArrayBuffer,
  getCachedScene,
  glbErrors,
  glbLoading,
  glbUrlNeedsAuth,
  resolveGlbUrl,
} from './scissor-glb-cache';

// Re-exported so existing imports (glb-url.test.ts, ScissorGLBGrid.test.ts)
// keep working — the cache/fetch logic itself lives in scissor-glb-cache.ts.
export { fetchGlbArrayBuffer, glbUrlNeedsAuth, resolveGlbUrl };

const __DEV__ = import.meta.env.DEV;

// ── Card registration ────────────────────────────────────────────────

interface CardEntry {
  id: string;
  glbUrl: string;
  divRef: HTMLDivElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  loaded: boolean;
  loading: boolean;
  error: boolean;
}

/** Listeners that slots register to be notified when their card state changes */
type CardStateListener = (loaded: boolean, error: boolean) => void;

interface GridContextValue {
  registerCard: (id: string, glbUrl: string, div: HTMLDivElement) => void;
  unregisterCard: (id: string) => void;
  /** Subscribe to state changes for a specific card id. Returns unsubscribe fn. */
  subscribe: (id: string, listener: CardStateListener) => () => void;
  /** Get current snapshot of card state */
  getCardState: (id: string) => { loaded: boolean; loading: boolean; error: boolean };
}

const GridContext = createContext<GridContextValue | null>(null);

export function useScissorGrid() {
  const ctx = useContext(GridContext);
  if (!ctx) throw new Error('useScissorGrid must be used within ScissorGLBGrid');
  return ctx;
}

// ── Provider + Canvas ────────────────────────────────────────────────

interface ScissorGLBGridProps {
  children: React.ReactNode;
}

export function ScissorGLBGrid({ children }: ScissorGLBGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cardsRef = useRef<Map<string, CardEntry>>(new Map());
  const listenersRef = useRef<Map<string, Set<CardStateListener>>>(new Map());
  const rafRef = useRef<number>(0);
  const envMapRef = useRef<THREE.Texture | null>(null);
  const gltfLoaderRef = useRef(new GLTFLoader());
  const pendingRegistrationsRef = useRef(new PendingCardRegistrationQueue<HTMLDivElement>());
  const [rendererReady, setRendererReady] = useState(false);

  /** Notify all listeners for a given card id */
  const notifyListeners = useCallback((id: string) => {
    const card = cardsRef.current.get(id);
    const listeners = listenersRef.current.get(id);
    if (!card || !listeners) return;
    for (const fn of listeners) {
      fn(card.loaded, card.error);
    }
  }, []);

  // Initialize renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pendingRegistrations = pendingRegistrationsRef.current;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Same neutral curve and exposure as the Studio viewport. ACESFilmic at
    // 0.65 rendered these previews darker than the design the user opens, and
    // pulled saturation out of gold and coloured stones on the way.
    applyNeutralToneMapping(renderer);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    rendererRef.current = renderer;
    setRendererReady(true);

    // Neutral studio box as the immediate environment, replaced by the HDRI
    // once it arrives. Studio does the same, and without it a preview rendered
    // before the download finished would be lit by the directional alone.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    envMapRef.current = roomTarget.texture;
    pmrem.dispose();

    // Preload HDRI environment
    const rgbeLoader = new RGBELoader();
    rgbeLoader.load('/hdri/jewelry-studio-v2.hdr', (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      envMapRef.current = texture;
      for (const card of cardsRef.current.values()) {
        card.scene.environment = texture;
      }
    });

    // Watch for theme changes on <html> (class or data-theme attribute)
    const observer = new MutationObserver(() => {
      const bg = getThemeBgColor();
      for (const card of cardsRef.current.values()) {
        card.scene.background = bg;
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });

    return () => {
      cancelAnimationFrame(rafRef.current);
      renderer.dispose();
      envMapRef.current?.dispose();
      rendererRef.current = null;
      pendingRegistrations.clear();
      observer.disconnect();
    };
  }, []);

  // Render loop
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    let running = true;

    function render() {
      if (!running || !renderer) return;
      rafRef.current = requestAnimationFrame(render);

      const container = containerRef.current;
      if (!container) return;

      const canvas = renderer.domElement;
      const containerRect = container.getBoundingClientRect();

      const width = containerRect.width;
      const height = containerRect.height;
      if (canvas.width !== Math.floor(width * renderer.getPixelRatio()) ||
          canvas.height !== Math.floor(height * renderer.getPixelRatio())) {
        renderer.setSize(width, height, false);
      }

      renderer.setScissorTest(true);
      renderer.setClearColor(0x000000, 0);

      // Clear entire canvas
      renderer.setViewport(0, 0, width, height);
      renderer.setScissor(0, 0, width, height);
      renderer.clear();

      for (const card of cardsRef.current.values()) {
        if (!card.loaded || !card.divRef) continue;

        const rect = card.divRef.getBoundingClientRect();

        if (
          rect.bottom < containerRect.top ||
          rect.top > containerRect.bottom ||
          rect.right < containerRect.left ||
          rect.left > containerRect.right ||
          rect.width <= 0 ||
          rect.height <= 0
        ) continue;

        const x = rect.left - containerRect.left;
        const y = containerRect.height - (rect.top - containerRect.top) - rect.height;
        const w = rect.width;
        const h = rect.height;

        renderer.setViewport(x, y, w, h);
        renderer.setScissor(x, y, w, h);

        card.camera.aspect = w / h;
        card.camera.updateProjectionMatrix();
        card.controls.update();

        renderer.render(card.scene, card.camera);
      }

      renderer.setScissorTest(false);
    }

    render();

    return () => { running = false; };
  }, []);

  // Load a GLB for a card
  const loadGlb = useCallback((card: CardEntry) => {
    if (card.loading || card.loaded || card.error) return;
    if (glbErrors.has(card.glbUrl)) {
      card.error = true;
      notifyListeners(card.id);
      return;
    }
    card.loading = true;
    if (__DEV__) console.log('[ScissorGLBGrid] Starting GLB load:', card.glbUrl);
    notifyListeners(card.id);

    const cached = getCachedScene(card.glbUrl);
    if (cached) {
      setupCardScene(card, cached);
      return;
    }

    let promise = glbLoading.get(card.glbUrl);
    if (!promise) {
      promise = (async () => {
        const fetchUrl = resolveGlbUrl(card.glbUrl);
        if (!fetchUrl) {
          throw new Error(`Unresolvable GLB reference: ${card.glbUrl}`);
        }
        const fetchFn = glbUrlNeedsAuth(fetchUrl) ? authenticatedFetch : fetch;
        const arrayBuffer = await fetchGlbArrayBuffer(fetchUrl, fetchFn);

        return new Promise<THREE.Group>((resolve, reject) => {
          gltfLoaderRef.current.parse(
            arrayBuffer,
            '',
            (gltf) => {
              markEmbeddedGltfMaterials(gltf);
              cacheScene(card.glbUrl, gltf.scene);
              resolve(gltf.scene.clone(true));
            },
            reject,
          );
        });
      })();
      glbLoading.set(card.glbUrl, promise);
      promise.finally(() => glbLoading.delete(card.glbUrl));
    }

    promise.then((scene) => {
      if (__DEV__) console.log('[ScissorGLBGrid] GLB loaded successfully:', card.glbUrl);
      setupCardScene(card, scene.clone(true));
    }).catch((err) => {
      if (__DEV__) console.error('[ScissorGLBGrid] GLB load failed:', card.glbUrl, err);
      card.loading = false;
      card.error = true;
      glbErrors.add(card.glbUrl);
      notifyListeners(card.id);
    });
  }, [notifyListeners]);

  const setupCardScene = useCallback((card: CardEntry, model: THREE.Group) => {
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = 3 / maxDim;

    model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    model.scale.setScalar(scale);

    applyHistoryPreviewMaterials(model);

    card.scene.add(model);

    if (envMapRef.current) {
      card.scene.environment = envMapRef.current;
    }

    card.loaded = true;
    card.loading = false;
    notifyListeners(card.id);
  }, [notifyListeners]);

  const registerCard = useCallback((id: string, glbUrl: string, div: HTMLDivElement) => {
    if (cardsRef.current.has(id)) return;

    const renderer = rendererRef.current;
    if (!renderer) {
      pendingRegistrationsRef.current.upsert({ id, glbUrl, element: div });
      return;
    }

    pendingRegistrationsRef.current.delete(id);

    const scene = new THREE.Scene();
    scene.background = getThemeBgColor();

    // Matches the Studio rig: one directional light at the same intensity and
    // angle, with the environment doing the rest. The ambient light that used
    // to sit here flattened the metal by filling the shadows that give it its
    // shape.
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.55);
    dirLight.position.set(1.5, 8, 2);
    scene.add(dirLight);

    if (envMapRef.current) {
      scene.environment = envMapRef.current;
    }

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 1.5, 6);
    camera.lookAt(0, 0, 0);

    const controls = new OrbitControls(camera, div);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.minDistance = 2;
    controls.maxDistance = 15;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.5;

    const entry: CardEntry = {
      id,
      glbUrl,
      divRef: div,
      scene,
      camera,
      controls,
      loaded: false,
      loading: false,
      error: false,
    };

    cardsRef.current.set(id, entry);
    loadGlb(entry);
  }, [loadGlb]);

  useEffect(() => {
    if (!rendererReady || !rendererRef.current) return;
    pendingRegistrationsRef.current.drain(({ id, glbUrl, element }) => {
      registerCard(id, glbUrl, element);
    });
  }, [rendererReady, registerCard]);

  const unregisterCard = useCallback((id: string) => {
    pendingRegistrationsRef.current.delete(id);
    const card = cardsRef.current.get(id);
    if (card) {
      card.controls.dispose();
      disposeScene(card.scene);
      cardsRef.current.delete(id);
    }
    listenersRef.current.delete(id);
  }, []);

  const subscribe = useCallback((id: string, listener: CardStateListener) => {
    if (!listenersRef.current.has(id)) {
      listenersRef.current.set(id, new Set());
    }
    listenersRef.current.get(id)!.add(listener);

    // Immediately notify with current state if card exists
    const card = cardsRef.current.get(id);
    if (card && (card.loaded || card.error)) {
      listener(card.loaded, card.error);
    }

    return () => {
      listenersRef.current.get(id)?.delete(listener);
    };
  }, []);

  const getCardState = useCallback((id: string) => {
    const card = cardsRef.current.get(id);
    return card
      ? { loaded: card.loaded, loading: card.loading, error: card.error }
      : { loaded: false, loading: false, error: false };
  }, []);

  const ctxValue = useMemo<GridContextValue>(() => ({
    registerCard,
    unregisterCard,
    subscribe,
    getCardState,
  }), [registerCard, unregisterCard, subscribe, getCardState]);

  return (
    <GridContext.Provider value={ctxValue}>
      <div ref={containerRef} className="relative">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 0 }}
        />
        <div className="relative" style={{ zIndex: 1 }}>
          {children}
        </div>
      </div>
    </GridContext.Provider>
  );
}

// ── GLB Preview Placeholder ──────────────────────────────────────────

interface GLBPreviewSlotProps {
  id: string;
  glbUrl: string;
  className?: string;
}

export function GLBPreviewSlot({ id, glbUrl, className = '' }: GLBPreviewSlotProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const { registerCard, unregisterCard, subscribe, getCardState } = useScissorGrid();
  const [state, setState] = useState<{ loaded: boolean; error: boolean }>({ loaded: false, error: false });

  useEffect(() => {
    const div = divRef.current;
    if (!div || !glbUrl) return;

    registerCard(id, glbUrl, div);

    // Subscribe to state changes — this is the reliable notification path
    const unsub = subscribe(id, (loaded, error) => {
      setState({ loaded, error });
    });

    // Also read initial state in case card loaded before subscription
    const initial = getCardState(id);
    if (initial.loaded || initial.error) {
      setState({ loaded: initial.loaded, error: initial.error });
    }

    return () => {
      unsub();
      unregisterCard(id);
      setState({ loaded: false, error: false });
    };
  }, [id, glbUrl, registerCard, unregisterCard, subscribe, getCardState]);

  return (
    <div
      ref={divRef}
      className={`relative ${className}`}
      style={{ touchAction: 'none' }}
    >
      {/* Loading state */}
      {!state.loaded && !state.error && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted rounded-sm" role="status" aria-live="polite">
          <div className="flex flex-col items-center gap-2">
            <div className="w-5 h-5 border-2 border-foreground/20 border-t-foreground/60 rounded-full animate-spin" />
            <span className="font-mono text-[8px] tracking-[0.2em] text-muted-foreground uppercase">
              Loading 3D
            </span>
          </div>
        </div>
      )}
      {/* Error fallback */}
      {state.error && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted rounded-sm" role="status" aria-live="polite">
          <div className="flex flex-col items-center gap-1.5">
            <Box className="h-5 w-5 text-muted-foreground/40" />
            <span className="font-mono text-[8px] tracking-[0.2em] text-muted-foreground uppercase">
              Preview unavailable
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
