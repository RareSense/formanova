import { describe, expect, it } from 'vitest';

import {
  designRunIdFromArtifact,
  isDefaultPrompt,
  startedFromDoodle,
  traceDesignHistory,
  type DesignRunDetail,
} from './admin-design-history';

const ID_A = 'state-58b0f59e71544d5bbb32edba842c75e1';
const ID_B = 'state-1e30dc5556db47eea8b3e3f8008fb9f2';
const ID_C = 'state-4b26f1788e174d759adbafb11e264fad';

const made = (id: string) => ({
  uri: `azure://agentic-artifacts/nova3d-toolkit/image-generator/design_image_same_camera_render/formanova_cad_design_image_staging_${id}_desig-6301f6fdb6b44267/image_00.jpg`,
  type: 'image/jpeg',
});
const uploaded = (sha: string) => ({ uri: `azure://agentic-artifacts/hashed/${sha}`, type: 'image/png' });

function runs(map: Record<string, unknown>) {
  const asked: string[] = [];
  const fetchRun = async (id: string): Promise<DesignRunDetail> => {
    asked.push(id);
    if (!(id in map)) throw new Error('404');
    return { workflow_id: id, workflow_name: 'design_image_v1', created_at: null, input_payload: map[id] };
  };
  return { fetchRun, asked };
}

describe('designRunIdFromArtifact', () => {
  it('reads the run id from a design picture path', () => {
    expect(designRunIdFromArtifact(made(ID_A))).toBe(ID_A);
    expect(designRunIdFromArtifact(made(ID_A).uri)).toBe(ID_A);
  });

  it('is null for uploads and other pictures', () => {
    expect(designRunIdFromArtifact(uploaded('1db9'))).toBeNull();
    expect(designRunIdFromArtifact({ uri: 'https://x/api/artifacts/abc' })).toBeNull();
    expect(designRunIdFromArtifact(null)).toBeNull();
  });
});

describe('isDefaultPrompt', () => {
  it('spots the words we send when the customer wrote nothing', () => {
    expect(isDefaultPrompt('Turn this drawing into a realistic ring design.')).toBe(true);
    expect(isDefaultPrompt('Design a ring inspired by this picture.')).toBe(true);
    expect(isDefaultPrompt('the circles are stones')).toBe(false);
    expect(isDefaultPrompt('')).toBe(false);
  });
});

describe('traceDesignHistory', () => {
  it('finds the doodle behind a CAD run (staging state-95b9c667 shape)', async () => {
    const { fetchRun } = runs({
      [ID_A]: {
        images: [{ role: 'drawing', artifact: uploaded('1db99849') }],
        output: 'render',
        prompt: 'Turn this drawing into a realistic ring design.',
        jewelry_type: 'ring',
      },
    });
    const history = await traceDesignHistory(made(ID_A), fetchRun);
    expect(history?.brokenAtMarkup).toBe(false);
    expect(history?.steps).toHaveLength(1);
    const [step] = history!.steps;
    expect(step.kind).toBe('doodle');
    expect(step.text).toBeNull();
    expect(step.defaultText).toBe('Turn this drawing into a realistic ring design.');
    expect(step.images).toEqual([{ url: 'azure://agentic-artifacts/hashed/1db99849', label: 'Doodle' }]);
    expect(step.outputUrl).toBe(made(ID_A).uri);
    expect(startedFromDoodle(history)).toBe(true);
  });

  it('keeps what the customer wrote about the drawing, and the edits after it, earliest first', async () => {
    const { fetchRun } = runs({
      [ID_B]: { images: [{ role: 'base', artifact: made(ID_C) }], prompt: 'simplify spider' },
      [ID_C]: { images: [{ role: 'drawing', artifact: uploaded('aa') }], prompt: 'the circles are stones' },
    });
    const history = await traceDesignHistory(made(ID_B), fetchRun);
    expect(history?.steps.map((s) => [s.workflowId, s.kind, s.text])).toEqual([
      [ID_C, 'doodle', 'the circles are stones'],
      [ID_B, 'edit', 'simplify spider'],
    ]);
    // Each step's output is the picture the next one used.
    expect(history?.steps[0].outputUrl).toBe(made(ID_C).uri);
    expect(history?.steps[1].outputUrl).toBe(made(ID_B).uri);
  });

  it('stops at a marked-up design and says the earlier steps are not linked', async () => {
    const { fetchRun } = runs({
      [ID_A]: { images: [{ role: 'markup', artifact: uploaded('0c22') }], prompt: 'remove this hole' },
    });
    const history = await traceDesignHistory(made(ID_A), fetchRun);
    expect(history?.brokenAtMarkup).toBe(true);
    expect(history?.steps[0]).toMatchObject({
      kind: 'annotated_edit',
      text: 'remove this hole',
      images: [{ url: 'azure://agentic-artifacts/hashed/0c22', label: 'Design with annotations' }],
    });
  });

  it('is null for a CAD built from an uploaded photo', async () => {
    const { fetchRun, asked } = runs({});
    expect(await traceDesignHistory(uploaded('ff'), fetchRun)).toBeNull();
    expect(asked).toEqual([]);
  });

  it('survives a missing run and a loop', async () => {
    const missing = runs({});
    expect(await traceDesignHistory(made(ID_A), missing.fetchRun)).toBeNull();

    const loop = runs({
      [ID_A]: { images: [{ role: 'base', artifact: made(ID_B) }], prompt: 'a' },
      [ID_B]: { images: [{ role: 'base', artifact: made(ID_A) }], prompt: 'b' },
    });
    const history = await traceDesignHistory(made(ID_A), loop.fetchRun);
    expect(history?.steps).toHaveLength(2);
    expect(loop.asked).toEqual([ID_A, ID_B]);
  });

  it('labels an angle run', async () => {
    const { fetchRun } = runs({
      [ID_A]: { images: [{ role: 'base', artifact: uploaded('x') }], prompt: '', view: 'Back' },
    });
    const history = await traceDesignHistory(made(ID_A), fetchRun);
    expect(history?.steps[0]).toMatchObject({ kind: 'angle', view: 'Back' });
  });
});
