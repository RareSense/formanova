import { describe, expect, it } from 'vitest';
import { rhinoCallbackUrl } from './rhino-connect';

const state = '0123456789abcdef0123456789abcdef';

describe('rhinoCallbackUrl', () => {
  it('sends the key to the loopback port Rhino opened', () => {
    expect(rhinoCallbackUrl('51234', state, 'a.b.c')).toBe(
      `http://127.0.0.1:51234/callback?state=${state}&key=a.b.c`,
    );
  });

  it('refuses anything that is not a plain port number', () => {
    expect(rhinoCallbackUrl('80', state, 'a.b.c')).toBeNull();
    expect(rhinoCallbackUrl('99999', state, 'a.b.c')).toBeNull();
    expect(rhinoCallbackUrl('5123@evil.com', state, 'a.b.c')).toBeNull();
    expect(rhinoCallbackUrl('51234/x', state, 'a.b.c')).toBeNull();
  });

  it('refuses a missing or malformed state', () => {
    expect(rhinoCallbackUrl('51234', null, 'a.b.c')).toBeNull();
    expect(rhinoCallbackUrl('51234', 'short', 'a.b.c')).toBeNull();
    expect(rhinoCallbackUrl('51234', state.toUpperCase(), 'a.b.c')).toBeNull();
  });

  it('needs a key', () => {
    expect(rhinoCallbackUrl('51234', state, null)).toBeNull();
  });
});
