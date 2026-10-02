import { describe, expect, it } from 'vitest';
import { CAD_JEWELRY_TYPES } from '@/lib/ring-cad-nurbs-api';
import { CAD_EXAMPLE_DESIGNS, CAD_EXAMPLE_PROMPTS } from './cad-examples';

describe('CAD examples', () => {
  it('gives every piece four picture examples, each with a description', () => {
    for (const { value } of CAD_JEWELRY_TYPES) {
      expect(CAD_EXAMPLE_DESIGNS[value]).toHaveLength(4);
      for (const example of CAD_EXAMPLE_DESIGNS[value]) {
        expect(example.image).toBeTruthy();
        expect(example.prompt.length).toBeGreaterThan(20);
      }
    }
  });

  it('gives every piece written briefs to start from', () => {
    for (const { value } of CAD_JEWELRY_TYPES) {
      expect(CAD_EXAMPLE_PROMPTS[value].length).toBeGreaterThanOrEqual(4);
    }
  });

  it('keeps the ring examples as they were', () => {
    expect(CAD_EXAMPLE_PROMPTS.ring).toEqual([
      'Serpentine ring with a coiled snake design',
      'Sculptural flowing gold band',
      'Botanical ring with leaves wrapping around the band',
      'Gothic ring with sharp arches and dark gemstones',
      'Twisted vine ring with small diamonds',
      'Minimalist ring with a single oval diamond',
    ]);
    expect(CAD_EXAMPLE_DESIGNS.ring[0].prompt).toMatch(/^Oval center stone with ball-tip prong setting/);
  });
});
