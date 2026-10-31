import { describe, expect, it } from 'vitest';
import {
  buildCadFileBody,
  buildPlaceBody,
  CATALOG_FALLBACK_PRICES,
  priceFromPolicy,
  shootCredits,
  buildSaveBody,
  findResult,
  parseFailure,
  parseFastloadResult,
  parsePlaceResult,
  parseSaveResult,
} from './cad-to-catalog-api';

const SHA = 'b'.repeat(64);
const ref = (name: string) => ({ uri: `azure://cad-to-catalog/cad-to-catalog/2026/10/29/${SHA}/${name}`, type: 'image/png', bytes: 5, sha256: SHA });
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

describe('buildPlaceBody', () => {
  it('sends the render, background, materials and shape to the place tool', () => {
    const body = buildPlaceBody({ render: PNG, background: 'data:image/jpeg;base64,/9j/', materials: 'band: Yellow Gold', aspect: '4:5', resolution: '4K' });
    expect(body.payload).toEqual({ kind: 'photo', render_image: PNG, background_image: 'data:image/jpeg;base64,/9j/', materials: 'band: Yellow Gold', aspect: '4:5', resolution: '4K', model: 'gemini' });
    // the run ends on the skipped save node; without this the result has no photo
    expect(body.return_nodes).toEqual(['place']);
  });

  it('refuses what the tool would refuse, before any request', () => {
    expect(() => buildPlaceBody({ render: 'data:image/jpeg;base64,x', background: PNG, materials: '', aspect: '1:1', resolution: '1K' })).toThrow(/transparent PNG/);
    expect(() => buildPlaceBody({ render: PNG, background: '', materials: '', aspect: '1:1', resolution: '1K' })).toThrow(/background/);
    expect(() => buildPlaceBody({ render: PNG, background: PNG, materials: '', aspect: '7:3' as never, resolution: '1K' })).toThrow(/shape/);
    expect(() => buildPlaceBody({ render: PNG, background: PNG, materials: '', aspect: '1:1', resolution: '8K' as never })).toThrow(/resolution/);
  });

  it('keeps the materials text within the tool limit', () => {
    const body = buildPlaceBody({ render: PNG, background: PNG, materials: 'x'.repeat(900), aspect: '1:1', resolution: '1K' });
    expect((body.payload.materials as string).length).toBe(600);
  });
});

describe('buildSaveBody', () => {
  it('sends every picture of the piece with its angle and metal', () => {
    const body = buildSaveBody('Ring A.3dm', 'ring', [{ name: '01_Front_White_Gold', angle: 'Front', metal: 'White Gold', image: PNG }]);
    expect(body.payload).toEqual({ kind: 'white', piece: 'Ring A.3dm', category: 'ring', pictures: [{ name: '01_Front_White_Gold', angle: 'Front', metal: 'White Gold', image: PNG }] });
  });

  it('needs 1 to 64 pictures', () => {
    expect(() => buildSaveBody('a.3dm', 'ring', [])).toThrow(/No pictures/);
    const many = Array.from({ length: 65 }, (_, i) => ({ name: `p${i}`, angle: '', metal: null, image: PNG }));
    expect(() => buildSaveBody('a.3dm', 'ring', many)).toThrow(/64/);
  });
});

describe('buildCadFileBody', () => {
  it('sends the file inline', () => {
    expect(buildCadFileBody('data:application/octet-stream;base64,AA==').payload).toEqual({ cad_file: 'data:application/octet-stream;base64,AA==' });
    expect(() => buildCadFileBody('')).toThrow();
  });
});

describe('result parsing', () => {
  it('finds the tool result flat or under its node', () => {
    expect(findResult({ place: [{ image: 1 }] }, 'image')).toEqual({ image: 1 });
    expect(findResult({ result: { save: { images: [] } } }, 'images')).toEqual({ images: [] });
    expect(findResult(null, 'x')).toBeNull();
  });

  it('reads the placed photo through the artifact proxy', () => {
    const img = parsePlaceResult({ place: [{ image: ref('placed.jpg'), ai_image: ref('ai.jpg'), aspect: '1:1' }] });
    expect(img?.url).toBe(`/api/artifacts/${SHA}`);
    expect(parsePlaceResult({ status: 'failed', ok: false, user_message: 'busy' })).toBeNull();
  });

  it('reads the kept pictures by name', () => {
    const saved = parseSaveResult({ images: [{ name: '01_Front', angle: 'Front', metal: null, file: ref('a.png') }, { name: 'bad' }] });
    expect(saved?.map((s) => s.name)).toEqual(['01_Front']);
    expect(parseSaveResult({ images: [] })).toBeNull();
  });

  it('reads fastload and rhino_mesh files', () => {
    expect(parseFastloadResult({ skeleton_3dm: ref('s.3dm'), meshes: ref('m.bin.gz'), triangles: 9 })?.meshes.sha256).toBe(SHA);
    expect(parseFastloadResult({ skeleton_3dm: ref('s.3dm') })).toBeNull();
  });

  it("shows the tool's own words when a run fails", () => {
    expect(parseFailure({ node: [{ status: 'failed', user_message: 'This tool is busy', retryable: true }] })).toEqual({ userMessage: 'This tool is busy', retryable: true });
    expect(parseFailure({})).toEqual({ userMessage: "We couldn't finish that. Please try again.", retryable: false });
  });
});

describe('priced drawn pictures', () => {
  it('sends the resolution with a kept picture so the run is priced by size', () => {
    const body = buildSaveBody('Ring A.3dm', 'ring', [{ name: '01_Front', angle: 'Front', metal: null, image: PNG }], '4K');
    expect(body.payload.resolution).toBe('4K');
    expect(() => buildSaveBody('Ring A.3dm', 'ring', [{ name: 'x', angle: 'Front', metal: null, image: PNG }], '8K' as never)).toThrow(/resolution/);
  });

  it('charges every picture, photo or white, the same price', () => {
    expect(shootCredits({ photos: 3, drawn: 5 }, 24)).toBe(8 * 24);
    expect(CATALOG_FALLBACK_PRICES).toEqual({ '1K': 24, '2K': 36, '4K': 48 });
  });
});

describe('picture kinds and prices', () => {
  it('tells the shot workflow which step a picture takes', () => {
    expect(buildSaveBody('a.3dm', 'ring', [{ name: 'x', angle: 'Front', metal: null, image: PNG }], '1K').payload.kind).toBe('white');
    expect(buildPlaceBody({ render: PNG, background: PNG, materials: '', aspect: '1:1', resolution: '1K' }).payload.kind).toBe('photo');
  });

  it("reads a picture's price for a resolution from the workflow's price list", () => {
    const policy = { policy: { conditional_pricing_rules: [
      { tool: 'formanova_cad_to_catalog_place_in_scene', when: { resolution: '1K' }, cost: 24 },
      { tool: 'formanova_cad_to_catalog_place_in_scene', when: { resolution: '4K' }, cost: 48 },
      { tool: 'formanova_cad_to_catalog_place_in_scene', cost: 48 },
    ] } };
    expect(priceFromPolicy(policy, '1K')).toBe(24);
    expect(priceFromPolicy(policy, '4K')).toBe(48);
    expect(priceFromPolicy(policy, '2K')).toBeNull();
    expect(priceFromPolicy({ policy: {} }, '1K')).toBeNull();
    expect(priceFromPolicy(null, '1K')).toBeNull();
  });
});
