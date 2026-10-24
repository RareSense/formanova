import { describe, expect, it } from 'vitest';
import { cadInProgressNotice, cadQueuedNotice, cadStatusNotice } from './cad-status-copy';

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
  it('says the run is queued and when the result arrives', () => {
    expect(cadQueuedNotice()).toEqual({
      tone: 'success',
      title: "You're in the queue",
      message: "Your CAD starts as soon as the queue clears, and you'll have the result within 24 hours.",
    });
  });

  it('says a waiting run is still in progress, never failed', () => {
    expect(cadInProgressNotice()).toEqual({
      tone: 'success',
      title: 'Still in progress',
      message: "We're still working on this CAD. You'll have the result within 24 hours.",
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
