import { describe, expect, it } from 'vitest';
import { COMMON_ALLOYS, METAL_ALLOYS } from './alloys';
import { csvCell, weightCsv, weightCsvFilename } from './csv';

const base = {
  modelName: 'Crest Signet',
  versionLabel: 'V2',
  volumeMm3: 2192.4,
  target: { grams: 28, tolerancePct: 5, alloyId: 'au14y' },
  alloys: COMMON_ALLOYS,
};

const lines = (csv: string) => csv.split('\r\n');

describe('weightCsv', () => {
  it('starts with the model, version, volume and target', () => {
    expect(lines(weightCsv(base)).slice(0, 5)).toEqual([
      'Model,Crest Signet',
      'Version,V2',
      'Metal volume (mm³),2192.4',
      'Target,28 g ±5% in 14K Yellow Gold',
      '',
    ]);
  });

  it('has one row per listed metal: grams, dwt, after polish, cited density and its source', () => {
    const rows = lines(weightCsv(base));
    expect(rows[5]).toBe('Metal,Grams,DWT,After polish (g),Density (g/cm³),Density source,Source URL');
    expect(rows[6]).toBe('10K Yellow Gold,24.64,15.85,23.41,11.24,UPMR 204 Standard Yellow,https://www.unitedpmr.com/wp-content/uploads/2021/07/204.pdf');
    expect(rows[10]).toBe('Platinum 950,45.38,29.18,43.11,20.70,UPMR 95% Pt / 5% Ru,https://www.unitedpmr.com/wp-content/uploads/2024/06/PT95RUTH.pdf');
    expect(rows).toHaveLength(6 + COMMON_ALLOYS.length + 1); // trailing CRLF
    expect(rows[rows.length - 1]).toBe('');
  });

  it('lists every metal when given the expanded list', () => {
    expect(lines(weightCsv({ ...base, alloys: METAL_ALLOYS })).filter((l) => l.includes('http'))).toHaveLength(21);
  });

  it('leaves the target empty when there is none, and keeps the volume exactly as measured', () => {
    const rows = lines(weightCsv({ ...base, target: null, volumeMm3: 228.49 }));
    expect(rows[2]).toBe('Metal volume (mm³),228.49');
    expect(rows[3]).toBe('Target,');
  });

  it('quotes cells with commas, quotes or line breaks, and defuses formulas', () => {
    expect(csvCell('Crest, the "signet"')).toBe('"Crest, the ""signet"""');
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('@SUM')).toBe("'@SUM");
    expect(lines(weightCsv({ ...base, modelName: 'Ring, "No. 5"' }))[0]).toBe('Model,"Ring, ""No. 5"""');
  });
});

describe('weightCsvFilename', () => {
  it('is <model>_v<version>_metal_weight.csv, safe for any file system', () => {
    expect(weightCsvFilename('Crest Signet', 'V2')).toBe('Crest_Signet_v2_metal_weight.csv');
    expect(weightCsvFilename('Ring / "No. 5"?', 'V10')).toBe('Ring_No_5_v10_metal_weight.csv');
    expect(weightCsvFilename(null, null)).toBe('model_metal_weight.csv');
  });
});
