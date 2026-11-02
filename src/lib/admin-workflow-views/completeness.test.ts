/**
 * Contract: for every fixture (each start-able workflow plus synthetic unknown ones), every
 * leaf value of the request payload and of every step's input and output is shown by some
 * node of the run view. Nothing may be dropped silently.
 */
import { describe, expect, it } from 'vitest';

import { buildRunView } from './index';
import { coveredPaths } from './walker';
import { FIXTURES } from './__fixtures__/runs';
import { leafPaths } from './__fixtures__/leaf-paths';

describe('admin run view completeness', () => {
  it.each(Object.keys(FIXTURES))('%s: every leaf is rendered', (name) => {
    const detail = FIXTURES[name]();
    const view = buildRunView(detail, /cad_(generate|improve|nurbs)/.test(name));
    const covered = new Set<string>();
    coveredPaths(view.inputs, covered);
    view.steps.forEach((s) => { coveredPaths(s.input, covered); coveredPaths(s.output, covered); });

    const leaves = [
      ...leafPaths(detail.input_payload, 'input_payload'),
      ...detail.steps.flatMap((s, i) => [...leafPaths(s.input, `steps[${i}].input`), ...leafPaths(s.output, `steps[${i}].output`)]),
    ];
    expect(leaves.length).toBeGreaterThan(0);
    expect(leaves.filter((p) => !covered.has(p))).toEqual([]);
    // No depth cap is hit by real payloads: nothing hides behind "show deeper".
    expect([...covered].filter((p) => p.endsWith('…'))).toEqual([]);
  });
});
