import { describe, expect, it } from 'vitest';
import {
  ALLOY_GROUPS,
  COMMON_ALLOY_IDS,
  COMMON_ALLOYS,
  DEFAULT_ALLOY_ID,
  METAL_ALLOYS,
  alloyShortLabel,
  findAlloy,
  materialPayload,
} from './alloys';

describe('alloy table', () => {
  it('has the 21 Appendix A alloys, each with a sane density, a named alloy and a source URL', () => {
    expect(METAL_ALLOYS).toHaveLength(21);
    for (const a of METAL_ALLOYS) {
      expect(a.density_g_cm3).toBeGreaterThanOrEqual(8);
      expect(a.density_g_cm3).toBeLessThanOrEqual(22);
      expect(a.source_url).toMatch(/^https:\/\//);
      expect(a.alloy.length).toBeGreaterThan(0);
      expect(a.label.length).toBeGreaterThan(0);
    }
  });

  it('has unique ids', () => {
    expect(new Set(METAL_ALLOYS.map((a) => a.id)).size).toBe(METAL_ALLOYS.length);
  });

  it('uses exactly the Appendix A densities', () => {
    const densities = Object.fromEntries(METAL_ALLOYS.map((a) => [a.id, a.density_g_cm3]));
    expect(densities).toEqual({
      au9y: 11.1, au9w: 11.9, au9r: 11.1,
      au10y: 11.24, au10w: 11.0, au10wpd: 12.7, au10r: 11.68,
      au14y: 12.76, au14w: 12.55, au14wpd: 14.08, au14r: 13.16,
      au18y: 15.49, au18w: 14.59, au18wpd: 15.84, au18r: 15.09,
      au22y: 17.55, au24: 19.32,
      ag925: 10.36, pt950ru: 20.70, pt950ir: 21.50, pd950: 12.10,
    });
  });

  it('keeps each density as written in Appendix A, and it matches the number', () => {
    const cited = Object.fromEntries(METAL_ALLOYS.map((a) => [a.id, a.density_cited]));
    expect(cited).toEqual({
      au9y: '11.1', au9w: '11.9', au9r: '11.1',
      au10y: '11.24', au10w: '11.0', au10wpd: '12.7', au10r: '11.68',
      au14y: '12.76', au14w: '12.55', au14wpd: '14.08', au14r: '13.16',
      au18y: '15.49', au18w: '14.59', au18wpd: '15.84', au18r: '15.09',
      au22y: '17.55', au24: '19.32',
      ag925: '10.36', pt950ru: '20.70', pt950ir: '21.50', pd950: '12.10',
    });
    for (const a of METAL_ALLOYS) expect(Number(a.density_cited)).toBe(a.density_g_cm3);
  });

  it('cites the Appendix A source for a sample of rows', () => {
    expect(findAlloy('au9w')?.source_url).toBe('https://www.cooksongold.com/downloads/files/bullion/9ctWM_properties_sheet.pdf');
    expect(findAlloy('au18wpd')?.source_url).toBe('https://www.unitedpmr.com/wp-content/uploads/2026/08/Alloy-PD-2.pdf');
    expect(findAlloy('pd950')?.source_url).toBe('https://unitedpmr.com/wp-content/uploads/2024/07/PD950GR7.pdf');
    expect(findAlloy('pt950ir')?.alloy).toBe('5% iridium platinum');
  });

  it('has the common-5 chips and a default that exist in the table', () => {
    expect(COMMON_ALLOY_IDS).toEqual(['au10y', 'au14y', 'au18y', 'ag925', 'pt950ru']);
    expect(COMMON_ALLOYS.map((a) => a.id)).toEqual(COMMON_ALLOY_IDS);
    expect(findAlloy(DEFAULT_ALLOY_ID)?.label).toBe('14K Yellow Gold');
  });

  it('keeps the old profile ids resolving, and platinum_cobalt resolves to nothing', () => {
    expect(findAlloy('sterling_silver')?.id).toBe('ag925');
    expect(findAlloy('14k_yellow_gold')?.id).toBe('au14y');
    expect(findAlloy('14k_white_gold')?.id).toBe('au14w');
    expect(findAlloy('14k_rose_gold')?.id).toBe('au14r');
    expect(findAlloy('18k_yellow_gold')?.id).toBe('au18y');
    expect(findAlloy('18k_white_gold')?.id).toBe('au18w');
    expect(findAlloy('18k_rose_gold')?.id).toBe('au18r');
    expect(findAlloy('platinum_cobalt')).toBeNull();
  });

  it('resolves nothing for unknown or non-string ids, prototype keys included', () => {
    for (const id of ['nope', '', '__proto__', 'constructor', 'toString', null, undefined, 42, {}]) {
      expect(findAlloy(id)).toBeNull();
    }
  });

  it('groups every alloy once by family', () => {
    expect(ALLOY_GROUPS.map((g) => g.label)).toEqual(['Gold', 'Silver', 'Platinum', 'Palladium']);
    expect(ALLOY_GROUPS.flatMap((g) => g.alloys)).toHaveLength(21);
  });

  it('has jeweller names: the label, with platinum detail moved out of the default', () => {
    for (const a of METAL_ALLOYS) {
      if (a.family !== 'platinum') expect(a.name).toBe(a.label);
    }
    expect(findAlloy('pt950ru')?.name).toBe('Platinum 950');
    // Kept so two rows never share a name in More metals.
    expect(findAlloy('pt950ir')?.name).toBe('Platinum 950 (iridium)');
  });

  it('gives a short label for tags', () => {
    expect(['au10y', 'au24', 'ag925', 'pt950ir', 'pd950'].map((id) => alloyShortLabel(findAlloy(id)!)))
      .toEqual(['10K', '24K', '925', 'Pt950', 'Pd950']);
  });

  it('builds the request material block in the existing shape', () => {
    expect(materialPayload(findAlloy('au10y')!)).toEqual({
      alloy: '10K Yellow Gold',
      density_g_cm3: 11.24,
      density_source: 'UPMR 204 Standard Yellow: https://www.unitedpmr.com/wp-content/uploads/2021/07/204.pdf',
    });
  });
});
