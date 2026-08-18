import { describe, expect, it } from 'vitest';
import { isExpectedCadArtifact, selectCadArtifactUrl } from './cad-artifact-download';

function bytes(...values: number[]): Blob {
  return new Blob([new Uint8Array(values)]);
}

function validGlb(): Blob {
  return bytes(
    0x67, 0x6c, 0x54, 0x46,
    0x02, 0x00, 0x00, 0x00,
    0x0c, 0x00, 0x00, 0x00,
  );
}

describe('CAD artifact URL selection', () => {
  const fresh = { glb_url: '/fresh/model', threedm_url: '/fresh/rhino' };
  const fallback = { glb_url: '/cached/model', threedm_url: '/cached/rhino' };

  it('never crosses GLB and 3DM URLs', () => {
    expect(selectCadArtifactUrl('glb', fresh, fallback)).toBe('/fresh/model');
    expect(selectCadArtifactUrl('3dm', fresh, fallback)).toBe('/fresh/rhino');
  });

  it('falls back within the requested artifact type only', () => {
    expect(selectCadArtifactUrl('glb', { glb_url: null, threedm_url: '/wrong' }, fallback)).toBe('/cached/model');
    expect(selectCadArtifactUrl('3dm', { glb_url: '/wrong', threedm_url: null }, fallback)).toBe('/cached/rhino');
  });
});

describe('CAD artifact signatures', () => {
  it('recognizes GLB magic bytes and rejects them as 3DM', async () => {
    const glb = validGlb();
    await expect(isExpectedCadArtifact(glb, 'glb')).resolves.toBe(true);
    await expect(isExpectedCadArtifact(glb, '3dm')).resolves.toBe(false);
  });

  it('recognizes the Rhino 3DM header and rejects it as GLB', async () => {
    const threedm = new Blob(['3D Geometry File Format       80']);
    await expect(isExpectedCadArtifact(threedm, '3dm')).resolves.toBe(true);
    await expect(isExpectedCadArtifact(threedm, 'glb')).resolves.toBe(false);
  });

  it('rejects truncated or internally inconsistent containers', async () => {
    await expect(isExpectedCadArtifact(bytes(0x67, 0x6c, 0x54, 0x46), 'glb')).resolves.toBe(false);
    await expect(isExpectedCadArtifact(new Blob(['3D Geometry File Format']), '3dm')).resolves.toBe(false);
  });
});
