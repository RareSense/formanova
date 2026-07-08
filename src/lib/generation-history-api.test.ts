import { describe, it, expect, vi, beforeEach } from 'vitest';
import { inferSourceType, resolveSourceType } from './generation-history-api';

// -- URL tests: verify no hardcoded production domain --

const mockAuthFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/authenticated-fetch', () => ({ authenticatedFetch: mockAuthFetch }));

import { listMyWorkflows, getWorkflowDetails, fetchCadResult, fetchWorkflowCreditAudit } from './generation-history-api';

function okJson(body: unknown) {
  return Promise.resolve({
    ok: true, status: 200,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response);
}

function notOk(status = 500) {
  return Promise.resolve({
    ok: false, status,
    headers: { get: () => 'text/plain' },
    json: () => Promise.resolve({}),
    text: () => Promise.resolve('error'),
  } as unknown as Response);
}

beforeEach(() => mockAuthFetch.mockReset());

describe('generation-history-api URL shapes', () => {
  it('listMyWorkflows calls a relative /history path', async () => {
    mockAuthFetch.mockReturnValueOnce(okJson([]));
    await listMyWorkflows(10, 0);
    const [url] = mockAuthFetch.mock.calls[0];
    expect(url).toMatch(/^\/history\//);
    expect(url).not.toContain('formanova.ai');
  });

  it('getWorkflowDetails calls a relative /history path', async () => {
    mockAuthFetch.mockReturnValueOnce(okJson({ summary: {}, steps: [] }));
    await getWorkflowDetails('wf-1');
    const [url] = mockAuthFetch.mock.calls[0];
    expect(url).toMatch(/^\/history\//);
    expect(url).toContain('wf-1');
    expect(url).not.toContain('formanova.ai');
  });

  it('fetchCadResult calls a relative /api/result path', async () => {
    mockAuthFetch.mockReturnValueOnce(okJson({}));
    await fetchCadResult('wf-2');
    const [url] = mockAuthFetch.mock.calls[0];
    expect(url).toMatch(/^\/api\/result\//);
    expect(url).not.toContain('formanova.ai');
  });

  it('fetchCadResult reads ring edit output from build nodes', async () => {
    mockAuthFetch.mockReturnValueOnce(okJson({
      build_retry: [{ glb_artifact: { uri: 'gs://bucket/edit.glb' } }],
    }));

    await expect(fetchCadResult('wf-edit')).resolves.toEqual({
      glb_url: 'gs://bucket/edit.glb',
      azure_source: 'build_retry',
    });
  });

  it('fetchCadResult uses only build_initial when failed_final is present', async () => {
    mockAuthFetch.mockReturnValueOnce(okJson({
      failed_final: [{}],
      build_retry: [{ glb_artifact: { uri: 'gs://bucket/retry.glb' } }],
      build_initial: [{ glb_artifact: { uri: 'gs://bucket/initial.glb' } }],
    }));

    await expect(fetchCadResult('wf-failed')).resolves.toEqual({
      glb_url: 'gs://bucket/initial.glb',
      azure_source: 'build_initial',
    });
  });

  it('fetchCadResult prefers success output when failed_final is also present', async () => {
    mockAuthFetch.mockReturnValueOnce(okJson({
      failed_final: [{}],
      success_final: [{ glb_artifact: { uri: 'gs://bucket/final.glb' } }],
      build_initial: [{ glb_artifact: { uri: 'gs://bucket/initial.glb' } }],
    }));

    await expect(fetchCadResult('wf-final')).resolves.toEqual({
      glb_url: 'gs://bucket/final.glb',
      azure_source: 'success_final',
    });
  });

  it('fetchWorkflowCreditAudit calls a relative /api/credits/audit path', async () => {
    mockAuthFetch.mockReturnValueOnce(okJson({ actual_user_billed: 10 }));
    await fetchWorkflowCreditAudit('wf-3');
    const [url] = mockAuthFetch.mock.calls[0];
    expect(url).toMatch(/^\/api\/credits\/audit\//);
    expect(url).not.toContain('formanova.ai');
  });
});

describe('inferSourceType', () => {
  it('identifies product_shot workflows', () => {
    expect(inferSourceType('product_shot_workflow')).toBe('product_shot');
    expect(inferSourceType('product-shot-v2')).toBe('product_shot');
    expect(inferSourceType('PRODUCT_SHOT')).toBe('product_shot');
  });

  it('identifies cad_text workflows', () => {
    expect(inferSourceType('ring_full_pipeline')).toBe('cad_text');
    expect(inferSourceType('ring_generate')).toBe('cad_text');
    expect(inferSourceType('text_to_cad')).toBe('cad_text');
    expect(inferSourceType('text-to-cad')).toBe('cad_text');
    expect(inferSourceType('ring-generate')).toBe('cad_text');
    expect(inferSourceType('ring_pipeline_v2')).toBe('cad_text');
    expect(inferSourceType('ring_generate_v3')).toBe('cad_text');
  });

  it('identifies cad_render workflows', () => {
    expect(inferSourceType('cad_render')).toBe('cad_render');
    expect(inferSourceType('render_workflow')).toBe('cad_render');
  });

  it('identifies photo workflows', () => {
    expect(inferSourceType('photo_workflow')).toBe('photo');
    expect(inferSourceType('masking_pipeline')).toBe('photo');
    expect(inferSourceType('flux_gen')).toBe('photo');
    expect(inferSourceType('jewelry_photoshoot')).toBe('photo');
    expect(inferSourceType('necklace_shoot')).toBe('photo');
    expect(inferSourceType('earring_workflow')).toBe('photo');
    expect(inferSourceType('bracelet_gen')).toBe('photo');
    expect(inferSourceType('watch_shoot')).toBe('photo');
    expect(inferSourceType('agentic_pipeline')).toBe('photo');
  });

  it('classifies High Effort (higher_tier) generate + fix names into the right section', () => {
    // Model generate high -> photo (via photo/jewelry keywords)
    expect(inferSourceType('jewelry_photoshoots_generator_higher_tier')).toBe('photo');
    expect(inferSourceType('jewelry_photoshoots_generator_higher_tier_4k')).toBe('photo');
    // Product generate high -> product_shot
    expect(inferSourceType('Product_shot_pipeline_higher_tier')).toBe('product_shot');
    // Model fix high -> photo (has no photo/jewelry keyword; matched via model_shot)
    expect(inferSourceType('fix_model_shot_higher_tier')).toBe('photo');
    expect(inferSourceType('fix_model_shot_higher_tier_4k')).toBe('photo');
    // Product fix high -> product_shot
    expect(inferSourceType('fix_product_shot_higher_tier')).toBe('product_shot');
    expect(inferSourceType('fix_product_shot_higher_tier_4k')).toBe('product_shot');
  });

  it('identifies upscale workflows as photo entries', () => {
    expect(inferSourceType('upscale_image')).toBe('photo');
    expect(inferSourceType('Upscale')).toBe('photo');
  });

  it('product_shot takes priority over photo keywords', () => {
    expect(inferSourceType('product_shot_jewelry')).toBe('product_shot');
  });

  it('cad_text takes priority over cad_render for ring pipelines', () => {
    expect(inferSourceType('ring_full_pipeline')).toBe('cad_text');
  });

  it('returns unknown for unrecognised names', () => {
    expect(inferSourceType('')).toBe('unknown');
    expect(inferSourceType('my_custom_workflow')).toBe('unknown');
    expect(inferSourceType('test')).toBe('unknown');
  });
});

describe('resolveSourceType', () => {
  it('maps backend generate/fix/upscale families to the coarse UI bucket', () => {
    // name is intentionally empty to prove the backend value is what drives it.
    expect(resolveSourceType('model_shot', '')).toBe('photo');
    expect(resolveSourceType('model_fix', '')).toBe('photo');
    expect(resolveSourceType('upscale', '')).toBe('photo');
    expect(resolveSourceType('product_shot', '')).toBe('product_shot');
    expect(resolveSourceType('product_fix', '')).toBe('product_shot');
    expect(resolveSourceType('cad_text', '')).toBe('cad_text');
    expect(resolveSourceType('cad_sketch', '')).toBe('cad_sketch');
    expect(resolveSourceType('cad_render', '')).toBe('cad_render');
  });

  it('prefers the backend value over the workflow name', () => {
    // Name would parse to photo, but the backend says product -> backend wins.
    expect(resolveSourceType('product_shot', 'jewelry_photoshoot')).toBe('product_shot');
    // Consolidated base name that no longer encodes the fix family; backend disambiguates.
    expect(resolveSourceType('product_fix', 'fix')).toBe('product_shot');
  });

  it('falls back to name parsing when the field is absent', () => {
    expect(resolveSourceType(undefined, 'jewelry_photoshoots_generator')).toBe('photo');
    expect(resolveSourceType(null, 'Product_shot_pipeline')).toBe('product_shot');
    expect(resolveSourceType(undefined, 'ring_full_pipeline')).toBe('cad_text');
  });

  it('falls back to name parsing when the backend value is unknown or unrecognised', () => {
    // Backend could not classify, but the name still can.
    expect(resolveSourceType('unknown', 'jewelry_photoshoot')).toBe('photo');
    // A future backend enum the UI does not know yet -> parse the name instead of breaking.
    expect(resolveSourceType('cad_video', 'render_workflow')).toBe('cad_render');
    // Neither side can classify -> unknown, gracefully.
    expect(resolveSourceType('unknown', 'my_custom_workflow')).toBe('unknown');
  });
});
