import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractWorkflowCredits, inferSourceType, resolveSourceType } from './generation-history-api';

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

  it('classifies the consolidated ring workflow from its reference image count', async () => {
    mockAuthFetch.mockReturnValueOnce(okJson({ workflows: [
      { workflow_id: 'text', name: 'ring_cad_nurbs_v1', status: 'completed', source_type: 'unknown', input: { reference_image_count: 0 } },
      { workflow_id: 'image', name: 'ring_cad_nurbs_v1', status: 'completed', source_type: 'unknown', input: { reference_image_count: 2 } },
    ] }));

    const workflows = await listMyWorkflows();
    expect(workflows.map(workflow => workflow.source_type)).toEqual(['text_to_cad', 'image_to_cad']);
  });

  it('keeps regular generation families and maps cad_render_v1', async () => {
    mockAuthFetch.mockReturnValueOnce(okJson({ workflows: [
      { workflow_id: 'model', name: 'jewelry_photoshoots_generator', status: 'completed', source_type: 'model_shot' },
      { workflow_id: 'product', name: 'Product_shot_pipeline', status: 'completed', source_type: 'product_shot' },
      { workflow_id: 'render', name: 'cad_render_v1', status: 'completed', source_type: 'unknown' },
    ] }));

    const workflows = await listMyWorkflows();
    expect(workflows.map(workflow => workflow.source_type)).toEqual([
      'photo',
      'product_shot',
      'cad_render',
    ]);
  });

  it('keeps the actual workflow charge from the History summary', async () => {
    mockAuthFetch.mockReturnValueOnce(okJson({ workflows: [
      {
        workflow_id: 'cad-with-cost',
        name: 'ring_cad_nurbs_v1',
        status: 'completed',
        source_type: 'text_to_cad',
        actual_cost: '70',
        input: { reference_image_count: 0 },
      },
    ] }));

    const [workflow] = await listMyWorkflows();
    expect(workflow.credits_spent).toBe(70);
  });

  it('extracts prompt and reference_image_urls from the real backend field names', async () => {
    mockAuthFetch.mockReturnValueOnce(okJson({ workflows: [
      {
        workflow_id: 'text',
        name: 'ring_cad_nurbs_v1',
        status: 'completed',
        source_type: 'text_to_cad',
        input: { reference_image_count: 0, user_description: '  A twisted vine ring  ' },
      },
      {
        workflow_id: 'image',
        name: 'ring_cad_nurbs_v1',
        status: 'completed',
        source_type: 'image_to_cad',
        input: {
          reference_image_count: 1,
          reference_image_artifacts: [{ type: 'image/png', uri: 'azure://x/hashed/aa11bb22cc33dd44ee55ff66aa11bb22cc33dd44ee55ff66aa11bb22cc33dd44' }],
        },
      },
    ] }));

    const [textWf, imageWf] = await listMyWorkflows();
    expect(textWf.prompt).toBe('A twisted vine ring');
    expect(textWf.reference_image_urls).toEqual([]);
    expect(imageWf.prompt).toBeNull();
    expect(imageWf.reference_image_urls).toEqual(['/api/artifacts/aa11bb22cc33dd44ee55ff66aa11bb22cc33dd44ee55ff66aa11bb22cc33dd44']);
  });

  it('falls back to the legacy reference_images field name when present', async () => {
    mockAuthFetch.mockReturnValueOnce(okJson({ workflows: [
      {
        workflow_id: 'legacy',
        name: 'ring_cad_nurbs_v1',
        status: 'completed',
        source_type: 'image_to_cad',
        input: {
          reference_images: [{ uri: 'azure://x/hashed/bb11bb22cc33dd44ee55ff66aa11bb22cc33dd44ee55ff66aa11bb22cc33dd44' }],
        },
      },
    ] }));

    const [workflow] = await listMyWorkflows();
    expect(workflow.reference_image_urls).toEqual(['/api/artifacts/bb11bb22cc33dd44ee55ff66aa11bb22cc33dd44ee55ff66aa11bb22cc33dd44']);
  });

  it('treats an empty/whitespace-only user_description as no prompt', async () => {
    mockAuthFetch.mockReturnValueOnce(okJson({ workflows: [
      {
        workflow_id: 'blank',
        name: 'ring_cad_nurbs_v1',
        status: 'completed',
        source_type: 'text_to_cad',
        input: { user_description: '   ' },
      },
    ] }));

    const [workflow] = await listMyWorkflows();
    expect(workflow.prompt).toBeNull();
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
      threedm_url: null,
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
      threedm_url: null,
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
      threedm_url: null,
      azure_source: 'success_final',
    });
  });

  it('fetchCadResult reads the flat ring_cad_nurbs_v1 shape, including threedm_url', async () => {
    const threedmSha = 'a'.repeat(64);
    const glbSha = 'b'.repeat(64);
    mockAuthFetch.mockReturnValueOnce(okJson({
      threedm_artifact: { uri: `azure://container/${threedmSha}.3dm`, type: 'model/3dm', bytes: 10, sha256: threedmSha },
      glb_artifact: { uri: `azure://container/${glbSha}.glb`, type: 'model/gltf-binary', bytes: 20, sha256: glbSha },
    }));

    await expect(fetchCadResult('wf-nurbs')).resolves.toEqual({
      glb_url: `/api/artifacts/${glbSha}`,
      threedm_url: `/api/artifacts/${threedmSha}`,
      azure_source: 'threedm_artifact',
    });
  });

  it('fetchCadResult falls back to the legacy nested shape when the flat shape has no artifacts', async () => {
    mockAuthFetch.mockReturnValueOnce(okJson({
      success_final: [{ glb_artifact: { uri: 'gs://bucket/legacy.glb' } }],
    }));

    await expect(fetchCadResult('wf-legacy')).resolves.toEqual({
      glb_url: 'gs://bucket/legacy.glb',
      threedm_url: null,
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

describe('credit audit parsing', () => {
  it('sums the shipped array response shape', () => {
    expect(extractWorkflowCredits([{ cost: 40 }, { cost: 30 }])).toBe(70);
  });

  it('reads wrapped actual billing and numeric strings', () => {
    expect(extractWorkflowCredits({ data: { actual_user_billed: '70' } })).toBe(70);
  });

  it('preserves a legitimate zero-credit audit', () => {
    expect(extractWorkflowCredits([{ cost: 0 }])).toBe(0);
    expect(extractWorkflowCredits({ line_items: [] })).toBeNull();
  });
});

describe('inferSourceType', () => {
  it('identifies product_shot workflows', () => {
    expect(inferSourceType('product_shot_workflow')).toBe('product_shot');
    expect(inferSourceType('product-shot-v2')).toBe('product_shot');
    expect(inferSourceType('PRODUCT_SHOT')).toBe('product_shot');
  });

  it('identifies text_to_cad workflows', () => {
    expect(inferSourceType('ring_full_pipeline')).toBe('text_to_cad');
    expect(inferSourceType('ring_generate')).toBe('text_to_cad');
    expect(inferSourceType('text_to_cad')).toBe('text_to_cad');
    expect(inferSourceType('text-to-cad')).toBe('text_to_cad');
    expect(inferSourceType('ring-generate')).toBe('text_to_cad');
    expect(inferSourceType('ring_pipeline_v2')).toBe('text_to_cad');
    expect(inferSourceType('ring_generate_v3')).toBe('text_to_cad');
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

  it('text_to_cad takes priority over cad_render for ring pipelines', () => {
    expect(inferSourceType('ring_full_pipeline')).toBe('text_to_cad');
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
    expect(resolveSourceType('text_to_cad', '')).toBe('text_to_cad');
    expect(resolveSourceType('image_to_cad', '')).toBe('image_to_cad');
    expect(resolveSourceType('cad_text', '')).toBe('text_to_cad');
    expect(resolveSourceType('cad_sketch', '')).toBe('image_to_cad');
    expect(resolveSourceType('cad_render', '')).toBe('cad_render');
  });

  it('classifies ring_cad_nurbs_v1 as Image-to-3D, not a CAD render', () => {
    // The name contains "cad" but neither "sketch" nor "image", so without an
    // explicit rule it falls through to cad_render and lands in the wrong
    // history section.
    expect(inferSourceType('ring_cad_nurbs_v1')).toBe('image_to_cad');
    expect(resolveSourceType('', 'ring_cad_nurbs_v1')).toBe('image_to_cad');
    expect(resolveSourceType('unknown', 'ring_cad_nurbs_v1', 0)).toBe('text_to_cad');
    expect(resolveSourceType('unknown', 'ring_cad_nurbs_v1', 1)).toBe('image_to_cad');
    expect(resolveSourceType('cad_sketch', 'ring_cad_nurbs_v1', 0)).toBe('image_to_cad');
  });

  it('prefers the backend value over the workflow name', () => {
    // Name would parse to photo, but the backend says product -> backend wins.
    expect(resolveSourceType('product_shot', 'jewelry_photoshoot')).toBe('product_shot');
    // Consolidated base name that no longer encodes the fix family; backend disambiguates.
    expect(resolveSourceType('product_fix', 'fix')).toBe('product_shot');
  });

  it('classifies High Effort (higher_tier) by name even if the backend mislabels it', () => {
    // Backend label is wrong/unknown, but the higher_tier name is authoritative:
    // model high -> model-shot section, product high -> product-shot section.
    expect(resolveSourceType('product_shot', 'jewelry_photoshoots_generator_higher_tier')).toBe('photo');
    expect(resolveSourceType('unknown', 'fix_model_shot_higher_tier')).toBe('photo');
    expect(resolveSourceType('model_shot', 'Product_shot_pipeline_higher_tier')).toBe('product_shot');
    expect(resolveSourceType('cad_text', 'fix_product_shot_higher_tier_4k')).toBe('product_shot');
  });

  it('falls back to name parsing when the field is absent', () => {
    expect(resolveSourceType(undefined, 'jewelry_photoshoots_generator')).toBe('photo');
    expect(resolveSourceType(null, 'Product_shot_pipeline')).toBe('product_shot');
    expect(resolveSourceType(undefined, 'ring_full_pipeline')).toBe('text_to_cad');
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

describe('extractWorkflowCredits on the real CAD audit payload', () => {
  // Captured from GET /credits/audit on staging, 2026-08-20.
  const cadAudit = {
    summary: {
      id: 'state-cea7d1956b5a4bbd9348fee3d956ef03',
      name: 'ring_cad_nurbs_v1',
      status: 'completed',
      financials: {
        credit_hold_amount: 60,
        authorized_budget: 60,
        released_credits_so_far: 60,
        actual_user_billed: 60,
        internal_provider_cost: 0,
        profit_margin: 60,
      },
      policy: { policy_key: 'ring_cad_tiered_v2' },
    },
    line_items: Array.from({ length: 20 }, (_, i) => ({ tool: `tool_${i}`, cost: 0 })),
  };

  it('reads the charge from summary.financials, not the zeroed line items', () => {
    expect(extractWorkflowCredits(cadAudit)).toBe(60);
  });

  it('refuses to report zero from a breakdown where every step is zero', () => {
    // Without this guard a shape change would silently bring back "0 credits used".
    expect(extractWorkflowCredits({ line_items: cadAudit.line_items })).toBeNull();
  });

  it('still sums a breakdown that carries real per-step costs', () => {
    expect(extractWorkflowCredits({ line_items: [{ cost: 8 }, { cost: 2 }] })).toBe(10);
  });
});
