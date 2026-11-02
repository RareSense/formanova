import { describe, expect, it } from 'vitest';

import { cadModelView } from './cad-model';
import { cadImproveRun, proxy } from './__fixtures__/runs';

describe('cadModelView', () => {
  it('inputs: the improve lineage (parent, root, set)', () => {
    const view = cadModelView(cadImproveRun());
    expect(view.family).toBe('cad_model');
    expect(view.inputs.fields).toEqual([
      { label: 'Improved from (parent asset)', value: '33333333-3333-4333-8333-333333333333' },
      { label: 'Root asset', value: '22222222-2222-4222-8222-222222222222' },
      { label: 'Version set', value: '11111111-1111-4111-8111-111111111111' },
    ]);
  });

  it('outputs: every file from the step outputs as a link, mass and validation', () => {
    const view = cadModelView(cadImproveRun());
    expect(view.outputs.files.map((f) => [f.label, f.url])).toEqual([
      ['3DM', proxy(61)],
      ['GLB', proxy(62)],
      ['STL', proxy(63)],
      ['STEP', proxy(64)],
      ['Casting STL', proxy(65)],
      ['Spec sheet', proxy(66)],
    ]);
    expect(view.outputs.fields).toEqual([
      { label: 'Estimated metal mass', value: '4.82 g' },
      { label: 'Validation', value: 'applied' },
    ]);
  });

  it('a generate run has no lineage, and files from failed steps are not offered', () => {
    const run = cadImproveRun();
    run.workflow_name = 'jewelry_cad_generate';
    run.input_payload = { payload: { jewelry_type: 'ring' } };
    run.steps[2].output = { error: 'publish failed' };
    const view = cadModelView(run);
    expect(view.inputs.fields).toEqual([]);
    expect(view.outputs.files).toEqual([]);
    expect(view.outputs.fields).toEqual([]);
    expect(view.steps.map((s) => s.failed)).toEqual([true, false, true]);
  });
});
