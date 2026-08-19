import { describe, expect, it } from 'vitest';
import { buildReferenceInputs } from './cad-reference-upload';
import type { CadReferenceItem } from './microservices-api';

function imageFile(name: string) {
  return new File(['x'], name, { type: 'image/jpeg' });
}

function item(id: string, position: number): CadReferenceItem {
  return { asset_id: id, uri: `azure://${id}`, sha256: `sha-${id}`, type: 'image/jpeg', bytes: 100, position };
}

describe('buildReferenceInputs', () => {
  it('returns nothing for an empty file list', async () => {
    expect(await buildReferenceInputs([], [])).toEqual([]);
  });

  it('passes uploaded items through unmodified, keeping all six keys', async () => {
    const items = [item('a', 0), item('b', 1)];

    const result = await buildReferenceInputs([imageFile('a.jpg'), imageFile('b.jpg')], items);

    // Straight through: stripping asset_id/position would break the contract.
    expect(result).toEqual(items);
  });

  it('inlines a file as base64 when its upload is missing', async () => {
    // Pending, failed, or endpoint not deployed all look the same here: null.
    const result = await buildReferenceInputs([imageFile('a.jpg')], [null]);

    expect(result).toHaveLength(1);
    expect(result[0] as string).toMatch(/^data:/);
  });

  it('mixes uploaded items and inlined files, preserving order', async () => {
    const result = await buildReferenceInputs(
      [imageFile('a.jpg'), imageFile('b.jpg'), imageFile('c.jpg')],
      [item('a', 0), null, item('c', 2)],
    );

    expect(result[0]).toEqual(item('a', 0));
    expect(result[1] as string).toMatch(/^data:/);
    expect(result[2]).toEqual(item('c', 2));
  });

  it('inlines everything when no items are supplied at all', async () => {
    const result = await buildReferenceInputs([imageFile('a.jpg'), imageFile('b.jpg')]);

    expect(result).toHaveLength(2);
    expect(result.every((r) => typeof r === 'string' && r.startsWith('data:'))).toBe(true);
  });
});
