import { useEffect, useRef } from 'react';
import { hslTokenToRgb } from '@/lib/ruby-call/theme-color';

/**
 * Ruby's orb: the same WebGL cloud orb as the Eva call page
 * (csp-call-analysis/eva/public/app.js), coloured from the active FormaNova
 * theme instead of fixed colours: pale --background highlight, a light tint
 * of --formanova-hero-accent as the body, the accent itself in the folds. Re-reads the colours when the
 * theme changes (ThemeContext sets class and data-theme on <html>).
 * Falls back to a CSS gradient when WebGL is unavailable.
 */

const VERTEX = 'attribute vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }';

const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 res; uniform float t, lvl, still;
uniform vec2 flow;
uniform vec3 c1, c2, c3;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0., a = .5; mat2 m = mat2(1.6,1.2,-1.2,1.6);
  for (int k = 0; k < 4; k++){ v += a * n(p); p = m * p; a *= .5; } return v; }
void main(){
  vec2 uv = (gl_FragCoord.xy - .5 * res) / min(res.x, res.y);
  float r = length(uv);
  vec2 dir = uv / max(r, 1e-4);
  float R = .43 + lvl * .03 + (n(dir * 1.4 + vec2(t * .06, -t * .045)) - .5) * (.004 + lvl * .022);
  float inside = 1. - smoothstep(R - 2.0 / res.x, R + 2.0 / res.x, r);
  if (inside <= 0.) { gl_FragColor = vec4(0.); return; }
  vec2 p = uv * 1.35;
  vec2 q = vec2(fbm(p + vec2(0., -flow.y)), fbm(p + vec2(5.2, 1.3) + vec2(flow.x, 0.)));
  float w = fbm(p + 1.6 * q + vec2(t * .007, -flow.y * 1.4));
  vec3 col = mix(c2, c1, smoothstep(.3, .72, w + .1 * q.y));
  col = mix(col, c3, smoothstep(.42, .18, w) * .55);
  col = mix(col, c1, smoothstep(.1, -.45, uv.y / R) * .35);
  float d = r / R;
  col *= .86 + .22 * (1. - smoothstep(-.4, .5, dot(uv, vec2(.6, -.8)) / R));
  col = mix(col, c1, pow(d, 5.) * .45);
  col += lvl * .06;
  float g = dot(col, vec3(.299, .587, .114));
  col = mix(col, vec3(g) * 1.04, still * .8);
  gl_FragColor = vec4(col * inside, inside);
}`;

function themeColor(name: string, fallback: [number, number, number]): [number, number, number] {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  return hslTokenToRgb(raw) ?? fallback;
}

/** A voice RMS (speech is roughly 0.02 to 0.15) as 0..1 orb movement, with a gate so room noise stays still. */
export function orbAmp(rms: number): number {
  if (!Number.isFinite(rms)) return 0;
  return Math.min(1, Math.sqrt(Math.max(0, rms - 0.01) * 9));
}

interface RubyOrbProps {
  /** 0..1: how lively the orb is (Ruby speaking ~0.6, caller speaking ~0.25, quiet 0). */
  level: number;
  /** Calm and pale (muted or call ended). */
  calm?: boolean;
  /** Live loudness (RMS), read every frame so the orb moves with each syllable, like a voice assistant's orb. */
  voice?: () => number;
  className?: string;
}

export function RubyOrb({ level, calm = false, voice, className = '' }: RubyOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fallbackRef = useRef<HTMLDivElement>(null);
  const target = useRef({ level, calm, voice });
  target.current = { level, calm, voice };

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas?.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: true }) ?? null;
    if (!canvas || !gl) {
      if (canvas) canvas.style.display = 'none';
      if (fallbackRef.current) fallbackRef.current.style.display = 'block';
      return;
    }
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || 'shader');
      return sh;
    };
    let prog: WebGLProgram;
    try {
      prog = gl.createProgram()!;
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERTEX));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAGMENT));
      gl.linkProgram(prog);
    } catch {
      canvas.style.display = 'none';
      if (fallbackRef.current) fallbackRef.current.style.display = 'block';
      return;
    }
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (name: string) => gl.getUniformLocation(prog, name);
    const u = { res: U('res'), t: U('t'), lvl: U('lvl'), still: U('still'), flow: U('flow'), c1: U('c1'), c2: U('c2'), c3: U('c3') };

    // Light like Eva's orb: mostly pale, the accent only in the deeper folds.
    const applyColors = () => {
      const bg = themeColor('--background', [1, 1, 1]);
      const accent = themeColor('--formanova-hero-accent', [0.7, 0.51, 0.06]);
      const mix = (a: number[], b: number[], k: number) => a.map((v, i) => v + (b[i] - v) * k);
      gl.uniform3fv(u.c1, mix(bg, accent, 0.06));
      gl.uniform3fv(u.c2, mix(bg, accent, 0.38));
      gl.uniform3fv(u.c3, accent);
    };
    applyColors();
    const themeWatch = new MutationObserver(applyColors);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });

    const fit = () => {
      // Capped so the orb stays cheap and never competes with Ruby's audio.
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      const w = Math.round(canvas.clientWidth * dpr);
      if (w && canvas.width !== w) {
        canvas.width = canvas.height = w;
        gl.viewport(0, 0, w, w);
      }
    };
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let lvl = 0;
    let amp = 0;
    let still = 0;
    let fx = 0;
    let fy = 0;
    let last = 0;
    let raf = 0;
    const draw = (time: number) => {
      // Browsers throttle rAF in background tabs; skip the work entirely when hidden.
      if (document.hidden) {
        last = 0;
        raf = requestAnimationFrame(draw);
        return;
      }
      fit();
      const dt = last ? Math.min(0.05, (time - last) / 1000) : 0;
      last = time;
      const want = target.current;
      lvl += (want.level - lvl) * (want.level > lvl ? 0.08 : 0.04);
      still += ((want.calm ? 1 : 0) - still) * 0.05;
      // Fast attack, slower release: the clouds inside quicken with each syllable and settle between words.
      // Only the inner flow follows the voice; the orb's size and edge stay as they were (owner, 2026-11-04).
      const loud = want.calm ? 0 : orbAmp(want.voice?.() ?? 0);
      amp += (loud - amp) * (loud > amp ? 0.35 : 0.1);
      const motion = !reduce?.matches;
      if (motion) {
        const sp = 0.018 + lvl * 0.05 + amp * 0.15;
        fy += dt * sp;
        fx += dt * sp * 0.6;
      }
      if (fy > 400) {
        fy -= 400;
        fx -= 240;
      }
      gl.uniform2f(u.res, canvas.width, canvas.height);
      gl.uniform2f(u.flow, fx, fy);
      gl.uniform1f(u.t, motion ? (time / 1000) % 3600 : 12);
      gl.uniform1f(u.lvl, motion ? lvl : 0);
      gl.uniform1f(u.still, still);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      themeWatch.disconnect();
    };
  }, []);

  return (
    <div className={`relative aspect-square ${className}`} aria-hidden="true">
      <div
        className="pointer-events-none absolute -inset-[18%] -z-10 rounded-full opacity-50"
        style={{ background: 'radial-gradient(circle, hsl(var(--formanova-hero-accent) / 0.22), transparent 65%)' }}
      />
      <canvas ref={canvasRef} className="block h-full w-full" />
      <div
        ref={fallbackRef}
        className="absolute inset-[7%] hidden rounded-full"
        style={{
          background:
            'radial-gradient(circle at 34% 28%, hsl(var(--background)) 0%, hsl(var(--formanova-hero-accent) / 0.4) 52%, hsl(var(--formanova-hero-accent)) 100%)',
        }}
      />
    </div>
  );
}
