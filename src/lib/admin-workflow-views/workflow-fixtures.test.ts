/**
 * Guard: every workflow the app can start has a fixture in __fixtures__/runs.ts, so the
 * completeness contract covers it (AI_RULES.md section 13).
 *
 * How the names are found (no single source lists them all):
 *   1. a source scan of src/lib/*-api.ts for literal start urls (`/run/<name>`, `/run/state/<name>`)
 *      and for string constants named `*_WORKFLOW`;
 *   2. the exported resolvers, called over their whole input domain (shot type x resolution x
 *      effort), because the photoshoot/fix names are built at runtime.
 * Limit: a name built some other way (a new variable, a new resolver) is only caught once it
 * is exported through one of these. That is why the rule also says to add the fixture by hand.
 */
import { describe, expect, it } from 'vitest';

import { CATALOG_FASTLOAD_WORKFLOW, CATALOG_SHOT_WORKFLOW } from '@/lib/cad-to-catalog-api';
import { improveWorkflowFor } from '@/lib/cad-versions-api';
import { DESIGN_IMAGE_WORKFLOW } from '@/lib/design-image-api';
import { fixWorkflowFor, generateWorkflowFor, workflowFor, WORKFLOW_NAMES } from '@/lib/photoshoot-api';
import { RING_CAD_WORKFLOW } from '@/lib/ring-cad-nurbs-api';
import { FIXTURES } from './__fixtures__/runs';

const SOURCES = import.meta.glob('/src/lib/*-api.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export function scanSourceNames(sources: Record<string, string>): Set<string> {
  const names = new Set<string>();
  for (const text of Object.values(sources)) {
    for (const m of text.matchAll(/\/run\/(?:state\/)?([A-Za-z][A-Za-z0-9_]*)(?![A-Za-z0-9_/])/g)) names.add(m[1]);
    for (const m of text.matchAll(/\b[A-Z0-9_]*_WORKFLOW\s*(?::\s*[^=]+)?=\s*['"]([A-Za-z][A-Za-z0-9_]*)['"]/g)) names.add(m[1]);
  }
  return names;
}

function resolverNames(): Set<string> {
  const names = new Set<string>([
    ...Object.values(WORKFLOW_NAMES), DESIGN_IMAGE_WORKFLOW, RING_CAD_WORKFLOW, CATALOG_SHOT_WORKFLOW, CATALOG_FASTLOAD_WORKFLOW,
    improveWorkflowFor({ family: 'jewelry' }), improveWorkflowFor({ family: 'ring' }),
  ]);
  for (const product of [true, false]) {
    names.add(generateWorkflowFor(product));
    for (const res of ['1K', '2K', '4K']) {
      for (const effort of ['low', 'high'] as const) {
        names.add(workflowFor(product, res, effort));
        names.add(fixWorkflowFor(product, effort, res));
      }
    }
  }
  return names;
}

describe('every start-able workflow has a fixture', () => {
  it('the source scan actually finds start urls (guards the scan itself)', () => {
    const scanned = scanSourceNames(SOURCES);
    expect(scanned.has('upscale_image')).toBe(true);
    expect(scanned.has('cad_to_catalog_fastload')).toBe(true);
  });

  it('no workflow name is missing from __fixtures__/runs.ts', () => {
    const names = new Set([...scanSourceNames(SOURCES), ...resolverNames()]);
    const missing = [...names].filter((n) => !Object.prototype.hasOwnProperty.call(FIXTURES, n)).sort();
    expect(missing).toEqual([]);
  });
});
