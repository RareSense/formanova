import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { computeExplodeOffsets, easeExplode } from "./cad-explode";

function part(name: string, at: [number, number, number], size = 1) {
  return {
    name,
    geometry: new THREE.BoxGeometry(size, size, size),
    position: new THREE.Vector3(...at),
    quaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3(1, 1, 1),
  };
}

describe("computeExplodeOffsets", () => {
  it("pushes parts radially away from the piece center, scaled by distance", () => {
    const offsets = computeExplodeOffsets([
      part("left", [-2, 0, 0]),
      part("right", [2, 0, 0]),
      part("top", [0, 4, 0]),
    ], 0.5);

    // Piece box spans x -2.5..2.5 and y -0.5..4.5, so its center is (0, 2, 0).
    expect(offsets.get("left")!.toArray()).toEqual([-1, -1, 0]);
    expect(offsets.get("right")!.toArray()).toEqual([1, -1, 0]);
    expect(offsets.get("top")!.toArray()).toEqual([0, 1, 0]);
  });

  it("leaves a part centered on the piece where it is", () => {
    const offsets = computeExplodeOffsets([
      part("shank", [0, 0, 0], 4),
      part("stone", [0, 1.5, 0]),
    ], 0.5);

    expect(offsets.get("shank")!.length()).toBeCloseTo(0);
    expect(offsets.get("stone")!.y).toBeGreaterThan(0);
  });

  it("uses the part's transform, not just its raw geometry", () => {
    const rotated = part("rotated", [0, 0, 0]);
    rotated.geometry.translate(3, 0, 0);
    rotated.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    const offsets = computeExplodeOffsets([rotated, part("origin", [0, 0, 0])], 1);

    // Geometry sits at +x, the 90 degree turn moves it to +y.
    const o = offsets.get("rotated")!;
    expect(o.x).toBeCloseTo(0);
    expect(o.y).toBeGreaterThan(0);
  });

  it("returns nothing for an empty scene", () => {
    expect(computeExplodeOffsets([]).size).toBe(0);
  });
});

describe("easeExplode", () => {
  it("starts at 0, ends at 1 and is symmetric", () => {
    expect(easeExplode(0)).toBe(0);
    expect(easeExplode(1)).toBe(1);
    expect(easeExplode(0.5)).toBe(0.5);
  });
});
