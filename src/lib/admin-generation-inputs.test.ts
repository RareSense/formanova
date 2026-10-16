import { describe, expect, it } from 'vitest';

import { cadFlowLabel, inputImageUrl, readCadStudioInputs } from './admin-generation-inputs';

const art = (sha: string) => ({ uri: `https://api.formanova.ai/api/artifacts/${sha}`, sha256: sha });

describe('readCadStudioInputs: design_image_v1', () => {
  it('shows every picture with its role, the prompt and the details', () => {
    const inputs = readCadStudioInputs('design_image_v1', {
      payload: {
        prompt: 'Make the band thinner',
        images: [
          { role: 'markup', artifact: art('a1') },
          { role: 'reference', artifact: art('b1') },
          { role: 'reference', artifact: { uri: 'data:image/png;base64,AAA' } },
        ],
        output: 'render',
        view: 'top',
        jewelry_type: 'ring',
        dimensions: 'size 7',
      },
    }, false);

    expect(inputs?.prompt).toBe('Make the band thinner');
    expect(inputs?.images).toEqual([
      { url: 'https://api.formanova.ai/api/artifacts/a1', label: 'Design with annotations' },
      { url: 'https://api.formanova.ai/api/artifacts/b1', label: 'Inspiration / reference 1' },
      { url: 'data:image/png;base64,AAA', label: 'Inspiration / reference 2' },
    ]);
    expect(inputs?.details).toEqual([
      { label: 'Category', value: 'ring' },
      { label: 'Angle', value: 'top' },
      { label: 'Dimensions', value: 'size 7' },
      { label: 'Output', value: 'render' },
    ]);
  });

  it('labels a doodle and reads a flat payload', () => {
    const inputs = readCadStudioInputs('design_image_v1', {
      prompt: 'a realistic pendant',
      images: [{ role: 'drawing', artifact: 'data:image/png;base64,DDD' }],
    }, false);
    expect(inputs?.images).toEqual([{ url: 'data:image/png;base64,DDD', label: 'Doodle' }]);
  });

  it('shows a prompt-only design run with no pictures', () => {
    const inputs = readCadStudioInputs('design_image_v1', { payload: { prompt: 'skull pendant', images: [] } }, false);
    expect(inputs).toEqual({ prompt: 'skull pendant', images: [], details: [] });
  });
});

describe('readCadStudioInputs: CAD runs', () => {
  it('keeps artifacts that have no mime type and names the flow', () => {
    const inputs = readCadStudioInputs('ring_cad_nurbs_v1', {
      payload: {
        client_flow: 'inspiration',
        jewelry_type: 'pendant',
        user_description: 'seashell motif',
        image_artifact: art('c1'),
        reference_image_artifacts: [art('c1')],
      },
    }, true);
    expect(inputs?.prompt).toBe('seashell motif');
    expect(inputs?.images).toEqual([{ url: 'https://api.formanova.ai/api/artifacts/c1', label: 'Approved design' }]);
    expect(inputs?.details).toContainEqual({ label: 'Flow', value: 'CAD from Inspiration' });
  });

  it('labels customer photos for CAD from Image', () => {
    const inputs = readCadStudioInputs('ring_cad_nurbs_v1', {
      payload: { client_flow: 'image', reference_image_artifacts: [art('d1'), art('d2')] },
    }, true);
    expect(inputs?.images.map((i) => i.label)).toEqual(['Uploaded photo 1', 'Uploaded photo 2']);
  });

  it('leaves other workflows alone', () => {
    expect(readCadStudioInputs('jewelry_photoshoots_generator', { payload: { prompt: 'x' } }, false)).toBeNull();
  });
});

describe('helpers', () => {
  it('rejects non-image strings', () => {
    expect(inputImageUrl('ring')).toBeNull();
    expect(inputImageUrl({ uri: 'azure://c/hashed/abc' })).toBe('azure://c/hashed/abc');
  });

  it('maps client_flow to a label', () => {
    expect(cadFlowLabel({ payload: { client_flow: 'idea' } })).toBe('CAD from Idea');
    expect(cadFlowLabel({})).toBeNull();
  });
});
