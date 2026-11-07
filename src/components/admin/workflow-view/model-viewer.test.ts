import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gzipSync } from 'node:zlib';

const open = vi.fn();
vi.mock('@/components/cad-to-catalog/engine/engine', () => ({
  CatalogEngine: class { open = open; dispose = vi.fn(); },
}));
const fetchMock = vi.fn();
vi.mock('@/lib/authenticated-fetch', () => ({ authenticatedFetch: (...a: unknown[]) => fetchMock(...a) }));

import { fetchPackedMeshes, openModel } from './model-viewer';

/** A fastload.py pack holding one triangle for object "abc". */
function pack(): Uint8Array {
  const planes = (vals: ArrayLike<number>, T: Float32ArrayConstructor | Uint32ArrayConstructor) => {
    const raw = new Uint8Array(new T(Array.from(vals)).buffer), n = vals.length, out = new Uint8Array(4 * n);
    for (let b = 0; b < 4; b++) for (let i = 0; i < n; i++) out[b * n + i] = raw[4 * i + b];
    return out;
  };
  const pos = planes([0, 0, 0, 1, 0, 0, 0, 1, 0], Float32Array);
  const idx = planes([0, 2, 2], Uint32Array); // zigzag deltas of 0,1,2
  const head = new TextEncoder().encode(JSON.stringify({ objects: [{ id: 'ABC', position: [0, 9], index: [pos.length, 3] }], order: ['ABC'] }));
  const out = new Uint8Array(4 + head.length + pos.length + idx.length);
  new DataView(out.buffer).setUint32(0, head.length, true);
  out.set(head, 4); out.set(pos, 4 + head.length); out.set(idx, 4 + head.length + pos.length);
  return out;
}

const ok = (bytes: Uint8Array) => new Response(bytes);

describe('admin model viewer: fastload meshes', () => {
  beforeEach(() => { open.mockReset(); fetchMock.mockReset(); });

  it('fetches the gzipped Meshes file, unzips and unpacks it', async () => {
    fetchMock.mockResolvedValue(ok(gzipSync(pack())));
    const packed = await fetchPackedMeshes('/api/artifacts/m');
    expect(packed.order).toEqual(['abc']);
    expect(packed.byId.get('abc')?.getAttribute('position').count).toBe(3);
  });

  it('also reads a pack that is not gzipped', async () => {
    fetchMock.mockResolvedValue(ok(pack()));
    expect((await fetchPackedMeshes('/api/artifacts/m')).byId.size).toBe(1);
  });

  it('opens the skeleton with the meshes swapped in', async () => {
    fetchMock.mockResolvedValue(ok(pack()));
    const packed = await fetchPackedMeshes('/api/artifacts/m');
    await openModel(document.createElement('div'), new ArrayBuffer(8), 'skeleton.3dm', packed);
    expect(open).toHaveBeenCalledWith(expect.any(File), expect.any(Map), { packedMeshes: packed });
  });

  it('opens any other file as before', async () => {
    await openModel(document.createElement('div'), new ArrayBuffer(8), 'ring.glb');
    expect(open).toHaveBeenCalledWith(expect.any(File), expect.any(Map), {});
  });
});
