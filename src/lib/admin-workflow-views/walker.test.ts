import { describe, expect, it } from 'vitest';

import { childPath, coveredPaths, humanize, walk, type ViewNode } from './walker';
import { leafPaths } from './__fixtures__/leaf-paths';

const SHA = 'b'.repeat(64);
const find = (node: ViewNode, path: string): ViewNode | undefined => {
  if (node.path === path) return node;
  const kids = node.kind === 'group' ? node.children : node.kind === 'list' ? node.items : node.kind === 'media' && node.meta ? [node.meta] : [];
  for (const k of kids) {
    const f = find(k, path);
    if (f) return f;
  }
  return undefined;
};

describe('humanize', () => {
  it('turns keys into labels', () => {
    expect(humanize('jewelry_image_urls')).toBe('Jewelry image urls');
    expect(humanize('userArtDirection')).toBe('User art direction');
    expect(humanize('__proto__')).toBe('Proto');
    expect(humanize('')).toBe('Value');
  });
});

describe('childPath', () => {
  it('uses dots for plain keys and quoted brackets for odd ones', () => {
    expect(childPath('a', 'b')).toBe('a.b');
    expect(childPath('a', 0)).toBe('a[0]');
    expect(childPath('a', 'odd.key"x')).toBe('a["odd.key\\"x"]');
  });
});

describe('walk: types every value without a schema', () => {
  it('artifact refs become media typed by mime, with every key kept in its details', () => {
    const root = walk({
      pic: { uri: `https://api/artifacts/${SHA}`, type: 'image/png', sha256: SHA, bytes: 10 },
      model: { url: `/api/artifacts/${SHA}`, mime: 'model/gltf-binary', sha256: SHA },
      file: { uri: `https://api/artifacts/${'c'.repeat(64)}`, type: 'model/vnd.3dm', bytes: 2048, name: 'r.3dm' },
      svg: { uri: `https://api/artifacts/${'d'.repeat(64)}`, type: 'image/svg+xml' },
    }, 'p');
    expect(find(root, 'p.pic')).toMatchObject({ kind: 'media', media: 'image', url: `/api/artifacts/${SHA}`, label: 'Pic' });
    expect(find(root, 'p.model')).toMatchObject({ kind: 'media', media: 'model3d' });
    expect(find(root, 'p.file')).toMatchObject({ kind: 'media', media: 'file', ext: '3dm', name: 'r.3dm', bytes: 2048 });
    expect(find(root, 'p.svg')).toMatchObject({ kind: 'media', media: 'file' });
    expect(find(root, 'p.pic.sha256')).toMatchObject({ kind: 'text', technical: true });
  });

  it('url strings are typed by extension; refused ones stay text', () => {
    const root = walk({ a: 'https://cdn.example.com/x.jpg', b: 'https://x.y/r.stl', c: 'javascript:alert(1)', d: 'https://example.com/docs' }, 'p');
    expect(find(root, 'p.a')).toMatchObject({ kind: 'media', media: 'image', source: 'https://cdn.example.com/x.jpg' });
    expect(find(root, 'p.b')).toMatchObject({ kind: 'media', media: 'file', ext: 'stl' });
    expect(find(root, 'p.c')).toMatchObject({ kind: 'refused', value: 'javascript:alert(1)' });
    expect(find(root, 'p.d')).toMatchObject({ kind: 'media', media: 'link' });
  });

  it('short text is a value, long text a block; numbers, booleans, null and empties are values', () => {
    const root = walk({ s: 'ring', l: 'x'.repeat(200), n: 4.5, t: true, z: null, e: [], o: {} }, 'p');
    expect(find(root, 'p.s')).toMatchObject({ kind: 'text', value: 'ring', long: false });
    expect(find(root, 'p.l')).toMatchObject({ kind: 'text', long: true });
    expect(find(root, 'p.n')).toMatchObject({ kind: 'value', value: '4.5' });
    expect(find(root, 'p.t')).toMatchObject({ kind: 'value', value: 'yes' });
    expect(find(root, 'p.z')).toMatchObject({ kind: 'value', value: 'empty' });
    expect(find(root, 'p.e')).toMatchObject({ kind: 'value', value: 'none' });
    expect(find(root, 'p.o')).toMatchObject({ kind: 'value', value: 'none' });
  });

  it('arrays of pictures are galleries with numbered labels; other arrays are lists', () => {
    const root = walk({ jewelry_image_urls: [`/api/artifacts/${SHA}`, `/api/artifacts/${'c'.repeat(64)}`], tags: ['a', 'b'] }, 'p');
    const gallery = find(root, 'p.jewelry_image_urls');
    expect(gallery).toMatchObject({ kind: 'list', gallery: true });
    expect(find(root, 'p.jewelry_image_urls[1]')?.label).toBe('Jewelry image urls 2');
    expect(find(root, 'p.tags')).toMatchObject({ kind: 'list', gallery: false });
  });

  it('noise keys are folded into the technical group, never removed', () => {
    const root = walk({ prompt: 'x', idempotency_key: 'k', image_b64: null, input_hash: 'h' }, 'p');
    expect(find(root, 'p.idempotency_key')).toMatchObject({ technical: true });
    expect(find(root, 'p.image_b64')).toMatchObject({ technical: true });
    expect(find(root, 'p.input_hash')).toMatchObject({ technical: true });
    expect(find(root, 'p.prompt')?.technical).toBeFalsy();
  });

  it('a family may only relabel and reorder', () => {
    const root = walk({ b: 1, a: 2, role: 'markup', artifact: 'x' }, 'p', {
      labels: { a: 'Alpha' },
      label: ({ key, parent }) => (key === 'artifact' && parent?.role === 'markup' ? 'Design with annotations' : undefined),
      order: ['a'],
    });
    expect(root.kind === 'group' && root.children.map((c) => c.label)).toEqual(['Alpha', 'B', 'Role', 'Design with annotations']);
  });

  it('labels by tool and key for step outputs', () => {
    const root = walk({ prompt: 'p' }, 's', { labels: { 'prepare_x.prompt': 'Initial prompt' } }, 'prepare_x');
    expect(find(root, 's.prompt')?.label).toBe('Initial prompt');
  });

  it('stops at a depth cap and keeps the rest for "show more"', () => {
    let deep: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < 30; i += 1) deep = { next: deep };
    const root = walk(deep, 'p');
    const covered = coveredPaths(root);
    expect([...covered].some((p) => p.endsWith('…'))).toBe(true);
  });
});

describe('completeness', () => {
  it('every leaf of an odd payload is covered by some node', () => {
    const payload = JSON.parse(JSON.stringify({
      'odd key': { 'a.b': [1, [2, [3, { x: null }]]], '': 'empty key' },
      unicode_ключ: 'значение',
      artifacts: [{ uri: `azure://c/hashed/${SHA}`, type: 'application/x-new-type', extra: { nested: true } }],
      big: 1e21,
      neg: -0,
      flags: [true, false],
    }));
    const root = walk(payload, 'input_payload');
    const covered = coveredPaths(root);
    expect(leafPaths(payload, 'input_payload').filter((p) => !covered.has(p))).toEqual([]);
  });
});
