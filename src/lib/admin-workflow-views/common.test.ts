import { describe, expect, it } from 'vitest';

import {
  buildSteps,
  collectFiles,
  fieldsFromObject,
  imageUrl,
  safeHref,
  stepFailure,
  unwrapResult,
} from './common';
import type { AdminGenerationStep } from '@/lib/admin-generations-api';

const SHA = 'a'.repeat(64);
const step = (tool_name: string, output: unknown, extra: Partial<AdminGenerationStep> = {}): AdminGenerationStep => ({
  tool_name, took_ms: 1200, at: '2026-11-01T10:00:00Z', input: {}, output, ...extra,
});

describe('unwrapResult', () => {
  it('reads the tool output under { result } or flat', () => {
    expect(unwrapResult({ result: { piece: 'ring' } })).toEqual({ piece: 'ring' });
    expect(unwrapResult({ piece: 'ring' })).toEqual({ piece: 'ring' });
    expect(unwrapResult(null)).toEqual({});
    expect(unwrapResult('oops')).toEqual({});
  });
});

describe('stepFailure', () => {
  it('reads the {error} record http_tool writes for a failed attempt', () => {
    expect(stepFailure({ error: 'HTTP 502 from tool: upstream timed out' })).toEqual({ failed: true, error: 'HTTP 502 from tool: upstream timed out' });
    expect(stepFailure({ error: { message: 'boom', type: 'ToolError' } })).toEqual({ failed: true, error: 'boom' });
  });

  it('reads a soft failure in the body (ok false / status failed)', () => {
    expect(stepFailure({ result: { ok: false, status: 'failed', user_message: 'Could not read the file' } }))
      .toEqual({ failed: true, error: 'Could not read the file' });
    expect(stepFailure({ status: 'failed' })).toEqual({ failed: true, error: null });
  });

  it('treats a normal output, and an empty error field, as success', () => {
    expect(stepFailure({ output_url: 'x', error: null })).toEqual({ failed: false, error: null });
    expect(stepFailure({ result: { ok: true, status: 'completed' } })).toEqual({ failed: false, error: null });
    expect(stepFailure(null)).toEqual({ failed: false, error: null });
  });
});

describe('imageUrl', () => {
  it('resolves artifacts and urls to something an img can load', () => {
    expect(imageUrl({ uri: `https://api.formanova.ai/api/artifacts/${SHA}`, type: 'image/png' })).toBe(`/api/artifacts/${SHA}`);
    expect(imageUrl(`azure://container/hashed/${SHA}`)).toBe(`/api/artifacts/${SHA}`);
    expect(imageUrl('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA');
    expect(imageUrl('https://cdn.example.com/model.jpg')).toBe('https://cdn.example.com/model.jpg');
  });

  it('refuses things that are not pictures or are unsafe', () => {
    expect(imageUrl('javascript:alert(1)')).toBeNull();
    expect(imageUrl('data:text/html,<script>')).toBeNull();
    expect(imageUrl('just words')).toBeNull();
    expect(imageUrl({ uri: 'file:///etc/passwd' })).toBeNull();
    expect(imageUrl(42)).toBeNull();
  });
});

describe('safeHref', () => {
  it('allows http(s), same-origin paths and data: urls only', () => {
    expect(safeHref(`/api/artifacts/${SHA}`)).toBe(`/api/artifacts/${SHA}`);
    expect(safeHref('https://x.y/z.3dm')).toBe('https://x.y/z.3dm');
    expect(safeHref('data:application/octet-stream;base64,AA')).toBe('data:application/octet-stream;base64,AA');
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('//evil.com/x')).toBeNull();
  });
});

describe('fieldsFromObject', () => {
  it('labels every simple value and keeps long text readable', () => {
    expect(fieldsFromObject({ lighting: 'soft window light', props: ['silk', 'stone'], vivid: true, count: 2, nested: { a: 1 } }, 'Art direction'))
      .toEqual([
        { label: 'Art direction: lighting', value: 'soft window light' },
        { label: 'Art direction: props', value: 'silk, stone' },
        { label: 'Art direction: vivid', value: 'yes' },
        { label: 'Art direction: count', value: '2' },
        { label: 'Art direction: nested', value: '{"a":1}' },
      ]);
  });

  it('skips empty values and base64 blobs', () => {
    expect(fieldsFromObject({ a: '', b: null, image_b64: 'AAAA', c: 'x' })).toEqual([{ label: 'c', value: 'x' }]);
  });
});

describe('collectFiles', () => {
  it('finds every file artifact with a label from its key, skipping pictures', () => {
    const files = collectFiles({
      result: {
        threedm_artifact: { uri: `https://api/artifacts/${'1'.repeat(64)}`, type: 'model/vnd.3dm', bytes: 2048, sha256: '1'.repeat(64) },
        glb_artifact: { uri: `https://api/artifacts/${'2'.repeat(64)}`, type: 'model/gltf-binary', sha256: '2'.repeat(64) },
        stl_artifacts: [{ uri: `https://api/artifacts/${'3'.repeat(64)}`, type: 'model/stl', sha256: '3'.repeat(64) }],
        derivatives: { casting_body: { files: [{ uri: `https://api/artifacts/${'4'.repeat(64)}`, type: 'model/stl', sha256: '4'.repeat(64), name: 'casting.stl' }] } },
        spec_sheet: { uri: `https://api/artifacts/${'5'.repeat(64)}`, type: 'application/pdf', sha256: '5'.repeat(64) },
        preview: { uri: `https://api/artifacts/${'6'.repeat(64)}`, type: 'image/png', sha256: '6'.repeat(64) },
      },
    });
    expect(files.map((f) => [f.label, f.url, f.bytes])).toEqual([
      ['3DM', `/api/artifacts/${'1'.repeat(64)}`, 2048],
      ['GLB', `/api/artifacts/${'2'.repeat(64)}`, null],
      ['STL', `/api/artifacts/${'3'.repeat(64)}`, null],
      ['Casting STL', `/api/artifacts/${'4'.repeat(64)}`, null],
      ['Spec sheet', `/api/artifacts/${'5'.repeat(64)}`, null],
    ]);
    expect(files[3].name).toBe('casting.stl');
  });

  it('marks the pre-validation copy and drops duplicates', () => {
    const a = { uri: `https://api/artifacts/${'7'.repeat(64)}`, type: 'model/vnd.3dm', sha256: '7'.repeat(64) };
    const files = collectFiles({ prevalidation_threedm_artifact: a, again: a });
    expect(files.map((f) => f.label)).toEqual(['3DM (pre-validation)']);
  });
});

describe('buildSteps', () => {
  it('lists every attempt, marks a failure and that it was retried', () => {
    const steps = buildSteps([
      step('generate_jewelry_image_initial_higher_tier', { error: 'timeout' }),
      step('generate_jewelry_image_initial_higher_tier', { output_url: `https://api/artifacts/${SHA}` }),
      step('upscale_higher_tier_4k', { error: 'no gpu' }),
    ], () => ({ fields: [], images: [] }));
    expect(steps.map((s) => [s.index, s.tool, s.failed, s.retried, s.error, s.tookMs])).toEqual([
      [1, 'generate_jewelry_image_initial_higher_tier', true, true, 'timeout', 1200],
      [2, 'generate_jewelry_image_initial_higher_tier', false, false, null, 1200],
      [3, 'upscale_higher_tier_4k', true, false, 'no gpu', 1200],
    ]);
  });

  it('asks the family to describe successful steps only', () => {
    const seen: string[] = [];
    buildSteps([step('a', { error: 'x' }), step('b', { ok: 1 })], (s) => { seen.push(s.tool_name); return { fields: [], images: [] }; });
    expect(seen).toEqual(['b']);
  });
});
