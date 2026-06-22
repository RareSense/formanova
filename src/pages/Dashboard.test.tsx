import React, { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

import Dashboard from './Dashboard';

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_, tag: keyof JSX.IntrinsicElements) => {
      const MotionTag = React.forwardRef<HTMLElement, Record<string, unknown>>(
        ({ children, initial, animate, transition, variants, whileHover, whileTap, ...props }, ref) => (
          React.createElement(tag, { ...props, ref }, children as React.ReactNode)
        ),
      );
      MotionTag.displayName = `motion.${String(tag)}`;
      return MotionTag;
    },
  }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'cad-user@example.com' } }),
}));

vi.mock('@/hooks/use-prefetch-generations', () => ({
  usePrefetchGenerations: vi.fn(),
}));

vi.mock('@/components/ui/optimized-image', () => ({
  OptimizedImage: ({ alt, className }: { alt: string; className?: string }) => (
    <div role="img" aria-label={alt} className={className} />
  ),
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
  }
  container?.remove();
  root = null;
  container = null;
});

describe('Dashboard CAD entry copy', () => {
  it('presents the dashboard as a studio choice and describes the CAD hub', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <HelmetProvider>
          <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Dashboard />
          </MemoryRouter>
        </HelmetProvider>,
      );
    });

    expect(container.textContent).toContain('Choose your studio');
    expect(container.textContent).toContain('Generate text-to-CAD models and catalog visuals');
  });
});
