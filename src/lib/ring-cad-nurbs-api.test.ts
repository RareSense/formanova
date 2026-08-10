import { describe, expect, it } from 'vitest';
import {
  buildRingCadStartBody,
  isRingCadSuccess,
  parseRingCadFailure,
  parseRingCadResult,
  resolveRingCadCredits,
  ringCadProgressFraction,
  isRingCadRepairing,
  MAX_RING_CAD_REFERENCE_IMAGES,
  RING_CAD_DEFAULT_TIER,
  RING_CAD_GENERATION_CREDITS,
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

  it('defaults to the fixed Fable 5 tier', () => {
    const { payload } = buildRingCadStartBody({ referenceImages: [IMG(1)] });
    expect(payload.llm_tier).toBe(RING_CAD_DEFAULT_TIER);
    expect(RING_CAD_DEFAULT_TIER).toBe(RING_CAD_TIERS.FABLE_5);
  });

  it('prices the fixed tier at 100 credits', () => {
    expect(RING_CAD_GENERATION_CREDITS).toBe(100);
    expect(resolveRingCadCredits(RING_CAD_DEFAULT_TIER)).toBe(100);
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
});

describe('ring_cad_nurbs_v1 pricing', () => {
  it('prices the listed tiers', () => {
    expect(resolveRingCadCredits(RING_CAD_TIERS.OPUS_5)).toBe(70);
    expect(resolveRingCadCredits(RING_CAD_TIERS.GPT_5_6_SOL)).toBe(70);
    expect(resolveRingCadCredits(RING_CAD_TIERS.FABLE_5)).toBe(100);
  });

  it('bills unlisted or missing tiers at the top rate, not free', () => {
    expect(resolveRingCadCredits('claude_sonnet_5_openrouter')).toBe(100);
    expect(resolveRingCadCredits(null)).toBe(100);
    expect(resolveRingCadCredits(undefined)).toBe(100);
  });
});

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
    expect(r.glbUrl).toBe('azure://a/ring.glb');
    expect(r.validationStatus).toBe('applied');
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

  it('does not report success for a failed run', () => {
    expect(isRingCadSuccess({ ok: false, status: 'failed', phase: 'cad_export' })).toBe(false);
  });
});

describe('ring_cad_nurbs_v1 failure parsing', () => {
  it('surfaces the backend user_message and marks cad_export retryable', () => {
    const f = parseRingCadFailure({
      ok: false,
      status: 'failed',
      phase: 'cad_export',
      error_category: 'build',
      failure_origin: 'run_cad',
      user_message: 'The ring could not be built. Please try again.',
    });
    expect(f.userMessage).toBe('The ring could not be built. Please try again.');
    expect(f.phase).toBe('cad_export');
    expect(f.retryable).toBe(true);
  });

  it('does not mark other phases retryable', () => {
    expect(parseRingCadFailure({ phase: 'module_prompts' }).retryable).toBe(false);
    expect(parseRingCadFailure({}).retryable).toBe(false);
  });
});

describe('ring_cad_nurbs_v1 progress', () => {
  it('measures distinct nodes entered against the total', () => {
    expect(ringCadProgressFraction({ node_visit_seq: {} })).toBe(0);
    expect(ringCadProgressFraction({ node_visit_seq: { a: 1, b: 1 } })).toBeCloseTo(2 / RING_CAD_TOTAL_NODES);
  });

  it('does not count repeat visits as extra progress, and never exceeds 1', () => {
    const many = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`n${i}`, 3]));
    expect(ringCadProgressFraction({ node_visit_seq: many })).toBe(1);
  });

  it('detects a repair from a second run_cad visit', () => {
    expect(isRingCadRepairing({ node_visit_seq: { run_cad: 1 } })).toBe(false);
    expect(isRingCadRepairing({ node_visit_seq: { run_cad: 2 } })).toBe(true);
    expect(isRingCadRepairing({})).toBe(false);
  });
});
