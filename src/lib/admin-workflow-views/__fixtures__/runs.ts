/**
 * Admin detail responses per workflow family, shaped like GET /api/admin/generations/{id}
 * after normalizeAdminGenerationDetail. Field names follow the workflow specs
 * (temporal-agentic-pipeline docs/superpowers/specs/2026-07-06-pricing-restructure-workflows-final.yaml,
 * src/resources/tools.yaml) and the tool services (FormaNova_cad_to_catalog cad_fastload /
 * place_in_scene, FormaNova_cad_toolkit llm_caller). Outputs are denormalised (https://api/...
 * /api/artifacts/<sha>); a raised tool failure is recorded as { error }. Test data only.
 */
import type { AdminGenerationDetail, AdminGenerationStep } from '@/lib/admin-generations-api';

export const sha = (n: number) => n.toString(16).padStart(64, '0');
export const proxy = (n: number) => `/api/artifacts/${sha(n)}`;
const api = (n: number) => `https://api.formanova.ai/api/artifacts/${sha(n)}`;
const art = (n: number, type = 'image/png', bytes?: number) => ({ uri: api(n), type, sha256: sha(n), ...(bytes ? { bytes } : {}) });

const step = (tool_name: string, output: unknown, input: unknown = {}, took_ms: number | null = 1500): AdminGenerationStep => ({
  tool_name, took_ms, at: '2026-11-01T10:00:05Z', input, output,
});

const base = (workflow_name: string, actual: number, provider: number): Omit<AdminGenerationDetail, 'input_payload' | 'steps'> => ({
  workflow_id: `wf-${workflow_name}`,
  workflow_name,
  status: 'completed',
  user_email: 'brand@shop.co',
  user_type: 'jewelry_brand',
  is_paying: true,
  created_at: '2026-11-01T10:00:00Z',
  finished_at: '2026-11-01T10:02:00Z',
  actual_cost: actual,
  total_provider_cost: provider,
  feedback: null,
});

export const productShotRun = (): AdminGenerationDetail => ({
  ...base('Product_shot_pipeline_higher_tier', 28, 56),
  input_payload: {
    jewelry_image_url: api(1),
    jewelry_image_urls: [api(1), api(2)],
    inspiration_image_url: api(3),
    category: 'earrings',
    user_art_direction: 'warm white marble, soft morning light',
    aspect_ratio: '4:5',
    image_size: '2K',
  },
  steps: [
    step('analyze_jewelry_pdp', { result: {
      category: 'earrings', same_piece: true, images: [{ index: 0, view: 'front' }], pattern: 'pair',
      identity: 'gold hoop earring', summary: 'a pair of gold hoops shown front',
      art_direction: { surface: 'white marble', lighting: 'soft morning light' }, idempotency_key: 'k1',
    } }),
    step('prepare_jewelry_request_pdp_higher_tier', {
      prompt: 'Product photograph of a pair of gold hoop earrings on warm white marble, soft morning light.',
      jewelry_image: art(1), jewelry_images: [art(1), art(2)], inspiration_image: art(3),
      category: 'earrings', aspect_ratio: '4:5', image_size: '2K',
    }),
    step('generate_jewelry_image_pdp_higher_tier', { error: 'HTTP 504 from generate_jewelry_image_pdp_higher_tier: upstream timed out' }),
    step('generate_jewelry_image_pdp_higher_tier', { image: art(4), output_url: api(4), mime_type: 'image/png', category: 'earrings', image_b64: null }, {}, 41000),
  ],
});

export const photoshoot4kRun = (): AdminGenerationDetail => ({
  ...base('jewelry_photoshoots_generator_higher_tier_4k', 20, 28),
  input_payload: {
    payload: {
      model_image_url: api(10),
      jewelry_image_urls: [api(11)],
      category: 'necklace',
      user_piece: 'emerald pendant necklace',
      user_specs: { chain_length: '45 cm', metal: '18k gold' },
      aspect_ratio: '3:4',
      image_size: '4K',
      upscale_factor: 2,
    },
  },
  steps: [
    step('analyze_onmodel_jewelry', { result: {
      category: 'necklace', items: [{ index: 0, kind: 'pendant necklace', view: 'front' }],
      piece: 'emerald pendant on a fine gold chain', specs: { chain_length: '45 cm' },
      needs_repose: true, pose_match: false, base_desc: 'a woman in a white linen shirt',
    } }),
    step('prepare_jewelry_request_initial_higher_tier', { prompt: 'Place the emerald pendant on the model, chain resting at the collarbone.', model_image: art(10), jewelry_images: [art(11)] }),
    step('generate_jewelry_image_initial_higher_tier', { output_url: api(12), image: art(12) }),
    step('prepare_jewelry_request_polished_higher_tier', { prompt: 'Polish the draft: keep the pendant exact, refine skin and light.' }),
    step('generate_jewelry_image_polished_higher_tier', { error: { type: 'ToolError', message: 'OpenAI 429: rate limited' } }),
    step('generate_jewelry_image_polished_higher_tier', { output_url: api(13), image: art(13) }),
    step('upscale_higher_tier_4k', { image: art(14), status: 'completed' }),
  ],
});

export const designImageRun = (): AdminGenerationDetail => ({
  ...base('design_image_v1', 14, 0),
  input_payload: {
    payload: {
      prompt: 'Make the band thinner and add milgrain',
      images: [
        { role: 'base', artifact: art(20) },
        { role: 'markup', artifact: art(21) },
        { role: 'reference', artifact: art(22) },
      ],
      output: 'render',
      view: 'three_quarter',
      jewelry_type: 'ring',
      dimensions: 'band 2 mm',
    },
  },
  steps: [
    step('formanova_cad_design_image', { result: {
      ok: true, status: 'completed', tool: 'design_image', image_artifact: art(23),
      consistent: false, drift: ['stone is oval, the design shows round'], view: 'three_quarter',
      cost: { total_usd: 0.067, total_tokens: 5200, is_exact: true },
    } }),
  ],
});

export const fastloadRun = (): AdminGenerationDetail => ({
  ...base('cad_to_catalog_fastload', 0, 0),
  input_payload: { payload: { cad_file: { ...art(30, 'model/vnd.3dm', 78_123_456), name: 'pave-halo-ring.3dm' } } },
  steps: [
    step('cad_fastload', {
      skeleton_3dm: { ...art(31, 'model/vnd.3dm', 1_200_000) },
      meshes: { ...art(32, 'application/x-cad-to-pictures-meshes+gzip', 40_000_000) },
      triangles: 4_750_000, meshed: 3, unmeshed: 0, seconds: 41.2,
    }, {}, 41200),
  ],
});

export const catalogShotRun = (): AdminGenerationDetail => ({
  ...base('cad_to_catalog_shot', 36, 36),
  input_payload: {
    payload: {
      kind: 'photo',
      render_image: art(40),
      background_image: art(41, 'image/jpeg'),
      materials: 'band: Yellow Gold; round x14: Diamond',
      aspect: '4:5',
      resolution: '2K',
      model: 'gemini',
    },
  },
  steps: [
    step('place_in_scene', {
      image: art(42, 'image/jpeg'), ai_image: art(43, 'image/jpeg'),
      prompt: 'Place the ring on the linen, keep its exact shape and metal.',
      aspect: '4:5', fit: 'contain', model: 'gemini-3-pro-image-preview', resolution: '2K', seconds: 38.5,
    }),
  ],
});

export const catalogWhiteRun = (): AdminGenerationDetail => ({
  ...base('cad_to_catalog_shot', 48, 48),
  input_payload: {
    payload: {
      kind: 'white', piece: 'Halo ring', category: 'ring', resolution: '1K',
      pictures: [
        { name: 'front', angle: 'front', metal: 'Yellow Gold', image: art(50) },
        { name: 'side', angle: 'side', metal: null, image: art(51) },
      ],
    },
  },
  steps: [
    step('save_pictures', { images: [{ name: 'front', file: art(52) }, { name: 'side', file: art(53) }], seconds: 1.2 }),
  ],
});

export const cadImproveRun = (): AdminGenerationDetail => ({
  ...base('jewelry_cad_improve', 40, 0),
  input_payload: {
    payload: {
      client_flow: 'image',
      jewelry_type: 'ring',
      user_description: 'make the band thinner',
      reference_image_artifacts: [art(60)],
      material: { alloy: '18k_yellow_gold' },
      llm_tier: 'gpt_6_astra_openai',
      analysis_tier: null,
    },
    cad_improve: {
      set_id: '11111111-1111-4111-8111-111111111111',
      root_asset_id: '22222222-2222-4222-8222-222222222222',
      parent_asset_id: '33333333-3333-4333-8333-333333333333',
    },
  },
  steps: [
    step('formanova_cad_llm_caller', { error: 'HTTP 502 from formanova_cad_llm_caller' }),
    step('formanova_cad_llm_caller', { result: { ok: true, status: 'completed', text: 'code', cost: { total_usd: 0.4123, total_tokens: 18000 } } }),
    step('formanova_cad_ring_publish_result', { result: {
      threedm_artifact: art(61, 'model/vnd.3dm', 2048),
      glb_artifact: art(62, 'model/gltf-binary'),
      stl_artifacts: [art(63, 'model/stl')],
      step_artifacts: [art(64, 'model/step')],
      derivatives: { casting_body: { status: 'completed', files: [{ ...art(65, 'model/stl'), name: 'casting_body.stl' }] } },
      spec_sheet: art(66, 'application/pdf'),
      estimated_metal_mass_g: 4.82,
      validation_status: 'applied',
    } }),
  ],
});

export const unknownRun = (): AdminGenerationDetail => ({
  ...base('fix_model_shot_higher_tier', 10, 10),
  input_payload: { payload: { fix_instruction: 'remove the second ring', result_image_url: api(70), category: 'ring' } },
  steps: [step('fix_jewelry_image_model_shot_higher_tier', { output_url: api(71), category: 'ring' })],
});
