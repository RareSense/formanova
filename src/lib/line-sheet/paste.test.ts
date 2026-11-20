import { describe, expect, it } from 'vitest';
import { isMultiCell, parsePaste } from './paste';

describe('isMultiCell', () => {
  it('tells a spreadsheet copy from a single typed value', () => {
    expect(isMultiCell('Halo Ring')).toBe(false);
    expect(isMultiCell('Halo Ring\n')).toBe(false);
    expect(isMultiCell('Halo Ring\tLJ-101')).toBe(true);
    expect(isMultiCell('Halo Ring\nTennis Bracelet')).toBe(true);
  });
});

describe('parsePaste', () => {
  it('fills columns left to right from the cell pasted into', () => {
    expect(parsePaste('Halo Ring\tLJ-101\t14k gold\r\nTennis Bracelet\tLJ-102\t18k gold\r\n')).toEqual([
      { name: 'Halo Ring', sku: 'LJ-101', metal: '14k gold' },
      { name: 'Tennis Bracelet', sku: 'LJ-102', metal: '18k gold' },
    ]);
    expect(parsePaste('120\t260', 'wholesale')).toEqual([{ wholesale: '120', retail: '260' }]);
  });

  it('drops cells beyond the last column', () => {
    expect(parsePaste('260\textra', 'retail')).toEqual([{ retail: '260' }]);
  });

  it('matches a header row by name, in any order, ignoring unknown columns', () => {
    const text = 'Style #\tProduct Name\tNotes\tMSRP\tWholesale Price\nLJ-101\tHalo Ring\tbest seller\t260\t120\n';
    expect(parsePaste(text, 'metal')).toEqual([{ sku: 'LJ-101', name: 'Halo Ring', retail: '260', wholesale: '120' }]);
  });

  it('skips blank lines', () => {
    expect(parsePaste('Halo Ring\n\n\nTennis\n')).toEqual([{ name: 'Halo Ring' }, { name: 'Tennis' }]);
  });
});
