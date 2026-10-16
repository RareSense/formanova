import { describe, expect, it } from 'vitest';
import {
  DESIGN_IMAGE_WORKFLOW,
  DesignImageRequestError,
  MAX_DESIGN_IMAGES,
  buildDesignImageStartBody,
  isDesignImageSuccess,
  parseDesignImageFailure,
  parseDesignImageResult,
} from './design-image-api';

const ART = { uri: 'azure://agentic-artifacts/abc', url: 'https://x/abc', type: 'image/png', bytes: 10, sha256: 'a'.repeat(64) };
const ART2 = { ...ART, sha256: 'b'.repeat(64) };

describe('DESIGN_IMAGE_WORKFLOW', () => {
  it('names the backend workflow the studio starts', () => {
    expect(DESIGN_IMAGE_WORKFLOW).toBe('design_image_v1');
  });
});

describe('buildDesignImageStartBody', () => {
  it('sends a brand-new design from words alone', () => {
    const { payload } = buildDesignImageStartBody({ prompt: '  signet ring, cushion ruby  ', jewelryType: 'ring' });
    expect(payload).toEqual({ prompt: 'signet ring, cushion ruby', images: [], output: 'render', api_key: 'managed', jewelry_type: 'ring' });
  });

  it('sends an edit as the base picture plus the change', () => {
    const { payload } = buildDesignImageStartBody({ prompt: 'oval sapphire', images: [{ role: 'base', image: ART }] });
    expect(payload.images).toEqual([{ role: 'base', artifact: ART }]);
    expect(payload.prompt).toBe('oval sapphire');
  });

  it('allows an empty prompt when a marked-up design is attached', () => {
    const { payload } = buildDesignImageStartBody({ images: [{ role: 'markup', image: ART }] });
    expect(payload.prompt).toBe('');
  });

  it('sends a free-text angle trimmed, and leaves it out when blank', () => {
    expect(buildDesignImageStartBody({ prompt: 'x', images: [{ role: 'base', image: ART }], view: ' crest side ' }).payload.view).toBe('crest side');
    expect('view' in buildDesignImageStartBody({ prompt: 'x', view: '   ' }).payload).toBe(false);
  });

  it('sends dimensions only when given', () => {
    expect(buildDesignImageStartBody({ prompt: 'x', dimensions: 'US 7, band 2 mm' }).payload.dimensions).toBe('US 7, band 2 mm');
    expect('dimensions' in buildDesignImageStartBody({ prompt: 'x', dimensions: ' ' }).payload).toBe(false);
  });

  it('keeps references in order next to the base', () => {
    const { payload } = buildDesignImageStartBody({ prompt: 'band from B', images: [{ role: 'base', image: ART }, { role: 'reference', image: ART2 }] });
    expect((payload.images as { role: string }[]).map((i) => i.role)).toEqual(['base', 'reference']);
  });

  it('refuses requests the toolkit would reject', () => {
    expect(() => buildDesignImageStartBody({})).toThrow(DesignImageRequestError);
    expect(() => buildDesignImageStartBody({ prompt: 'x', images: [{ role: 'base', image: ART }, { role: 'markup', image: ART2 }] })).toThrow(/one design/);
    const five = Array.from({ length: MAX_DESIGN_IMAGES + 1 }, () => ({ role: 'reference' as const, image: ART }));
    expect(() => buildDesignImageStartBody({ prompt: 'x', images: five })).toThrow(/At most/);
    expect(() => buildDesignImageStartBody({ prompt: 'x', view: 'a'.repeat(201) })).toThrow(/angle/);
    expect(() => buildDesignImageStartBody({ prompt: 'a'.repeat(4001) })).toThrow(/description/);
  });
});

describe('parseDesignImageResult', () => {
  it('reads a flat result', () => {
    const r = parseDesignImageResult({ status: 'completed', ok: true, tool: 'design_image', image_artifact: ART, consistent: true, drift: [], view: 'top' });
    expect(r.image.sha256).toBe(ART.sha256);
    expect(r.consistent).toBe(true);
    expect(r.view).toBe('top');
  });

  it('reads a result wrapped under a sink node, with its sibling fields', () => {
    const r = parseDesignImageResult({ design_image: [{ image_artifact: ART, consistent: false, drift: ['6 claws instead of 4', ''] }] });
    expect(r.consistent).toBe(false);
    expect(r.drift).toEqual(['6 claws instead of 4']);
  });

  it('reports consistent as null when there was nothing to check against', () => {
    expect(parseDesignImageResult({ image_artifact: ART }).consistent).toBeNull();
  });

  it('throws when there is no picture, so the caller treats it as a failure', () => {
    expect(() => parseDesignImageResult({ status: 'completed' })).toThrow(/No design picture/);
  });
});

describe('isDesignImageSuccess', () => {
  it('needs a picture and no failure flags', () => {
    expect(isDesignImageSuccess({ image_artifact: ART })).toBe(true);
    expect(isDesignImageSuccess({ image_artifact: ART, ok: false })).toBe(false);
    expect(isDesignImageSuccess({ status: 'failed', image_artifact: ART })).toBe(false);
    expect(isDesignImageSuccess({ status: 'completed' })).toBe(false);
  });
});

describe('parseDesignImageFailure', () => {
  it('passes the backend message through', () => {
    expect(parseDesignImageFailure({ status: 'failed', user_message: 'The picture was blocked.', error_category: 'safety', retryable: false }))
      .toEqual({ userMessage: 'The picture was blocked.', errorCategory: 'safety', retryable: false });
  });

  it('falls back to a plain message', () => {
    expect(parseDesignImageFailure({ status: 'failed' }).userMessage).toMatch(/couldn't make that picture/);
  });
});
