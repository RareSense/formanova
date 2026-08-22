import React, { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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

vi.mock('@/lib/posthog-events', () => ({
  trackStudioTypeSelected: vi.fn(),
}));

vi.mock('@/components/studio/EffortIntroModal', () => ({
  EffortIntroModal: () => null,
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderDashboard() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  // Dashboard calls useShopifyStatus (react-query), so it needs a client.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  act(() => {
    root?.render(
      <QueryClientProvider client={queryClient}>
        <HelmetProvider>
          <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Dashboard />
          </MemoryRouter>
        </HelmetProvider>
      </QueryClientProvider>,
    );
  });

  return container as HTMLDivElement;
}

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
  }
  container?.remove();
  root = null;
  container = null;
});

describe('Dashboard as the merged studio hub', () => {
  it('asks what to create and groups all four workflows under Photography and CAD', () => {
    const el = renderDashboard();

    expect(el.textContent).toContain('What do you want to create?');
    expect(el.textContent).toContain('Photography');
    expect(el.textContent).toContain('CAD');

    expect(el.textContent).toContain('Model Shot');
    expect(el.textContent).toContain('Product Shot');
    expect(el.textContent).toContain('Text to CAD');
    expect(el.textContent).toContain('Image to CAD');
  });

  it('uses the agreed CAD copy with a non-interactive format note', () => {
    const el = renderDashboard();

    expect(el.textContent).toContain('Describe your jewelry and generate a CAD model.');
    expect(el.textContent).toContain('Turn inspiration images into a CAD model.');

    const metaNodes = Array.from(el.querySelectorAll('p')).filter((node) =>
      node.textContent?.includes('Rhino compatible'),
    );
    expect(metaNodes).toHaveLength(2);
    // The note is plain text, never a button/link/pill.
    metaNodes.forEach((node) => {
      expect(node.closest('a')).toBeNull();
      expect(node.querySelector('button')).toBeNull();
    });
  });

  it('gives every card a Continue action', () => {
    const el = renderDashboard();

    const continueButtons = Array.from(el.querySelectorAll('button')).filter((node) =>
      node.textContent?.includes('Continue'),
    );
    expect(continueButtons).toHaveLength(4);
  });
});
