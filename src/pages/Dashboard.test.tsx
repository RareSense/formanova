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

  it('uses the agreed CAD copy', () => {
    const el = renderDashboard();

    expect(el.textContent).toContain('Describe your jewelry and generate a CAD model.');
    expect(el.textContent).toContain('Turn inspiration images into a CAD model.');
  });

  // The note describes both CAD workflows, so it belongs to the category
  // divider. On the cards it was repeated twice and said nothing card-specific.
  it('carries the format note once, on the CAD divider, as plain metadata', () => {
    const el = renderDashboard();

    // The outermost span only: the note nests spans to keep the brackets out
    // of the accessible name, and every level reads the same textContent.
    const metaNodes = Array.from(el.querySelectorAll('span')).filter(
      (node) => node.textContent?.trim() === '[Rhino compatible]' && node.querySelector('svg'),
    );
    expect(metaNodes).toHaveLength(1);

    const [note] = metaNodes;
    // Never a button, link, or anything else that invites a click.
    expect(note.closest('a')).toBeNull();
    expect(note.closest('button')).toBeNull();
    expect(note.querySelector('button')).toBeNull();

    // It sits with the CAD heading rather than inside a workflow card.
    const divider = note.closest('div');
    expect(divider?.querySelector('h2')?.textContent).toBe('CAD');
  });

  it('gives every card a Continue action', () => {
    const el = renderDashboard();

    const continueButtons = Array.from(el.querySelectorAll('button')).filter((node) =>
      node.textContent?.includes('Continue'),
    );
    expect(continueButtons).toHaveLength(4);
  });
});
