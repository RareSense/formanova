/**
 * Measurements a manufacturer needs, read from the model's triangles in the
 * browser: the finger hole (inside diameter, ring size), the band at the back
 * of the shank, and the metal volume. Pure functions over plain arrays so they
 * can be tested with exact synthetic shapes. Every result is an estimate from
 * the mesh and is labelled that way on the sheet.
 */

/** Triangles as a flat list of xyz positions, three vertices per triangle. */
export type Triangles = Float32Array | number[];

export type Axis = 0 | 1 | 2;

export interface RingMeasure {
  /** Axis the finger goes along. */
  axis: Axis;
  innerDiameterMm: number;
  /** Band at the back of the shank, opposite the head. */
  bandWidthMm: number;
  bandThicknessMm: number;
}

const other = (a: Axis): [Axis, Axis] => (a === 0 ? [1, 2] : a === 1 ? [0, 2] : [0, 1]);

/** Unique vertices, at most `max` of them, evenly picked: enough to find the hole fast on big meshes. */
function sampleVertices(tris: Triangles, max = 30000): number[][] {
  const n = tris.length / 3;
  const step = Math.max(1, Math.floor(n / max));
  const out: number[][] = [];
  for (let i = 0; i < n; i += step) out.push([tris[i * 3], tris[i * 3 + 1], tris[i * 3 + 2]]);
  return out;
}

/**
 * Finds a ring's finger hole: for each axis, the largest empty circle in the
 * points seen along that axis whose surroundings are metal all the way round.
 * Returns null when no axis has such a hole (an earring, a pendant).
 */
export function measureRing(tris: Triangles, upAxis: Axis): RingMeasure | null {
  const pts = sampleVertices(tris);
  if (pts.length < 50) return null;
  let best: { axis: Axis; cx: number; cy: number; r: number } | null = null;

  for (const axis of [0, 1, 2] as Axis[]) {
    const [a, b] = other(axis);
    let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
    for (const p of pts) {
      minA = Math.min(minA, p[a]); maxA = Math.max(maxA, p[a]);
      minB = Math.min(minB, p[b]); maxB = Math.max(maxB, p[b]);
    }
    const span = Math.max(maxA - minA, maxB - minB);
    if (span <= 0) continue;
    // Search the middle of the outline for the centre that is farthest from any metal.
    const grid = 28;
    let found = { cx: 0, cy: 0, r: 0 };
    const search = (ca: number, cb: number, half: number) => {
      for (let i = 0; i <= grid; i++) {
        for (let j = 0; j <= grid; j++) {
          const x = ca - half + (2 * half * i) / grid;
          const y = cb - half + (2 * half * j) / grid;
          let d = Infinity;
          for (const p of pts) {
            const dx = p[a] - x, dy = p[b] - y;
            const q = dx * dx + dy * dy;
            if (q < d) d = q;
          }
          if (d > found.r) found = { cx: x, cy: y, r: d };
        }
      }
    };
    search((minA + maxA) / 2, (minB + maxB) / 2, span * 0.3);
    search(found.cx, found.cy, span * 0.04); // refine around the best point
    const r = Math.sqrt(found.r);
    if (r < span * 0.15) continue; // no real hole along this axis

    // Metal must surround the hole: points close outside it in at least 30 of 36 directions.
    const sectors = new Array(36).fill(false);
    for (const p of pts) {
      const dx = p[a] - found.cx, dy = p[b] - found.cy;
      const dist = Math.hypot(dx, dy);
      if (dist >= r * 0.98 && dist <= r * 1.6) sectors[Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 36) % 36] = true;
    }
    if (sectors.filter(Boolean).length < 30) continue;
    if (!best || r > best.r) best = { axis, cx: found.cx, cy: found.cy, r };
  }
  if (!best) return null;

  // Band at the back of the shank: the slice of metal straight below the hole
  // (opposite the head), within ±12° of the downward direction.
  const [a, b] = other(best.axis);
  const down = upAxis === a ? [-1, 0] : upAxis === b ? [0, -1] : [0, -1];
  // The shank's own surfaces, found by casting rays through the triangles: the
  // first surface outside the hole is the shank's outside, so a stand, sprue or
  // second ring further out is never counted.
  const near: number[] = [];
  for (const p of pts) {
    const dx = p[a] - best.cx, dy = p[b] - best.cy;
    const dist = Math.hypot(dx, dy);
    if (dist < best.r * 0.98 || dist > best.r * 1.1) continue;
    if ((dx * down[0] + dy * down[1]) / (dist || 1) < Math.cos((12 * Math.PI) / 180)) continue;
    near.push(p[best.axis]);
  }
  if (!near.length) return null;
  const wMid = (Math.min(...near) + Math.max(...near)) / 2;
  // Several rays around the back of the shank, and the middle answer: a sprue,
  // stand or crossing band hits only some of them.
  const thick: number[] = [], wide: number[] = [];
  for (const deg of [-45, -30, -15, 0, 15, 30, 45]) {
    const c = Math.cos((deg * Math.PI) / 180), sn = Math.sin((deg * Math.PI) / 180);
    const dir2 = [down[0] * c - down[1] * sn, down[0] * sn + down[1] * c];
    const at = (rad: number, w: number) => {
      const o = [0, 0, 0];
      o[a] = best.cx + dir2[0] * rad; o[b] = best.cy + dir2[1] * rad; o[best.axis] = w;
      return o;
    };
    const radial = [0, 0, 0]; radial[a] = dir2[0]; radial[b] = dir2[1];
    const hits = rayHits(tris, at(best.r * 0.5, wMid), radial, best.r * 0.015).map((t) => t + best.r * 0.5).filter((t) => t > best.r * 0.9);
    if (hits.length < 2) continue;
    thick.push(hits[1] - hits[0]);
    const along = [0, 0, 0]; along[best.axis] = 1;
    const wHits = rayHits(tris, at((hits[0] + hits[1]) / 2, wMid - 1000), along, best.r * 0.015).map((t) => t + wMid - 1000);
    const before = wHits.filter((t) => t <= wMid), after = wHits.filter((t) => t > wMid);
    if (before.length && after.length) wide.push(Math.min(...after) - Math.max(...before));
  }
  if (thick.length < 3 || wide.length < 3) return null;
  const median = (v: number[]) => [...v].sort((x, y) => x - y)[Math.floor(v.length / 2)];
  return {
    axis: best.axis,
    innerDiameterMm: 2 * best.r,
    bandWidthMm: median(wide),
    bandThicknessMm: median(thick),
  };
}

/** Distances along a ray (unit direction) to every triangle it crosses, nearest first. */
function rayHits(tris: Triangles, o: number[], d: number[], merge: number): number[] {
  const out: number[] = [];
  const n = tris.length / 9;
  for (let t = 0; t < n; t++) {
    const i = t * 9;
    const e1 = [tris[i + 3] - tris[i], tris[i + 4] - tris[i + 1], tris[i + 5] - tris[i + 2]];
    const e2 = [tris[i + 6] - tris[i], tris[i + 7] - tris[i + 1], tris[i + 8] - tris[i + 2]];
    const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
    const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    const s = [o[0] - tris[i], o[1] - tris[i + 1], o[2] - tris[i + 2]];
    const u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) * inv;
    if (u < 0 || u > 1) continue;
    const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
    const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) * inv;
    if (v < 0 || u + v > 1) continue;
    const dist = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv;
    if (dist > 0) out.push(dist);
  }
  out.sort((x, y) => x - y);
  // A crossing counted twice on a shared edge, or a surface modelled twice, is one surface
  // (`merge` is about 0.13 mm on a normal ring, in the file's own units).
  return out.filter((v, k) => k === 0 || v - out[k - 1] > merge);
}

/** US ring size from the inside diameter (US: diameter = 11.63 + 0.8128 × size mm), to the nearest quarter. */
export function usRingSize(innerDiameterMm: number): number {
  return Math.round(((innerDiameterMm - 11.63) / 0.8128) * 4) / 4;
}

/** EU (ISO 8653) size is the inside circumference in millimetres. */
export function euRingSize(innerDiameterMm: number): number {
  return Math.round(Math.PI * innerDiameterMm);
}

/** "US 7 · EU 54 · 17.3 mm inside" */
export function formatRingSize(innerDiameterMm: number): string {
  const us = usRingSize(innerDiameterMm);
  return `US ${Number.isInteger(us) ? us : us.toFixed(2).replace(/0$/, '')} · EU ${euRingSize(innerDiameterMm)} · ${innerDiameterMm.toFixed(1)} mm inside`;
}

/**
 * Volume enclosed by the triangles (divergence theorem) and how closed the
 * surface is: the share of edges shared by exactly two triangles after joining
 * vertices that sit at the same place. A weight is only offered when the
 * surface is closed, otherwise the volume means little.
 */
export function meshVolume(tris: Triangles): { mm3: number; closed: number } {
  let v = 0;
  const key = (i: number) => `${Math.round(tris[i] * 1e4)},${Math.round(tris[i + 1] * 1e4)},${Math.round(tris[i + 2] * 1e4)}`;
  const edges = new Map<string, number>();
  const n = tris.length / 9;
  for (let t = 0; t < n; t++) {
    const o = t * 9;
    const ax = tris[o], ay = tris[o + 1], az = tris[o + 2];
    const bx = tris[o + 3], by = tris[o + 4], bz = tris[o + 5];
    const cx = tris[o + 6], cy = tris[o + 7], cz = tris[o + 8];
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    const k = [key(o), key(o + 3), key(o + 6)];
    for (const [p, q] of [[0, 1], [1, 2], [2, 0]]) {
      const e = k[p] < k[q] ? `${k[p]}|${k[q]}` : `${k[q]}|${k[p]}`;
      edges.set(e, (edges.get(e) ?? 0) + 1);
    }
  }
  let two = 0;
  for (const c of edges.values()) if (c === 2) two++;
  return { mm3: Math.abs(v), closed: edges.size ? two / edges.size : 0 };
}

/**
 * The volume is trusted only for a fully closed surface: every edge shared by
 * exactly two triangles. A ratio threshold is not safe: a ring cut open has
 * only a handful of loose edges yet is missing a large share of its volume.
 */
export const CLOSED_ENOUGH = 1;
