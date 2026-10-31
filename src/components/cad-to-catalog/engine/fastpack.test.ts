import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { swapInMeshes, unpackMeshes } from './fastpack';
import expected from './__fixtures__/sample-meshes.expected.json';

// Packed by the toolkit's fastload.py from cad-to-pictures samples/hidden_and_nomesh.3dm;
// the expected numbers were read from the same file with rhino3dm.
const packed = () => {
  const b = readFileSync(resolve(__dirname, '__fixtures__/sample-meshes.bin'));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

describe('unpackMeshes', () => {
  it('gives back exactly the meshes fastload.py packed', () => {
    const { byId, order } = unpackMeshes(packed());
    expect(order).toEqual(expected.order);
    for (const [id, want] of Object.entries(expected.objects)) {
      const g = byId.get(id)!;
      expect(g).toBeDefined();
      expect([...(g.attributes.position.array as Float32Array)].map((v) => +v.toFixed(5))).toEqual(want.position);
      expect([...(g.index!.array as Uint32Array)]).toEqual(want.index);
      expect(!!g.attributes.normal).toBe(want.hasNormal);
    }
  });
});

describe('swapInMeshes', () => {
  it('replaces placeholders by object id and restores the file order', () => {
    const pack = unpackMeshes(packed());
    const [meshId, otherId] = expected.order;
    const placeholder = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    placeholder.userData.attributes = { id: `{${meshId.toUpperCase()}}` };
    const other = new THREE.Object3D();
    other.userData.attributes = { id: otherId };
    const block = new THREE.Group(); // block instances have no attributes and stay last
    const root = new THREE.Group();
    root.add(block, other, placeholder);
    expect(swapInMeshes(root, pack)).toBe(1);
    expect(root.children).toEqual([placeholder, other, block]);
    expect(placeholder.geometry).toBe(pack.byId.get(meshId));
  });
});
