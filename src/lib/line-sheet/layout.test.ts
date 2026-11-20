import { describe, expect, it } from 'vitest';
import {
  containImage, emptyProduct, fileName, wrapLines, formatPrice, gridGeometry, missingFields, paginate, productLines,
  type LineSheet,
} from './layout';

const sheet = (n: number, terms = ''): LineSheet => ({
  brand: { name: 'Lumen', collection: 'Spring 2027', email: '', phone: '', website: '' },
  products: Array.from({ length: n }, (_, i) => emptyProduct(`p${i}`)),
  terms: { minimumOrder: terms, payment: '', delivery: '', notes: '' },
  paper: 'letter',
  currency: 'USD',
});

describe('gridGeometry', () => {
  it('fits 12 pieces (4 x 3) on a US Letter page, inside the margins', () => {
    const g = gridGeometry('letter');
    expect(g.perPage).toBe(12);
    expect(g.gridTop + g.rows * g.cellH + (g.rows - 1) * 14).toBeLessThanOrEqual(g.pageH - 40 - 32);
  });
});

describe('paginate', () => {
  it('keeps one empty page when there are no products yet', () => {
    expect(paginate(sheet(0))).toEqual([{ kind: 'products', products: [] }]);
  });

  it('splits 30 pieces into 3 pages of 12, 12 and 6', () => {
    const pages = paginate(sheet(30));
    expect(pages.map((p) => (p.kind === 'products' ? p.products.length : -1))).toEqual([12, 12, 6]);
  });

  it('adds a terms page only when a term is filled in', () => {
    expect(paginate(sheet(3)).at(-1)?.kind).toBe('products');
    expect(paginate(sheet(3, '12 pieces')).at(-1)?.kind).toBe('terms');
  });
});

describe('formatPrice', () => {
  it('formats plain numbers in the chosen currency', () => {
    expect(formatPrice('45', 'USD')).toBe('$45.00');
    expect(formatPrice(' 1,250.5 ', 'USD')).toBe('$1,250.50');
    expect(formatPrice('$90', 'USD')).toBe('$90.00');
    expect(formatPrice('120', 'EUR')).toBe('€120.00');
  });

  it('keeps free text and blanks as typed', () => {
    expect(formatPrice('On request', 'USD')).toBe('On request');
    expect(formatPrice('  ', 'USD')).toBe('');
  });
});

describe('productLines', () => {
  it('joins the filled details and both prices, leaving blanks out', () => {
    const p = { ...emptyProduct('a'), name: 'Halo Ring', sku: 'LR-01', metal: '14k gold', size: '7', wholesale: '120', retail: '260' };
    expect(productLines(p, 'USD')).toEqual({
      name: 'Halo Ring', sku: 'LR-01', details: '14k gold · 7', wholesale: 'Wholesale $120.00', retail: 'Retail $260.00',
    });
  });
});

describe('missingFields', () => {
  it('names photo, name and price when they are missing', () => {
    expect(missingFields(emptyProduct('a'))).toEqual(['Photo', 'Name', 'Price']);
  });

  it('accepts a retail price alone', () => {
    const p = { ...emptyProduct('a', { src: 'x', width: 1, height: 1 }), name: 'Ring', retail: '99' };
    expect(missingFields(p)).toEqual([]);
  });
});

describe('containImage', () => {
  it('fits a tall photo inside the square without cropping and centres it across', () => {
    expect(containImage({ src: '', width: 500, height: 1000 }, 100)).toEqual({ w: 50, h: 100, dx: 25, dy: 0 });
  });

  it('rests a wide photo on the bottom of the square, right above its text', () => {
    expect(containImage({ src: '', width: 1000, height: 500 }, 100)).toEqual({ w: 100, h: 50, dx: 0, dy: 50 });
  });
});

describe('fileName', () => {
  it('builds a safe file name from brand and collection', () => {
    expect(fileName({ name: 'Lumen & Co', collection: 'Spring 2027', email: '', phone: '', website: '' })).toBe('lumen-co-spring-2027-line-sheet.pdf');
  });
});

describe('wrapLines', () => {
  const measure = (s: string) => s.length; // one unit per character

  it('keeps short text on one line', () => {
    expect(wrapLines('Halo Ring', 20, measure, 2)).toEqual(['Halo Ring']);
  });

  it('breaks by words onto a second line', () => {
    expect(wrapLines('Etoile Diamond Choker', 15, measure, 2)).toEqual(['Etoile Diamond', 'Choker']);
  });

  it('ends the last allowed line with an ellipsis when text is left over', () => {
    expect(wrapLines('Etoile Diamond Choker Limited Edition Gold', 15, measure, 2)).toEqual(['Etoile Diamond', 'Choker Limited…']);
  });

  it('shortens a single word that is too long', () => {
    expect(wrapLines('Supercalifragilistic', 10, measure, 2)).toEqual(['Supercali…']);
  });
});
