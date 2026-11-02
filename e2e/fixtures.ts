/**
 * Files and API answers for the browser tests. Nothing here reaches a server:
 * every /api, /auth and /billing call is answered by page.route, and the
 * model and spec sheet are built in memory.
 */
import type { Page, Route } from '@playwright/test';

/** A gold-ish torus as a binary glTF, one mesh named "Band" (a metal part). */
export function torusGlb(): Buffer {
  const R = 9; const r = 1.2; const seg = 64; const sides = 16;
  const pos: number[] = []; const nrm: number[] = []; const idx: number[] = [];
  for (let i = 0; i <= seg; i += 1) {
    const u = (i / seg) * Math.PI * 2;
    for (let j = 0; j <= sides; j += 1) {
      const v = (j / sides) * Math.PI * 2;
      const nx = Math.cos(v) * Math.cos(u); const ny = Math.cos(v) * Math.sin(u); const nz = Math.sin(v);
      pos.push((R + r * Math.cos(v)) * Math.cos(u), (R + r * Math.cos(v)) * Math.sin(u), r * Math.sin(v));
      nrm.push(nx, ny, nz);
    }
  }
  for (let i = 0; i < seg; i += 1) {
    for (let j = 0; j < sides; j += 1) {
      const a = i * (sides + 1) + j; const b = a + sides + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const posBuf = Buffer.from(new Float32Array(pos).buffer);
  const nrmBuf = Buffer.from(new Float32Array(nrm).buffer);
  const idxBuf = Buffer.from(new Uint16Array(idx).buffer);
  const pad = (b: Buffer) => (b.length % 4 ? Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]) : b);
  const bin = Buffer.concat([pad(posBuf), pad(nrmBuf), pad(idxBuf)]);
  const min = [Infinity, Infinity, Infinity]; const max = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < pos.length; k += 1) { min[k % 3] = Math.min(min[k % 3], pos[k]); max[k % 3] = Math.max(max[k % 3], pos[k]); }
  const gltf = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'Band' }],
    meshes: [{ name: 'Band', primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [{ name: 'metal_gold', pbrMetallicRoughness: { baseColorFactor: [0.85, 0.65, 0.2, 1], metallicFactor: 1, roughnessFactor: 0.25 } }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBuf.length, target: 34962 },
      { buffer: 0, byteOffset: pad(posBuf).length, byteLength: nrmBuf.length, target: 34962 },
      { buffer: 0, byteOffset: pad(posBuf).length + pad(nrmBuf).length, byteLength: idxBuf.length, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: pos.length / 3, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5126, count: nrm.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: idx.length, type: 'SCALAR' },
    ],
  };
  let json = Buffer.from(JSON.stringify(gltf));
  json = json.length % 4 ? Buffer.concat([json, Buffer.alloc(4 - (json.length % 4), 0x20)]) : json;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
  const chunk = (data: Buffer, type: number) => { const h = Buffer.alloc(8); h.writeUInt32LE(data.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, data]); };
  return Buffer.concat([header, chunk(json, 0x4e4f534a), chunk(bin, 0x004e4942)]);
}

/** A two-page A4 PDF that looks like a spec sheet: a title, a drawing box, table lines. */
export function specSheetPdf(): Buffer {
  const page = (n: number) => [
    'BT /F1 16 Tf 40 790 Td (SAMPLE SPEC SHEET) Tj ET',
    `BT /F1 8 Tf 40 770 Td (Model: Sample signet ring   Version: V1   Page ${n} of 2) Tj ET`,
    '1 w 40 760 m 555 760 l S',
    '40 480 515 260 re S 220 520 120 160 re S',
    ...[0, 1, 2, 3].map((i) => `40 ${440 - i * 24} m 555 ${440 - i * 24} l S`),
  ].join('\n');
  const objects: string[] = [];
  const pages = [1, 2];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(`<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  for (const n of pages) {
    const content = page(n);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + (n - 1) * 2} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  }
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

export const USER = { id: 'e2e-user', email: 'e2e@example.com', is_active: true, is_superuser: false, is_verified: true };
export const WORKFLOW_ID = 'wf-e2e-metal';
export const ASSET_ID = 'asset-e2e-v1';
/** 27.98 g in 14K yellow (UPMR 204, 12.76 g/cm³). */
export const VOLUME_MM3 = 2192.79;

export interface MockOptions {
  volumeFlags?: string[] | null;
  specSheet?: 'ok' | 'broken' | 'none';
  openFlags?: number;
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** Signs in, skips onboarding, and answers every backend call the CAD page makes. */
export async function mockCadApi(page: Page, options: MockOptions = {}) {
  const { volumeFlags = null, specSheet = 'ok', openFlags = 3 } = options;
  const glb = torusGlb();
  const pdf = specSheetPdf();
  await page.addInitScript((user) => {
    localStorage.setItem('formanova_auth_token', 'e2e-token');
    localStorage.setItem('formanova_auth_user', JSON.stringify(user));
    localStorage.setItem(`formanova_onboarding_${user.id}`, 'true');
  }, USER);

  const version = {
    asset_id: ASSET_ID,
    position: 0,
    name: 'Sample signet ring',
    source_workflow_id: WORKFLOW_ID,
    glb_url: '/mock-files/ring.glb',
    thumbnail_url: null,
    improvable: true,
    created_at: '2026-11-02T10:00:00Z',
    downloads: [
      { kind: 'threedm', filename: 'ring.3dm', bytes: 1000 },
      ...(specSheet === 'none' ? [] : [{ kind: 'spec_sheet', filename: 'ring_spec.pdf', bytes: pdf.length }]),
    ],
    spec_sheet_open_flags: openFlags,
    metal_volume_mm3: VOLUME_MM3,
    metal_volume_flags: volumeFlags,
    weight_target: { grams: 28, tolerance_pct: 5, alloy_id: 'au14y' },
  };

  await page.route((url) => /^\/(api|auth|billing|shopify|mock-files)\//.test(url.pathname) || url.hostname !== '127.0.0.1', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (url.hostname !== '127.0.0.1') return route.fulfill({ status: 204, body: '' });
    if (path === '/auth/users/me') return json(route, USER);
    if (path === '/api/credits/balance/me') return json(route, { balance: 5000, available: 5000 });
    if (path === '/api/user/profile') return json(route, { user_id: USER.id, role: 'jewelry_brand', brand_name: 'E2E', onboarding_complete: true });
    if (path === `/api/result/${WORKFLOW_ID}`) {
      return json(route, { glb_artifact: { uri: '/mock-files/ring.glb', type: 'model/gltf-binary', bytes: glb.length, sha256: '' }, metal_volume_mm3: VOLUME_MM3, metal_volume_flags: volumeFlags });
    }
    if (path === '/api/cad/models') return json(route, { items: [{ set_id: 'set-e2e', name: 'Sample signet ring', family: 'ring', versions: [version] }] });
    if (path === `/api/cad/versions/${ASSET_ID}/downloads/spec_sheet`) {
      return json(route, { url: '/mock-files/spec.pdf', expires_at: '2099-01-01T00:00:00Z', filename: 'ring_spec.pdf' });
    }
    if (path === '/mock-files/ring.glb') return route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: glb });
    if (path === '/mock-files/spec.pdf') {
      return specSheet === 'broken'
        ? route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from('not a pdf') })
        : route.fulfill({ status: 200, contentType: 'application/pdf', body: pdf });
    }
    return json(route, {}, 404);
  });
}
