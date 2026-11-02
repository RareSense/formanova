import { describe, expect, it } from 'vitest';

import { stepFailure, unwrapResult } from './common';

describe('unwrapResult', () => {
  it('reads the tool output under { result } or flat', () => {
    expect(unwrapResult({ result: { piece: 'ring' } })).toEqual({ piece: 'ring' });
    expect(unwrapResult({ piece: 'ring' })).toEqual({ piece: 'ring' });
    expect(unwrapResult(null)).toEqual({});
    expect(unwrapResult('oops')).toEqual({});
  });
});

describe('stepFailure', () => {
  it('reads the {error} record http_tool writes for a failed attempt', () => {
    expect(stepFailure({ error: 'HTTP 502 from tool: upstream timed out' })).toEqual({ failed: true, error: 'HTTP 502 from tool: upstream timed out' });
    expect(stepFailure({ error: { message: 'boom', type: 'ToolError' } })).toEqual({ failed: true, error: 'boom' });
  });

  it('reads a soft failure in the body (ok false / status failed)', () => {
    expect(stepFailure({ result: { ok: false, status: 'failed', user_message: 'Could not read the file' } }))
      .toEqual({ failed: true, error: 'Could not read the file' });
    expect(stepFailure({ status: 'failed' })).toEqual({ failed: true, error: null });
  });

  it('treats a normal output, and an empty error field, as success', () => {
    expect(stepFailure({ output_url: 'x', error: null })).toEqual({ failed: false, error: null });
    expect(stepFailure({ result: { ok: true, status: 'completed' } })).toEqual({ failed: false, error: null });
    expect(stepFailure(null)).toEqual({ failed: false, error: null });
  });
});
