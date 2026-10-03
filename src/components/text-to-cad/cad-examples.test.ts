import { describe, expect, it } from 'vitest';
import { CAD_JEWELRY_TYPES } from '@/lib/ring-cad-nurbs-api';
import cadExample1 from '@/assets/examples/cad-example-1.webp';
import cadExample2 from '@/assets/examples/cad-example-2.webp';
import cadExample3 from '@/assets/examples/cad-example-3.webp';
import cadExample4 from '@/assets/examples/cad-example-4.webp';
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
    expect(CAD_EXAMPLE_DESIGNS.ring.map((d) => d.prompt)).toEqual([
      'Oval center stone with ball-tip prong setting, flanked by marquise side stones and small round accent clusters, tapered rounded band',
      'Asymmetric botanical ring with two large leaf forms rising from a split flowing band, small round center stone nestled between the leaves, accent stones along leaf edges',
      'Large oval center stone in four-prong setting surrounded by round halo, split shank band with accent stones running along each shank',
      'Wide dome cluster ring, oval center stone surrounded by six oval accents, filigree openwork shoulders',
    ]);
    expect(CAD_EXAMPLE_DESIGNS.ring.map((d) => d.image)).toEqual([cadExample1, cadExample2, cadExample3, cadExample4]);
  });
});
