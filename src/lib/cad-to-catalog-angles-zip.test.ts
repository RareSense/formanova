import JSZip from 'jszip';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_ANGLES, anglesFor, hasOwnAngles, resetAngles, saveAngles } from './cad-to-catalog-angles';
import { buildZip } from './cad-to-catalog-zip';
import type { Piece, Picture } from './cad-to-catalog-queue';

beforeEach(() => localStorage.clear());

describe('angles', () => {
  it("starts from the tool's five angles", () => {
    expect(anglesFor('ring').map((a) => a.name)).toEqual(['Three-quarter', 'Front', 'Side', 'Top', 'Low hero']);
    expect(hasOwnAngles('ring')).toBe(false);
  });

  it('keeps a saved set per jewellery type', () => {
    const mine = [{ name: 'Hero', dir: [0.5, 0.5, 0.7], dist: 0.9 }];
    expect(saveAngles('earring', mine)).toBe(true);
    expect(anglesFor('earring')).toEqual(mine);
    expect(anglesFor('ring')).toBe(DEFAULT_ANGLES);
    resetAngles('earring');
    expect(anglesFor('earring')).toBe(DEFAULT_ANGLES);
  });

  it('refuses broken angles and survives a broken store', () => {
    expect(saveAngles('ring', [{ name: 'x', dir: [1, 2] }])).toBe(false);
    localStorage.setItem('formanova_catalog_angles_v1', '{not json');
    expect(anglesFor('ring')).toBe(DEFAULT_ANGLES);
  });
});

describe('buildZip', () => {
  const piece = (id: string, name: string): Piece => ({ id, name, category: 'ring', status: 'done' });
  const pic = (id: string, pieceId: string, name: string, status: Picture['status'] = 'done'): Picture => ({
    id, pieceId, name, status, angle: { name: 'Front', dir: [0, 0, 1] }, metal: null, background: 'white',
  });

  it('puts every finished picture in a folder per piece', async () => {
    const pieces = [piece('a', 'FFR ENG-172.3dm'), piece('b', 'FFR ENG-172.glb'), piece('c', 'empty.3dm')];
    const pictures = [pic('1', 'a', '01_Front_White'), pic('2', 'a', '02_Top_White', 'failed'), pic('3', 'b', '01_Front_White')];
    const { zip, count } = await buildZip(pieces, pictures, async (p) => new Blob([p.id], { type: p.id === '3' ? 'image/jpeg' : 'image/png' }));
    expect(count).toBe(2);
    const files = Object.keys((await JSZip.loadAsync(zip)).files).filter((f) => !f.endsWith('/'));
    expect(files.sort()).toEqual(['FFR ENG-172 (2)/01_Front_White.jpg', 'FFR ENG-172/01_Front_White.png']);
  });
});
