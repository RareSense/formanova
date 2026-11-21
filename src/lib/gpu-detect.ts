/**
 * GPU / Device capability detection
 * Detects hardware tier and returns quality settings for 3D rendering.
 * Includes:
 *   - Static heuristics (GPU string, memory, cores)
 *   - Apple Metal translation-layer detection
 *   - Invisible micro-benchmark probe (offscreen, ~200ms)
 *   - Dynamic gem caps based on mesh count
 * Result is cached — detection runs only once.
 */

export type QualityTier = "low" | "medium" | "high";

export type QualityMode = "balanced" | "ultra";

export interface QualitySettings {
  tier: QualityTier;
  dpr: [number, number];
  gemBounces: number;
  aberrationScale: number; // multiplier on aberrationStrength (0 = disabled)
  postProcessing: boolean;
  maxLights: number; // 3 = ambient+dir+hemi, 5 = all
  antialias: boolean;
  envMapMipmaps: boolean;
  maxGemRefraction: number; // max gems rendered with expensive MeshRefractionMaterial
  vertexBudget: number; // total vertex count warning threshold
}

const TIER_SETTINGS: Record<QualityTier, QualitySettings> = {
  low: {
    tier: "low",
    dpr: [0.75, 0.75],
    gemBounces: 2,
    aberrationScale: 0,
    postProcessing: false,
    maxLights: 3,
    antialias: false,
    envMapMipmaps: false,
    maxGemRefraction: 15,
    vertexBudget: 500_000,
  },
  medium: {
    tier: "medium",
    dpr: [1, 1],
    gemBounces: 3,
    aberrationScale: 0.5,
    postProcessing: true,
    maxLights: 5,
    antialias: true,
    envMapMipmaps: false,
    maxGemRefraction: 30,
    vertexBudget: 1_500_000,
  },
  high: {
    tier: "high",
    dpr: [1, 1.5],
    gemBounces: 6,
    aberrationScale: 1,
    postProcessing: true,
    maxLights: 5,
    antialias: true,
    envMapMipmaps: true,
    maxGemRefraction: 100,
    vertexBudget: 5_000_000,
  },
};

// Known low-end GPU substrings
const LOW_END_GPU = [
  "intel hd",
  "intel uhd",
  "intel(r) hd",
  "intel(r) uhd",
  "mali-t",
  "mali-4",
  "adreno 3",
  "adreno 4",
  "adreno 5",
  "swiftshader",
  "llvmpipe",
  "mesa",
  "microsoft basic render",
];

// Apple Metal GPUs that use the ANGLE translation layer — cap refraction aggressively
const APPLE_METAL_PATTERN = /apple\s*(m[1-9]|gpu|metal)/i;

let cached: QualitySettings | null = null;
let cachedTierRaw: QualityTier | null = null;

function detectTier(): QualityTier {
  const renderer = getGPURendererString().toLowerCase();

  // ── Apple Metal override ──
  // ANGLE translation layer on macOS adds overhead for refraction shaders.
  // Even high-end M3/M4 chips can drop frames with many refraction gems.
  if (APPLE_METAL_PATTERN.test(renderer)) {
    console.log("[GPU Detect] Apple Metal GPU detected — capping to medium tier for stability");
    return "medium";
  }

  // Check device memory (Chrome-only)
  const mem = (navigator as any).deviceMemory as number | undefined;
  if (mem !== undefined) {
    if (mem <= 2) return "low";
    if (mem <= 4) return "medium";
  }

  // Check CPU cores
  const cores = navigator.hardwareConcurrency;
  if (cores !== undefined && cores <= 2) return "low";

  // Check GPU via WebGL
  if (LOW_END_GPU.some((s) => renderer.includes(s))) return "low";

  // Mobile user-agent → default medium
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) return "medium";

  // If we got here with decent memory/cores, assume high
  if (mem && mem >= 8) return "high";
  if (cores && cores >= 6) return "high";

  return "medium";
}

export function getQualitySettings(): QualitySettings {
  if (cached) return cached;
  const tier = detectTier();
  cachedTierRaw = tier;
  cached = { ...TIER_SETTINGS[tier] };
  console.log(`[GPU Detect] Quality tier: ${tier}`, cached);
  return cached;
}

/**
 * Returns quality settings for a given mode.
 * "balanced" = auto-detected safe tier (never exceeds medium for Apple Metal).
 * "ultra" = attempts high tier IF hardware can handle it, else falls back.
 */
export function getSettingsForMode(mode: QualityMode): QualitySettings {
  if (mode === "balanced") {
    return getQualitySettings(); // auto-detected safe tier
  }

  // Ultra mode — only allow if benchmark says it's safe
  const canUltra = canHandleUltra();
  if (canUltra) {
    return { ...TIER_SETTINGS["high"] };
  }

  // Fallback: return auto-detected tier (don't crash the user)
  return getQualitySettings();
}

/**
 * Check if the device can handle Ultra quality.
 * Uses raw tier + Apple Metal check.
 */
export function canHandleUltra(): boolean {
  const renderer = getGPURendererString().toLowerCase();

  // Apple Metal with ANGLE — never allow ultra
  if (APPLE_METAL_PATTERN.test(renderer)) {
    return false;
  }

  // Low tier devices — never allow ultra
  const tier = cachedTierRaw ?? detectTier();
  if (tier === "low") return false;

  // Medium tier — allow ultra only with good memory+cores
  if (tier === "medium") {
    const mem = (navigator as any).deviceMemory as number | undefined;
    const cores = navigator.hardwareConcurrency;
    if (mem && mem >= 8 && cores && cores >= 6) return true;
    return false;
  }

  // High tier — always allow
  return true;
}

/**
 * Get a human-readable reason why Ultra is unavailable.
 */
export function getUltraDenialReason(): string | null {
  if (canHandleUltra()) return null;

  const renderer = getGPURendererString().toLowerCase();
  if (APPLE_METAL_PATTERN.test(renderer)) {
    return "Your GPU uses a translation layer that can cause instability with high-quality gem rendering. We're keeping Balanced mode for a smoother experience.";
  }

  const tier = cachedTierRaw ?? detectTier();
  if (tier === "low") {
    return "Your device doesn't have enough rendering power for Ultra quality. Balanced mode ensures a stable experience.";
  }

  return "Your device may struggle with Ultra quality rendering. We recommend staying in Balanced mode for stability.";
}

/**
 * Dynamic gem caps based on scene complexity.
 * Call this after loading a model to get adjusted limits.
 */
export function getDynamicGemCaps(
  totalMeshCount: number,
  totalVertexCount: number,
  mode: QualityMode = "balanced"
): { maxGemRefraction: number; gemBounces: number } {
  const settings = getSettingsForMode(mode);
  let { maxGemRefraction, gemBounces } = settings;

  // Scale down gem refraction limit based on total mesh count
  // More meshes = fewer refraction gems to maintain performance
  if (totalMeshCount > 200) {
    maxGemRefraction = Math.min(maxGemRefraction, 10);
    gemBounces = Math.min(gemBounces, 2);
  } else if (totalMeshCount > 100) {
    maxGemRefraction = Math.min(maxGemRefraction, Math.floor(maxGemRefraction * 0.5));
    gemBounces = Math.min(gemBounces, 3);
  } else if (totalMeshCount > 50) {
    maxGemRefraction = Math.min(maxGemRefraction, Math.floor(maxGemRefraction * 0.75));
  }

  // Also scale based on vertex count
  if (totalVertexCount > settings.vertexBudget) {
    const ratio = settings.vertexBudget / totalVertexCount;
    maxGemRefraction = Math.max(5, Math.floor(maxGemRefraction * ratio));
    gemBounces = Math.min(gemBounces, 2);
  }

  return { maxGemRefraction, gemBounces };
}

/** Get the raw GPU renderer string from WebGL (cached). */
let cachedRenderer: string | null = null;
export function getGPURendererString(): string {
  if (cachedRenderer !== null) return cachedRenderer;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (gl) {
      const ext = (gl as WebGLRenderingContext).getExtension("WEBGL_debug_renderer_info");
      if (ext) {
        cachedRenderer = (gl as WebGLRenderingContext).getParameter(ext.UNMASKED_RENDERER_WEBGL) || "unknown";
        return cachedRenderer;
      }
    }
  } catch { /* ignore */ }
  cachedRenderer = "unknown";
  return cachedRenderer;
}

export function getQualityTier(): QualityTier {
  return getQualitySettings().tier;
}

/**
 * Run an invisible micro-benchmark to refine tier detection.
 * Renders a small WebGL scene offscreen and measures frame time.
 * Returns true if the device handles it well (< threshold ms).
 * This is fire-and-forget; call on app mount.
 */
let benchmarkResult: boolean | null = null;
let benchmarkPromise: Promise<boolean> | null = null;

export function runMicroBenchmark(): Promise<boolean> {
  if (benchmarkResult !== null) return Promise.resolve(benchmarkResult);
  if (benchmarkPromise) return benchmarkPromise;

  benchmarkPromise = new Promise<boolean>((resolve) => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      // Keep fully offscreen — user never sees this
      canvas.style.position = "fixed";
      canvas.style.left = "-9999px";
      canvas.style.top = "-9999px";
      document.body.appendChild(canvas);

      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      if (!gl) {
        cleanup(canvas);
        benchmarkResult = false;
        resolve(false);
        return;
      }

      // Simple shader that does some math (simulating refraction cost)
      const vs = `attribute vec4 p;void main(){gl_Position=p;}`;
      const fs = `precision mediump float;
        uniform float u;
        void main(){
          vec3 c=vec3(0.0);
          for(int i=0;i<50;i++){
            c+=vec3(sin(float(i)*u),cos(float(i)*u),sin(float(i)*0.5+u));
          }
          gl_FragColor=vec4(c*0.01,1.0);
        }`;

      const glCtx = gl as WebGLRenderingContext;
      const vsh = compileShader(glCtx, glCtx.VERTEX_SHADER, vs);
      const fsh = compileShader(glCtx, glCtx.FRAGMENT_SHADER, fs);
      if (!vsh || !fsh) {
        cleanup(canvas);
        benchmarkResult = false;
        resolve(false);
        return;
      }

      const prog = glCtx.createProgram()!;
      glCtx.attachShader(prog, vsh);
      glCtx.attachShader(prog, fsh);
      glCtx.linkProgram(prog);
      glCtx.useProgram(prog);

      const uLoc = glCtx.getUniformLocation(prog, "u");

      // Full-screen quad
      const buf = glCtx.createBuffer();
      glCtx.bindBuffer(glCtx.ARRAY_BUFFER, buf);
      glCtx.bufferData(glCtx.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), glCtx.STATIC_DRAW);
      const pLoc = glCtx.getAttribLocation(prog, "p");
      glCtx.enableVertexAttribArray(pLoc);
      glCtx.vertexAttribPointer(pLoc, 2, glCtx.FLOAT, false, 0, 0);

      // Render 10 frames and measure total time
      const FRAMES = 10;
      const start = performance.now();
      for (let f = 0; f < FRAMES; f++) {
        glCtx.uniform1f(uLoc, f * 0.1);
        glCtx.drawArrays(glCtx.TRIANGLE_STRIP, 0, 4);
      }
      glCtx.finish(); // force GPU sync
      const elapsed = performance.now() - start;
      const avgFrameMs = elapsed / FRAMES;

      cleanup(canvas);

      // < 5ms per frame = good, > 10ms = struggling
      const isCapable = avgFrameMs < 8;
      benchmarkResult = isCapable;
      console.log(`[GPU Benchmark] ${FRAMES} frames in ${elapsed.toFixed(1)}ms (${avgFrameMs.toFixed(1)}ms/frame) → ${isCapable ? "capable" : "limited"}`);

      // If benchmark shows poor performance, downgrade cached tier
      if (!isCapable && cached && cached.tier === "high") {
        console.log("[GPU Benchmark] Downgrading from high → medium based on benchmark");
        cached = { ...TIER_SETTINGS["medium"] };
        cachedTierRaw = "medium";
      }

      resolve(isCapable);
    } catch (e) {
      console.warn("[GPU Benchmark] Failed:", e);
      benchmarkResult = false;
      resolve(false);
    }
  });

  return benchmarkPromise;
}

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function cleanup(canvas: HTMLCanvasElement) {
  try {
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (gl) {
      const ext = gl.getExtension("WEBGL_lose_context");
      ext?.loseContext();
    }
    canvas.remove();
  } catch { /* ignore */ }
}

/** Get benchmark result (null if not yet run) */
export function getBenchmarkResult(): boolean | null {
  return benchmarkResult;
}

// ── Refractive gems: can this computer and browser handle them? ──

const SOFTWARE_GPU = /swiftshader|llvmpipe|softpipe|basic render|microsoft basic|software/i;
const GEM_CRASH_KEY = "fn_refraction_crashed";

export interface RefractionSupport {
  /** True when refractive gems should be on by default. */
  safe: boolean;
  /** Plain-English reason when not safe, shown to the user. */
  reason: string | null;
}

/** Remember that refractive gems crashed the 3D view in this browser. */
export function recordRefractionCrash(): void {
  try { localStorage.setItem(GEM_CRASH_KEY, "1"); } catch { /* storage blocked */ }
}

/** Forget an earlier crash, after the user turns refraction back on themselves. */
export function clearRefractionCrash(): void {
  try { localStorage.removeItem(GEM_CRASH_KEY); } catch { /* storage blocked */ }
}

let cachedSupport: RefractionSupport | null = null;

export function getRefractionSupport(): RefractionSupport {
  if (cachedSupport) return cachedSupport;
  const no = (reason: string): RefractionSupport => (cachedSupport = { safe: false, reason });

  let crashed = false;
  try { crashed = localStorage.getItem(GEM_CRASH_KEY) === "1"; } catch { /* storage blocked */ }
  if (crashed) return no("Simple gems: real gems stopped your browser before.");

  let webgl2 = false;
  try { webgl2 = !!document.createElement("canvas").getContext("webgl2"); } catch { /* none */ }
  if (!webgl2) return no("Simple gems: your browser's 3D is older.");

  const renderer = getGPURendererString();
  if (SOFTWARE_GPU.test(renderer)) return no("Simple gems: 3D is running without graphics acceleration.");

  // Chrome's Vulkan path (some Linux and Android devices) draws the gem shader
  // as flat colour; found on an NVIDIA H100 with ANGLE Vulkan.
  if (/vulkan/i.test(renderer)) return no("Simple gems: your browser may draw real gems wrong.");

  const tier = getQualitySettings().tier;
  if (tier === "low") return no("Simple gems: your computer's graphics are light.");

  const mem = (navigator as { deviceMemory?: number }).deviceMemory;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if (mobile && (mem === undefined || mem <= 4)) return no("Simple gems: your phone may run short on graphics memory.");

  return (cachedSupport = { safe: true, reason: null });
}
