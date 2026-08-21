import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuthenticatedFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/authenticated-fetch', () => ({
  authenticatedFetch: mockAuthenticatedFetch,
}));

import { downloadCadArtifact, isExpectedCadArtifact, selectCadArtifactUrl, expectedSha256FromUrl } from './cad-artifact-download';

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

/** Builds a spec-accurate 32-byte openNURBS header: "3D Geometry File Format" (23) + space (1) + version right-justified in an 8-char field. */
function rhinoHeader(version: string): Blob {
  const prefix = '3D Geometry File Format ';
  return new Blob([prefix + version.padStart(8, ' ')]);
}

describe('CAD artifact signatures', () => {
  it('recognizes GLB magic bytes and rejects them as 3DM', async () => {
    const glb = validGlb();
    await expect(isExpectedCadArtifact(glb, 'glb')).resolves.toBe(true);
    await expect(isExpectedCadArtifact(glb, '3dm')).resolves.toBe(false);
  });

  it('recognizes the Rhino 3DM header and rejects it as GLB', async () => {
    const threedm = rhinoHeader('80');
    await expect(isExpectedCadArtifact(threedm, '3dm')).resolves.toBe(true);
    await expect(isExpectedCadArtifact(threedm, 'glb')).resolves.toBe(false);
  });

  it('accepts legacy 1-digit and future 3-digit Rhino format versions', async () => {
    // openNURBS right-justifies the version in an 8-char field — Rhino 1-4
    // wrote single-digit versions ("4"); a future Rhino 10 would write "100".
    await expect(isExpectedCadArtifact(rhinoHeader('4'), '3dm')).resolves.toBe(true);
    await expect(isExpectedCadArtifact(rhinoHeader('100'), '3dm')).resolves.toBe(true);
  });

  it('rejects truncated or internally inconsistent containers', async () => {
    await expect(isExpectedCadArtifact(bytes(0x67, 0x6c, 0x54, 0x46), 'glb')).resolves.toBe(false);
    await expect(isExpectedCadArtifact(new Blob(['3D Geometry File Format']), '3dm')).resolves.toBe(false);
  });
});

describe('downloadCadArtifact auth routing', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  let plainFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockAuthenticatedFetch.mockReset();
    plainFetch = vi.fn();
    vi.stubGlobal('fetch', plainFetch);
    URL.createObjectURL = vi.fn(() => 'blob:cad-artifact');
    URL.revokeObjectURL = vi.fn();
    // jsdom logs "Not implemented: navigation" when an anchor with a blob:
    // href is clicked — harmless in a browser, just noise here.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  function okResponse(blob: Blob): Response {
    return { ok: true, status: 200, blob: async () => blob } as unknown as Response;
  }

  it('uses authenticatedFetch for same-origin /api/ and /artifacts/ paths', async () => {
    mockAuthenticatedFetch.mockResolvedValue(okResponse(validGlb()));
    await downloadCadArtifact('/api/artifacts/abc123', 'ring.glb', 'glb');
    expect(mockAuthenticatedFetch).toHaveBeenCalledWith('/api/artifacts/abc123');
    expect(plainFetch).not.toHaveBeenCalled();

    mockAuthenticatedFetch.mockClear();
    plainFetch.mockClear();
    mockAuthenticatedFetch.mockResolvedValue(okResponse(validGlb()));
    await downloadCadArtifact('/artifacts/abc123', 'ring.glb', 'glb');
    expect(mockAuthenticatedFetch).toHaveBeenCalledWith('/artifacts/abc123');
    expect(plainFetch).not.toHaveBeenCalled();
  });

  it('uses plain fetch for cross-origin URLs, never leaking the bearer token', async () => {
    plainFetch.mockResolvedValue(okResponse(validGlb()));
    await downloadCadArtifact('https://cdn.example.com/artifacts/abc123.glb', 'ring.glb', 'glb');
    expect(plainFetch).toHaveBeenCalledWith('https://cdn.example.com/artifacts/abc123.glb');
    expect(mockAuthenticatedFetch).not.toHaveBeenCalled();
  });

  it('uses plain fetch for a same-origin path outside /api/ and /artifacts/', async () => {
    plainFetch.mockResolvedValue(okResponse(validGlb()));
    await downloadCadArtifact('/public/model.glb', 'ring.glb', 'glb');
    expect(plainFetch).toHaveBeenCalledWith('/public/model.glb');
    expect(mockAuthenticatedFetch).not.toHaveBeenCalled();
  });

  it('rejects without downloading when the response bytes do not match the requested kind', async () => {
    mockAuthenticatedFetch.mockResolvedValue(okResponse(rhinoHeader('70')));
    await expect(downloadCadArtifact('/api/artifacts/abc123', 'ring.glb', 'glb'))
      .rejects.toThrow('The server did not return a valid GLB file.');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('throws on a non-2xx response without inspecting the body', async () => {
    mockAuthenticatedFetch.mockResolvedValue({ ok: false, status: 404 } as unknown as Response);
    await expect(downloadCadArtifact('/api/artifacts/missing', 'ring.glb', 'glb'))
      .rejects.toThrow('Download failed (404)');
  });
});

describe('artifact hash from the URL', () => {
  // The backend serves artifacts at /api/artifacts/<sha256>, and the response
  // shape confirms the path segment is the same value as the artifact's
  // sha256 field. That gives a free integrity check with no extra plumbing:
  // .3dm has no internal length field, so a truncated one is otherwise
  // indistinguishable from a good one.
  const sha = 'a'.repeat(64);

  it('reads the hash out of an artifact URL', () => {
    expect(expectedSha256FromUrl(`https://staging.formanova.ai/api/artifacts/${sha}`)).toBe(sha);
    expect(expectedSha256FromUrl(`/api/artifacts/${sha}`)).toBe(sha);
  });

  it('ignores a query string or trailing slash', () => {
    expect(expectedSha256FromUrl(`/api/artifacts/${sha}?download=1`)).toBe(sha);
    expect(expectedSha256FromUrl(`/api/artifacts/${sha}/`)).toBe(sha);
  });

  it('returns null when the URL is not hash addressed', () => {
    // Signed blob URLs and legacy paths must not be treated as verifiable, or
    // every download from them would fail an impossible check.
    expect(expectedSha256FromUrl('/api/result/model.3dm')).toBeNull();
    expect(expectedSha256FromUrl('https://blob.core.windows.net/x/model.glb?sig=abc')).toBeNull();
    expect(expectedSha256FromUrl(`/api/artifacts/${'a'.repeat(63)}`)).toBeNull();
    expect(expectedSha256FromUrl(`/api/artifacts/${'g'.repeat(64)}`)).toBeNull();
  });

  it('accepts an uppercase hash and normalises it', () => {
    expect(expectedSha256FromUrl(`/api/artifacts/${'A'.repeat(64)}`)).toBe('a'.repeat(64));
  });
});
