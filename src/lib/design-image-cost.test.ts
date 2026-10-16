import { describe, expect, it } from 'vitest';
import { TOOL_COSTS } from '@/lib/credits-api';
import { DESIGN_IMAGE_CREDITS, DESIGN_IMAGE_WORKFLOW } from '@/lib/design-image-api';

describe('design picture price', () => {
  // The credit gate falls back to TOOL_COSTS when the estimate call fails;
  // without this key it would fall back to 5 and under-quote a 12-credit picture.
  it('has a TOOL_COSTS fallback keyed by the real workflow name, equal to the price on the buttons', () => {
    expect(DESIGN_IMAGE_WORKFLOW).toBe('design_image_v1');
    expect(TOOL_COSTS[DESIGN_IMAGE_WORKFLOW]).toBe(DESIGN_IMAGE_CREDITS);
    expect(DESIGN_IMAGE_CREDITS).toBe(12);
  });
});
