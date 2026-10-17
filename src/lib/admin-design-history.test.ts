import { describe, expect, it } from 'vitest';

import {
  artifactSha,
  designRunIdFromArtifact,
  isDefaultPrompt,
  mayHaveDesignHistory,
  startedFromDoodle,
  traceDesignHistory,
  type DesignRunDetail,
} from './admin-design-history';

const ID_A = 'state-58b0f59e71544d5bbb32edba842c75e1';
const ID_B = 'state-1e30dc5556db47eea8b3e3f8008fb9f2';
const ID_C = 'state-4b26f1788e174d759adbafb11e264fad';
const ID_X = 'state-ac9cff12c20e4f00b9fc9f6c806a62e2';

const sha = (c: string) => c.repeat(64).slice(0, 64);
// What the admin API hands back: the proxy url and the sha256.
const proxied = (c: string) => ({ uri: `https://staging.example/api/artifacts/${sha(c)}`, type: 'image/jpeg', sha256: sha(c) });
// The raw stored path of a design picture.
const made = (id: string) => ({
  uri: `azure://agentic-artifacts/nova3d-toolkit/image-generator/design_image_same_camera_render/formanova_cad_design_image_staging_${id}_desig-6301f6fdb6b44267/image_00.jpg`,
  type: 'image/jpeg',
});

interface FakeRun { created_at: string; input_payload: unknown; output?: unknown }

function sources(map: Record<string, FakeRun>, { listFails = false } = {}) {
  const asked: string[] = [];
  return {
    asked,
    fetchRun: async (id: string): Promise<DesignRunDetail> => {
      asked.push(id);
      const run = map[id];
      if (!run) throw new Error('404');
      return {
        workflow_id: id,
        workflow_name: 'design_image_v1',
        created_at: run.created_at,
        input_payload: run.input_payload,
        steps: [{ output: { result: { image_artifact: run.output ?? null } } }],
      };
    },
    listRuns: async () => {
      if (listFails) throw new Error('500');
      return Object.entries(map).map(([workflow_id, r]) => ({ workflow_id, created_at: r.created_at }));
    },
  };
}

describe('picture links', () => {
  it('reads the run id from a stored design picture path', () => {
    expect(designRunIdFromArtifact(made(ID_A))).toBe(ID_A);
    expect(designRunIdFromArtifact(proxied('a'))).toBeNull();
  });

  it('reads the sha256 from the artifact or its proxy url', () => {
    expect(artifactSha(proxied('a'))).toBe(sha('a'));
    expect(artifactSha({ uri: `https://x/api/artifacts/${sha('b')}` })).toBe(sha('b'));
    expect(artifactSha({ uri: 'data:image/png;base64,AAA' })).toBeNull();
  });

  it('only looks for design runs behind Idea / Inspiration CADs built from a picture', () => {
    expect(mayHaveDesignHistory({ client_flow: 'idea', image_artifact: proxied('a') })).toBe(true);
    expect(mayHaveDesignHistory({ client_flow: 'image', image_artifact: proxied('a') })).toBe(false);
    expect(mayHaveDesignHistory({ client_flow: 'idea' })).toBe(false);
    expect(mayHaveDesignHistory({ image_artifact: made(ID_A) })).toBe(true);
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
  it('finds the doodle behind a CAD run by matching the picture (staging state-95b9c667 shape)', async () => {
    const src = sources({
      // A later run by the same customer: not the one.
      [ID_X]: { created_at: '2026-10-17T17:23:47', input_payload: { images: [], prompt: 'x' }, output: proxied('9') },
      [ID_A]: {
        created_at: '2026-10-17T17:22:31',
        input_payload: {
          images: [{ role: 'drawing', artifact: proxied('d') }],
          prompt: 'Turn this drawing into a realistic ring design.',
          jewelry_type: 'ring',
        },
        output: proxied('b'),
      },
    });
    const history = await traceDesignHistory(proxied('b'), '2026-10-17T17:23:02', src);
    // The later run is skipped by time, never read.
    expect(src.asked).toEqual([ID_A]);
    expect(history?.brokenAtMarkup).toBe(false);
    expect(history?.steps).toHaveLength(1);
    const [step] = history!.steps;
    expect(step.kind).toBe('doodle');
    expect(step.text).toBeNull();
    expect(step.defaultText).toBe('Turn this drawing into a realistic ring design.');
    expect(step.images).toEqual([{ url: proxied('d').uri, label: 'Doodle' }]);
    expect(step.outputUrl).toBe(proxied('b').uri);
    expect(startedFromDoodle(history)).toBe(true);
  });

  it('keeps what the customer wrote about the drawing, and the edits after it, earliest first', async () => {
    const src = sources({
      [ID_B]: { created_at: '2026-10-17T15:32:42', input_payload: { images: [{ role: 'base', artifact: proxied('c') }], prompt: 'simplify spider' }, output: proxied('e') },
      [ID_C]: { created_at: '2026-10-17T15:30:00', input_payload: { images: [{ role: 'drawing', artifact: proxied('d') }], prompt: 'the circles are stones' }, output: proxied('c') },
    });
    const history = await traceDesignHistory(proxied('e'), '2026-10-17T15:40:00', src);
    expect(history?.steps.map((s) => [s.workflowId, s.kind, s.text])).toEqual([
      [ID_C, 'doodle', 'the circles are stones'],
      [ID_B, 'edit', 'simplify spider'],
    ]);
    // Each step's output is the picture the next one used.
    expect(history?.steps[0].outputUrl).toBe(proxied('c').uri);
    expect(history?.steps[1].outputUrl).toBe(proxied('e').uri);
  });

  it('follows a stored design path without listing runs', async () => {
    const src = sources({
      [ID_A]: { created_at: '2026-10-17T17:22:31', input_payload: { images: [{ role: 'drawing', artifact: proxied('d') }], prompt: 'a ring' } },
    });
    src.listRuns = async () => { throw new Error('should not list'); };
    const history = await traceDesignHistory(made(ID_A), null, src);
    expect(history?.steps.map((s) => s.workflowId)).toEqual([ID_A]);
  });

  it('stops at a marked-up design and says the earlier steps are not linked', async () => {
    const src = sources({
      [ID_A]: { created_at: '2026-10-16T02:12:48', input_payload: { images: [{ role: 'markup', artifact: proxied('0') }], prompt: 'remove this hole' }, output: proxied('b') },
    });
    const history = await traceDesignHistory(proxied('b'), null, src);
    expect(history?.brokenAtMarkup).toBe(true);
    expect(history?.steps[0]).toMatchObject({
      kind: 'annotated_edit',
      text: 'remove this hole',
      images: [{ url: proxied('0').uri, label: 'Design with annotations' }],
    });
  });

  it('is null when no design run made the picture, or the runs cannot be listed', async () => {
    const src = sources({
      [ID_A]: { created_at: '2026-10-17T17:22:31', input_payload: { images: [], prompt: 'a' }, output: proxied('1') },
    });
    expect(await traceDesignHistory(proxied('f'), null, src)).toBeNull();
    expect(await traceDesignHistory({ uri: 'data:image/png;base64,AAA' }, null, src)).toBeNull();
    const failing = sources({}, { listFails: true });
    expect(await traceDesignHistory(proxied('f'), null, failing)).toBeNull();
  });

  it('caps how many runs it reads and survives a loop', async () => {
    const many: Record<string, FakeRun> = {};
    for (let i = 0; i < 10; i++) {
      many[`state-${String(i).padStart(32, '0')}`] = { created_at: `2026-10-17T10:0${i}:00`, input_payload: { images: [], prompt: 'a' }, output: proxied('1') };
    }
    const capped = sources(many);
    expect(await traceDesignHistory(proxied('f'), null, capped, 12, 3)).toBeNull();
    expect(capped.asked).toHaveLength(3);

    const loop = sources({
      [ID_A]: { created_at: '2026-10-17T10:00:00', input_payload: { images: [{ role: 'base', artifact: made(ID_B) }], prompt: 'a' } },
      [ID_B]: { created_at: '2026-10-17T10:00:00', input_payload: { images: [{ role: 'base', artifact: made(ID_A) }], prompt: 'b' } },
    });
    const history = await traceDesignHistory(made(ID_A), null, loop);
    expect(history?.steps).toHaveLength(2);
  });

  it('labels an angle run', async () => {
    const src = sources({
      [ID_A]: { created_at: '2026-10-17T10:00:00', input_payload: { images: [{ role: 'base', artifact: { uri: 'data:image/png;base64,AAA' } }], prompt: '', view: 'Back' }, output: proxied('b') },
    });
    const history = await traceDesignHistory(proxied('b'), null, src);
    expect(history?.steps[0]).toMatchObject({ kind: 'angle', view: 'Back' });
  });
});
