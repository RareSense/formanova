import { describe, expect, it } from 'vitest';

import { isNavLinkActivePath } from './Header';

const dashboardLink = {
  path: '/dashboard',
  activePaths: ['/dashboard', '/studio', '/studio-cad', '/text-to-cad', '/image-to-cad'],
};

describe('isNavLinkActivePath', () => {
  it('marks Dashboard active on the merged hub and every studio entry route', () => {
    expect(isNavLinkActivePath('/dashboard', dashboardLink)).toBe(true);
    expect(isNavLinkActivePath('/studio', dashboardLink)).toBe(true);
    expect(isNavLinkActivePath('/studio-cad', dashboardLink)).toBe(true);
    expect(isNavLinkActivePath('/text-to-cad', dashboardLink)).toBe(true);
    expect(isNavLinkActivePath('/image-to-cad', dashboardLink)).toBe(true);
  });

  it('stays active while working inside a studio workflow', () => {
    expect(isNavLinkActivePath('/studio/categories', dashboardLink)).toBe(true);
    expect(isNavLinkActivePath('/studio/rings', dashboardLink)).toBe(true);
  });

  it('keeps unrelated routes inactive for the Dashboard nav link', () => {
    expect(isNavLinkActivePath('/', dashboardLink)).toBe(false);
    expect(isNavLinkActivePath('/credits', dashboardLink)).toBe(false);
    expect(isNavLinkActivePath('/generations', dashboardLink)).toBe(false);
  });
});
