import { describe, expect, it } from 'vitest';
import {
  buildRingCadStartBody,
  isRingCadSuccess,
  parseRingCadFailure,
  parseRingCadResult,
  ringCadProgressFraction,
  isRingCadRepairing,
  MAX_RING_CAD_REFERENCE_IMAGES,
  RING_CAD_DEFAULT_TIER,
  RING_CAD_TIERS,
  RING_CAD_TOTAL_NODES,
} from './ring-cad-nurbs-api';

const IMG = (n: number) => `data:image/jpeg;base64,IMG${n}`;

describe('ring_cad_nurbs_v1 start body', () => {
  it('text-only mode sends count 0 and the description, with no artifact fields', () => {
    const { payload } = buildRingCadStartBody({
      referenceImages: [],
      userDescription: '  solitaire, knife-edge band  ',
    });
    expect(payload.reference_image_count).toBe(0);
    expect(payload.user_description).toBe('solitaire, knife-edge band');
    expect(payload).not.toHaveProperty('image_artifact');
    expect(payload).not.toHaveProperty('reference_image_artifacts');
  });

  it('single-image mode sends the same picture in BOTH slots', () => {
    const { payload } = buildRingCadStartBody({ referenceImages: [IMG(1)] });
    expect(payload.reference_image_count).toBe(1);
    expect(payload.image_artifact).toBe(IMG(1));
    expect(payload.reference_image_artifacts).toEqual([IMG(1)]);
  });

  it('multi-image mode omits image_artifact entirely', () => {
    const { payload } = buildRingCadStartBody({ referenceImages: [IMG(1), IMG(2), IMG(3)] });
    expect(payload.reference_image_count).toBe(3);
    expect(payload).not.toHaveProperty('image_artifact');
    expect(payload.reference_image_artifacts).toEqual([IMG(1), IMG(2), IMG(3)]);
  });

  it('preserves image order, because IMAGE 1 wins every conflict', () => {
    const imgs = [IMG(1), IMG(2), IMG(3), IMG(4), IMG(5)];
    const { payload } = buildRingCadStartBody({ referenceImages: imgs });
    expect(payload.reference_image_artifacts).toEqual(imgs);
    expect(payload.reference_image_count).toBe(MAX_RING_CAD_REFERENCE_IMAGES);
  });

  it('reference_image_count always matches the images actually sent', () => {
    for (let n = 1; n <= MAX_RING_CAD_REFERENCE_IMAGES; n++) {
      const imgs = Array.from({ length: n }, (_, i) => IMG(i));
      const { payload } = buildRingCadStartBody({ referenceImages: imgs });
      expect(payload.reference_image_count).toBe(n);
      expect(payload.reference_image_artifacts).toHaveLength(n);
    }
  });

  it('keeps the description when images are supplied (text is optional, not ignored)', () => {
    const { payload } = buildRingCadStartBody({
      referenceImages: [IMG(1)],
      userDescription: 'tighter halo',
    });
    expect(payload.user_description).toBe('tighter halo');
  });

  it('omits user_description when it is blank rather than sending an empty string', () => {
    const { payload } = buildRingCadStartBody({ referenceImages: [IMG(1)], userDescription: '   ' });
    expect(payload).not.toHaveProperty('user_description');
  });

  it('rejects text-only with no description, since there is nothing to work from', () => {
    expect(() => buildRingCadStartBody({ referenceImages: [] })).toThrow(/describe your ring/i);
  });

  it('rejects more than five images rather than letting the backend drop them', () => {
    const imgs = Array.from({ length: 6 }, (_, i) => IMG(i));
    expect(() => buildRingCadStartBody({ referenceImages: imgs })).toThrow(/at most 5/i);
  });

  it('sends llm_tier and never llm_model, which would bypass tier routing', () => {
    const { payload } = buildRingCadStartBody({
      referenceImages: [IMG(1)],
      tier: RING_CAD_TIERS.FABLE_5,
    });
    expect(payload.llm_tier).toBe(RING_CAD_TIERS.FABLE_5);
    expect(payload).not.toHaveProperty('llm_model');
  });

  it('defaults to the fixed Opus 5 tier', () => {
    const { payload } = buildRingCadStartBody({ referenceImages: [IMG(1)] });
    expect(payload.llm_tier).toBe(RING_CAD_DEFAULT_TIER);
    expect(RING_CAD_DEFAULT_TIER).toBe(RING_CAD_TIERS.OPUS_5);
  });

  it('sends the fixed tier, which selects the model rather than the price', () => {
    const { payload } = buildRingCadStartBody({ referenceImages: [IMG(1)] });
    expect(payload.llm_tier).toBe(RING_CAD_DEFAULT_TIER);
  });

  it('never sends credentials in the payload, which is persisted and readable', () => {
    const { payload } = buildRingCadStartBody({ referenceImages: [IMG(1)] });
    expect(payload).not.toHaveProperty('llm_api_key');
    expect(payload).not.toHaveProperty('variant_api_key');
  });

  it('does not send return_nodes, which this workflow does not accept', () => {
    const body = buildRingCadStartBody({ referenceImages: [IMG(1)] });
    expect(body).not.toHaveProperty('return_nodes');
    expect(Object.keys(body)).toEqual(['payload']);
  });

  it('copies the image array so later caller mutation cannot change what was sent', () => {
    const imgs = [IMG(1)];
    const { payload } = buildRingCadStartBody({ referenceImages: imgs });
    imgs.push(IMG(2));
    expect(payload.reference_image_artifacts).toEqual([IMG(1)]);
    expect(payload.reference_image_count).toBe(1);
  });

  it('always sends validation_screenshot_count 12 and cad_run_mode execute_and_export (rev 13)', () => {
    for (const imgs of [[], [IMG(1)], [IMG(1), IMG(2)]] as const) {
      const { payload } = buildRingCadStartBody({
        referenceImages: [...imgs],
        userDescription: imgs.length === 0 ? 'plain band' : undefined,
      });
      expect(payload.validation_screenshot_count).toBe(12);
      expect(payload.cad_run_mode).toBe('execute_and_export');
    }
  });
});

// No pricing tests here on purpose. Price is backend's, read from
// /credits/estimate for display and from the credit audit for what was
// charged. Asserting a number here would only pin a stale one.

describe('ring_cad_nurbs_v1 result parsing', () => {
  const RESULT = {
    ok: true,
    status: 'completed',
    validation_status: 'applied',
    threedm_artifact: { uri: 'azure://a/ring.3dm', type: 'model/3dm', bytes: 12, sha256: 'x' },
    glb_artifact: { uri: 'azure://a/ring.glb', type: 'model/gltf-binary', bytes: 34, sha256: 'y' },
    cad_diagnostics: { part_count: 4, not_all_solid: false },
  };

  it('reads the flat artifact fields', () => {
    const r = parseRingCadResult(RESULT);
    expect(r.threedmArtifact?.uri).toBe('azure://a/ring.3dm');
    expect(r.glbArtifact?.uri).toBe('azure://a/ring.glb');
    expect(r.validationStatus).toBe('applied');
  });

  it('exposes the signed url as glbUrl for the viewport', () => {
    const r = parseRingCadResult({
      ...RESULT,
      glb_artifact: { uri: 'azure://a/ring.glb', url: 'https://signed.example/ring.glb', type: '', bytes: 1, sha256: '' },
    });
    expect(r.glbUrl).toBe('https://signed.example/ring.glb');
  });

  it('treats all three validation statuses as success', () => {
    for (const status of ['applied', 'not_applied', 'errored'] as const) {
      expect(isRingCadSuccess({ ...RESULT, validation_status: status })).toBe(true);
      expect(parseRingCadResult({ ...RESULT, validation_status: status }).validationStatus).toBe(status);
    }
  });

  it('surfaces not_all_solid without treating it as a failure', () => {
    const r = parseRingCadResult({ ...RESULT, cad_diagnostics: { not_all_solid: true } });
    expect(r.notAllSolid).toBe(true);
    expect(r.threedmArtifact).not.toBeNull();
  });

  it('throws when neither model artifact is present', () => {
    expect(() => parseRingCadResult({ ok: true, status: 'completed' })).toThrow(/no cad model/i);
  });

  it('prefers the backend signed url over the raw azure uri', () => {
    const r = parseRingCadResult({
      ...RESULT,
      threedm_artifact: { uri: 'azure://c/ring.3dm', url: 'https://signed.example/ring.3dm', type: '', bytes: 1, sha256: '' },
    });
    expect(r.threedmArtifact?.url).toBe('https://signed.example/ring.3dm');
  });

  it('still reports the artifact when the reference cannot be resolved to a url', () => {
    // The run produced a ring, so claiming there is no model would be wrong.
    // Callers check .url before fetching.
    const r = parseRingCadResult(RESULT);
    expect(r.threedmArtifact).not.toBeNull();
    expect(r.threedmArtifact?.uri).toBe('azure://a/ring.3dm');
  });

  it('never leaves an azure:// uri as the fetchable url', () => {
    const sha = 'a'.repeat(64);
    const r = parseRingCadResult({
      ...RESULT,
      threedm_artifact: { uri: `azure://agentic-artifacts/hashed/${sha}.3dm`, type: '', bytes: 1, sha256: sha },
      glb_artifact: { uri: `azure://agentic-artifacts/hashed/${sha}.glb`, type: '', bytes: 1, sha256: sha },
    });
    expect(r.threedmArtifact?.url.startsWith('azure://')).toBe(false);
    expect(r.glbUrl?.startsWith('azure://')).toBe(false);
    // Content-addressed artifacts resolve to the same-origin auth-gated proxy.
    expect(r.threedmArtifact?.url).toContain(`/api/artifacts/${sha}`);
  });

  it('collapses a cross-origin content-addressed backend url to the same-origin proxy', () => {
    // Real backend shape: url is the backend's own host, not a signed blob URL,
    // and the browser can't fetch it cross-origin without credentials.
    const sha = 'b'.repeat(64);
    const r = parseRingCadResult({
      ...RESULT,
      glb_artifact: {
        uri: `azure://agentic-artifacts/hashed/${sha}`,
        url: `https://staging-gsdgds12.formanova.ai/api/artifacts/${sha}`,
        type: 'model/gltf-binary',
        bytes: 1,
        sha256: sha,
      },
    });
    expect(r.glbUrl).toBe(`/api/artifacts/${sha}`);
  });

  it('falls back to the pre-validation stage when the corrected model is missing', () => {
    const { threedm_artifact, glb_artifact, ...withoutFinal } = RESULT;
    const r = parseRingCadResult({
      ...withoutFinal,
      prevalidation_threedm_artifact: { uri: 'azure://a/pre.3dm', url: 'https://s/pre.3dm', type: '', bytes: 1, sha256: '' },
      prevalidation_glb_artifact: { uri: 'azure://a/pre.glb', url: 'https://s/pre.glb', type: '', bytes: 1, sha256: '' },
    });
    expect(r.threedmArtifact?.url).toBe('https://s/pre.3dm');
    expect(r.glbUrl).toBe('https://s/pre.glb');
    expect(r.usedFallbackStage).toBe(true);
    expect(r.sourceStage).toBe('prevalidation_threedm_artifact');
  });

  it('prefers the corrected model over the pre-validation one', () => {
    const r = parseRingCadResult({
      ...RESULT,
      prevalidation_threedm_artifact: { uri: 'azure://a/pre.3dm', url: 'https://s/pre.3dm', type: '', bytes: 1, sha256: '' },
    });
    expect(r.sourceStage).toBe('threedm_artifact');
    expect(r.usedFallbackStage).toBe(false);
  });

  it('recovers a model from an unrecognised stage rather than showing nothing', () => {
    const r = parseRingCadResult({
      ok: true,
      status: 'completed',
      some_future_threedm_artifact: { uri: 'azure://a/x.3dm', url: 'https://s/x.3dm', type: '', bytes: 1, sha256: '' },
    });
    expect(r.threedmArtifact?.url).toBe('https://s/x.3dm');
    expect(r.usedFallbackStage).toBe(true);
  });

  it('does not report success for a failed run', () => {
    expect(isRingCadSuccess({ ok: false, status: 'failed', phase: 'fail_cad' })).toBe(false);
  });

  it('recovers a model from a sink-node-keyed response (no return_nodes sent)', () => {
    // Observed shape when the start request omits return_nodes: the backend
    // keys the response by sink node id instead of returning the flat shape.
    const r = parseRingCadResult({
      validation_run_cad: [
        {
          ok: true,
          tool: 'cad_runner',
          glb_artifact: { uri: 'azure://a/ring.glb', url: 'https://s/ring.glb', type: '', bytes: 1, sha256: '' },
          threedm_artifact: { uri: 'azure://a/ring.3dm', url: 'https://s/ring.3dm', type: '', bytes: 1, sha256: '' },
          diagnostics: { part_count: 50, not_all_solid: false },
        },
      ],
      output_asset_id: null,
    });
    expect(r.threedmArtifact?.url).toBe('https://s/ring.3dm');
    expect(r.glbUrl).toBe('https://s/ring.glb');
    expect(r.usedFallbackStage).toBe(true);
    expect(r.diagnostics.part_count).toBe(50);
    expect(r.notAllSolid).toBe(false);
  });

  it('prefers the flat top-level shape over a nested one when both exist', () => {
    const r = parseRingCadResult({
      ...RESULT,
      validation_run_cad: [
        {
          glb_artifact: { uri: 'azure://a/nested.glb', url: 'https://s/nested.glb', type: '', bytes: 1, sha256: '' },
        },
      ],
    });
    // Top-level glb_artifact (from RESULT) wins, not the nested sink-node one.
    expect(r.glbUrl).not.toBe('https://s/nested.glb');
    expect(r.usedFallbackStage).toBe(false);
    expect(r.sourceStage).toBe('threedm_artifact');
  });

  it.each([
    ['final_validated', 'applied'],
    ['final_prevalidation', 'not_applied'],
    ['final_validation_errored', 'errored'],
  ] as const)('unwraps the confirmed %s sink envelope and derives validation_status %s', (sinkKey, expectedStatus) => {
    const r = parseRingCadResult({
      [sinkKey]: [
        {
          ok: true,
          glb_artifact: { uri: 'azure://a/ring.glb', url: 'https://s/ring.glb', type: '', bytes: 1, sha256: '' },
          threedm_artifact: { uri: 'azure://a/ring.3dm', url: 'https://s/ring.3dm', type: '', bytes: 1, sha256: '' },
          screenshots: ['s1.png', 's2.png'],
          cad_diagnostics: { part_count: 12, not_all_solid: false },
        },
      ],
      output_asset_id: null,
      source_type: 'ring_cad_nurbs_v1',
    });
    expect(r.glbUrl).toBe('https://s/ring.glb');
    expect(r.threedmArtifact?.url).toBe('https://s/ring.3dm');
    expect(r.validationStatus).toBe(expectedStatus);
    expect(r.diagnostics.part_count).toBe(12);
  });
});

describe('ring_cad_nurbs_v1 failure parsing', () => {
  it('surfaces the backend user_message and marks fail_cad retryable', () => {
    const f = parseRingCadFailure({
      ok: false,
      status: 'failed',
      phase: 'fail_cad',
      error_category: 'build',
      failure_origin: 'run_cad',
      user_message: 'The ring could not be built. Please try again.',
    });
    expect(f.userMessage).toBe('The ring could not be built. Please try again.');
    expect(f.phase).toBe('fail_cad');
    expect(f.retryable).toBe(true);
  });

  it('does not mark other phases retryable', () => {
    expect(parseRingCadFailure({ phase: 'fail_phase2' }).retryable).toBe(false);
    expect(parseRingCadFailure({ phase: 'fail_phase3' }).retryable).toBe(false);
    expect(parseRingCadFailure({ phase: 'fail_modules' }).retryable).toBe(false);
    expect(parseRingCadFailure({ phase: 'fail_validation_capture' }).retryable).toBe(false);
    expect(parseRingCadFailure({}).retryable).toBe(false);
  });
});

describe('ring_cad_nurbs_v1 progress', () => {
  it('measures distinct nodes entered against the total (pre-rev-13 node_visit_seq shape)', () => {
    expect(ringCadProgressFraction({ node_visit_seq: {} })).toBe(0);
    expect(ringCadProgressFraction({ node_visit_seq: { a: 1, b: 1 } })).toBeCloseTo(2 / RING_CAD_TOTAL_NODES);
  });

  it('does not count repeat visits as extra progress, and never exceeds 1', () => {
    const many = Object.fromEntries(
      Array.from({ length: RING_CAD_TOTAL_NODES + 10 }, (_, i) => [`n${i}`, 3]),
    );
    expect(ringCadProgressFraction({ node_visit_seq: many })).toBe(1);
  });

  it('detects a repair from a second run_cad visit (pre-rev-13 node_visit_seq shape)', () => {
    expect(isRingCadRepairing({ node_visit_seq: { run_cad: 1 } })).toBe(false);
    expect(isRingCadRepairing({ node_visit_seq: { run_cad: 2 } })).toBe(true);
    expect(isRingCadRepairing({})).toBe(false);
  });

  it('rev 13: prefers runtime.total_visits when present', () => {
    expect(ringCadProgressFraction({ runtime: { state: 'running', total_visits: 0 } })).toBe(0);
    expect(ringCadProgressFraction({ runtime: { state: 'running', total_visits: 14 } }))
      .toBeCloseTo(14 / RING_CAD_TOTAL_NODES);
    expect(ringCadProgressFraction({ runtime: { state: 'running', total_visits: 999 } })).toBe(1);
  });

  it('rev 13: falls back to node_visits (per-node visit-record map) when runtime.total_visits is absent', () => {
    expect(ringCadProgressFraction({
      node_visits: { geometry_analysis_llm: [{ visit_seq: 1, status: 'completed' }] },
    })).toBeCloseTo(1 / RING_CAD_TOTAL_NODES);
    expect(ringCadProgressFraction({
      node_visits: {
        geometry_analysis_llm: [{ visit_seq: 1, status: 'completed' }],
        run_cad: [{ visit_seq: 1, status: 'completed' }],
      },
    })).toBeCloseTo(2 / RING_CAD_TOTAL_NODES);
  });

  it('rev 13: detects a repair from a second run_cad entry in node_visits', () => {
    expect(isRingCadRepairing({ node_visits: { run_cad: [{ visit_seq: 1, status: 'completed' }] } })).toBe(false);
    expect(isRingCadRepairing({
      node_visits: {
        run_cad: [{ visit_seq: 1, status: 'completed' }, { visit_seq: 2, status: 'completed' }],
      },
    })).toBe(true);
    expect(isRingCadRepairing({ node_visits: {} })).toBe(false);
  });
});
