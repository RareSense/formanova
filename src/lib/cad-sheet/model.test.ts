import { describe, expect, it } from 'vitest';
import { EMPTY_ENTERED, formatSize, overallSize, readRows, sheetFileName, storesUnits, type CadReading } from './model';

const rhino: CadReading = {
  fileName: 'halo-ring.3dm', format: '3dm', fileUnits: 'mm', size: [21.04, 12.38, 26.24], upAxis: 'z',
  parts: 14, layers: ['Metal', 'Stones'], partsWithoutMesh: 0,
};
const stl: CadReading = { ...rhino, fileName: 'ring.stl', format: 'stl', fileUnits: null, size: [0.8, 0.8, 0.09], layers: [] };

describe('units', () => {
  it('knows which formats never store units', () => {
    expect(storesUnits('3dm')).toBe(true);
    expect(storesUnits('step')).toBe(true);
    expect(storesUnits('STL')).toBe(false);
    expect(storesUnits('obj')).toBe(false);
  });
});

describe('overallSize', () => {
  it('reads a Rhino file\'s size in millimetres, from the CAD file', () => {
    expect(overallSize(rhino, null)).toEqual({ mm: [21.04, 12.38, 26.24], source: 'cad', units: 'mm' });
  });

  it('puts the vertical axis last for Y-up files', () => {
    expect(overallSize({ ...rhino, upAxis: 'y', size: [10, 30, 20] }, null).mm).toEqual([10, 20, 30]);
  });

  it('marks an STL size as estimated until the jeweler confirms the units', () => {
    expect(overallSize(stl, null).source).toBe('estimated');
    const inches = overallSize(stl, 'in');
    expect(inches.source).toBe('you');
    expect(inches.mm[0]).toBeCloseTo(20.32, 2);
  });
});

describe('readRows', () => {
  it('labels every fact with where it came from', () => {
    expect(readRows(rhino, null)).toEqual([
      { label: 'File', value: 'halo-ring.3dm', source: 'cad' },
      { label: 'Units', value: 'Millimeters', source: 'cad' },
      { label: 'Overall size (W × D × H)', value: '21.0 × 12.4 × 26.2 mm', source: 'cad' },
      { label: 'Parts', value: '14', source: 'cad' },
      { label: 'Layers', value: 'Metal, Stones', source: 'cad' },
    ]);
  });

  it('says plainly when the units are an assumption', () => {
    const units = readRows(stl, null).find((r) => r.label === 'Units');
    expect(units).toEqual({ label: 'Units', value: 'Millimeters (not stored in STL files)', source: 'estimated' });
  });
});

describe('formatSize and sheetFileName', () => {
  it('formats sizes to one decimal', () => {
    expect(formatSize([21.04, 12.38, 26.24])).toBe('21.0 × 12.4 × 26.2 mm');
  });

  it('names the PDF from the piece name and reference, else the CAD file', () => {
    expect(sheetFileName({ ...EMPTY_ENTERED, pieceName: 'Halo Ring', reference: 'R-104' }, 'x.3dm')).toBe('halo-ring-r-104-tech-sheet.pdf');
    expect(sheetFileName(EMPTY_ENTERED, 'Elephant ring.3dm')).toBe('elephant-ring-tech-sheet.pdf');
  });
});

import { layerText } from './model';
describe('layerText', () => {
  it('drops number-only layer names and keeps real ones', () => {
    expect(layerText(['3', '5 :: 17', 'Gem', '图层 01'])).toBe('Gem, 图层 01, 2 unnamed');
  });
});
