import { describe, expect, it } from 'vitest';
import { cadStatusNotice } from './cad-status-copy';

describe('cadStatusNotice', () => {
  it.each([
    ['nothing_to_fix', 'success', 'Nothing to change'],
    ['no_safe_fix', 'warning', 'No safe change found'],
    ['requirement_conflict', 'warning', 'Details do not match'],
  ])('gives %s a short user-facing message', (reason, tone, title) => {
    expect(cadStatusNotice(reason)).toMatchObject({ tone, title });
  });

  it('uses the service-busy error for unknown failures', () => {
    expect(cadStatusNotice('unexpected')).toMatchObject({
      tone: 'error',
      title: 'AI is overwhelmed',
    });
  });
});
