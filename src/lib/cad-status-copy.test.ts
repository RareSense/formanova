import { describe, expect, it } from 'vitest';
import { cadInProgressNotice, cadStatusNotice } from './cad-status-copy';

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

describe('supervised CAD copy', () => {
  it('says a waiting run is still in progress, never failed', () => {
    expect(cadInProgressNotice()).toEqual({
      tone: 'success',
      title: 'Still in progress',
      message: "This CAD is still in progress. You'll have the result within 24 hours.",
    });
  });

  it('tells the user an admin-failed run was refunded, not that AI is overwhelmed', () => {
    expect(cadStatusNotice('failed_by_admin')).toEqual({
      tone: 'error',
      title: "We couldn't make this design",
      message: 'Your credits have been returned.',
    });
  });
});
