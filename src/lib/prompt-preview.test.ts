import { describe, expect, it } from 'vitest';

import { previewPrompt, stripMarkdownEmphasis } from './prompt-preview';

describe('previewPrompt', () => {
  it('leaves a short prompt whole, with no ellipsis', () => {
    expect(previewPrompt('US 7, band 2 mm')).toBe('US 7, band 2 mm');
  });

  it('cuts a long prompt at a word boundary and ends it with an ellipsis', () => {
    const long = 'Ring size US 7 with a 2 mm band, a 9 by 7 mm oval centre stone in a four claw setting, and pave shoulders';
    const out = previewPrompt(long, 60);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(61);
    const body = out.slice(0, -1);
    expect(long.startsWith(body)).toBe(true);
    // Never mid-word, and no dangling comma before the ellipsis.
    expect(long[body.length]).toBe(' ');
    expect(body).not.toMatch(/[,\s]$/);
  });

  it('shows newlines and runs of spaces as single spaces', () => {
    expect(previewPrompt('band 2 mm\n\n  centre   stone')).toBe('band 2 mm centre stone');
  });

  it('cuts one very long word rather than overflowing', () => {
    expect(previewPrompt('x'.repeat(200), 50)).toBe(`${'x'.repeat(50)}…`);
  });

  it('drops markdown emphasis', () => {
    expect(previewPrompt('a **spider** ring')).toBe('a spider ring');
    expect(stripMarkdownEmphasis('*one* and **two**')).toBe('one and two');
  });
});
