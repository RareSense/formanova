import { describe, it, expect } from 'vitest';
import { onboardingReturnPath, ONBOARDING_DEFAULT_RETURN } from './onboarding-return';

describe('onboardingReturnPath', () => {
  it('returns the page the user was heading to, query included', () => {
    expect(onboardingReturnPath('/image-to-cad')).toBe('/image-to-cad');
    expect(onboardingReturnPath('/studio/rings?mode=product-shot')).toBe('/studio/rings?mode=product-shot');
    expect(onboardingReturnPath('/connect-rhino?session=abc')).toBe('/connect-rhino?session=abc');
  });

  it('falls back to the studio when there is no destination', () => {
    for (const v of [undefined, null, '', 42, {}]) {
      expect(onboardingReturnPath(v)).toBe(ONBOARDING_DEFAULT_RETURN);
    }
  });

  it('never leaves the site', () => {
    for (const v of ['https://evil.example', '//evil.example', '/\\evil.example', 'image-to-cad']) {
      expect(onboardingReturnPath(v)).toBe(ONBOARDING_DEFAULT_RETURN);
    }
  });

  it('never returns to onboarding, sign-in, or a payment result page', () => {
    for (const v of [
      '/onboarding', '/onboarding/', '/onboarding-welcome', '/login?x=1', '/oauth-callback',
      '/success?session_id=cs_1', '/payment-success', '/cancel',
    ]) {
      expect(onboardingReturnPath(v)).toBe(ONBOARDING_DEFAULT_RETURN);
    }
  });

  it('does not block pages that merely start with a blocked name', () => {
    expect(onboardingReturnPath('/cancelled-orders')).toBe('/cancelled-orders');
  });
});
