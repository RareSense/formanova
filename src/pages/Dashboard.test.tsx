import React, { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import Dashboard from './Dashboard';
import { trackLargeProjectsClicked } from '@/lib/posthog-events';

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
  trackLargeProjectsClicked: vi.fn(),
}));

vi.mock('@/components/studio/EffortIntroModal', () => ({
  EffortIntroModal: () => null,
}));

// The call window is its own component with its own tests; here it only has to open.
vi.mock('@/components/sales/RubyCallDialog', () => ({
  RubyCallDialog: ({ open }: { open: boolean }) => (open ? React.createElement('div', { 'data-testid': 'call-dialog' }) : null),
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
  it('asks what to create and shows the eight cards under Photography, Large Projects and CAD', () => {
    const el = renderDashboard();

    expect(el.querySelector('h1')?.textContent).toBe('What do you want to create?');
    const headings = Array.from(el.querySelectorAll('h2')).map((h) => h.textContent);
    expect(headings).toEqual(['Photography', 'Large Projects', 'CAD']);

    const titles = Array.from(el.querySelectorAll('h3')).map((h) => h.textContent);
    expect(titles).toEqual([
      'Model Shot', 'Product Shot', 'Product Shot from CAD', 'Done For You',
      'CAD from Image', 'CAD from Text', 'CAD from Doodle', 'CAD from Inspiration',
    ]);
    // Text and Doodle replace the old two-step CAD from Idea card.
    expect(el.textContent).not.toContain('CAD from Idea');
  });

  it('uses the agreed copy', () => {
    const el = renderDashboard();

    expect(el.textContent).toContain('Turn your jewelry photo into a CAD model.');
    expect(el.textContent).toContain('Turn your inspiration into a CAD model.');
    expect(el.textContent).toContain('Discuss your project with our AI.');
  });

  it('puts Done For You alone under Large Projects, with Call our AI opening the call window', () => {
    const el = renderDashboard();
    const custom = el.querySelector('section[aria-labelledby="dashboard-large-projects"]');
    expect(custom?.querySelectorAll('h3')).toHaveLength(1);
    expect(custom?.querySelector('h3')?.textContent).toBe('Done For You');

    expect(el.querySelector('[data-testid="call-dialog"]')).toBeNull();
    const call = Array.from(custom?.querySelectorAll('button') ?? []).find((b) => b.textContent?.includes('Call our AI'));
    expect(call).toBeTruthy();
    expect(trackLargeProjectsClicked).not.toHaveBeenCalled();
    act(() => call?.click());
    expect(el.querySelector('[data-testid="call-dialog"]')).not.toBeNull();
    expect(trackLargeProjectsClicked).toHaveBeenCalledTimes(1);
  });

  // Owner, 2026-11-19: the CAD heading is just "CAD", with no Rhino compatible note.
  it('labels the CAD section plainly, with no Rhino note', () => {
    const el = renderDashboard();
    const cad = el.querySelector('section[aria-labelledby="dashboard-cad"]');
    expect(cad?.querySelector('h2')?.textContent).toBe('CAD');
    expect(el.textContent).not.toContain('Rhino compatible');
  });

  it('gives every workflow card a Continue action and Done For You its own', () => {
    const el = renderDashboard();

    const continueButtons = Array.from(el.querySelectorAll('button')).filter((node) =>
      node.textContent?.includes('Continue'),
    );
    expect(continueButtons).toHaveLength(7);
    const callButtons = Array.from(el.querySelectorAll('button')).filter((node) => node.textContent?.includes('Call our AI'));
    expect(callButtons).toHaveLength(1);
  });

  it('puts Product Shot from CAD under Photography', () => {
    const el = renderDashboard();
    const photography = el.querySelector('section[aria-labelledby="dashboard-photography"]');
    expect(photography?.textContent).toContain('Product Shot from CAD');
    expect(el.querySelector('section[aria-labelledby="dashboard-cad"]')?.textContent).not.toContain('Product Shot from CAD');
  });

  it('sends CAD from Text and CAD from Doodle straight to their own input', () => {
    const el = renderDashboard();
    const cad = el.querySelector('section[aria-labelledby="dashboard-cad"]');
    expect(cad?.querySelectorAll('h3')).toHaveLength(4);
    expect(cad?.textContent).toContain('CAD from Text');
    expect(cad?.textContent).toContain('CAD from Doodle');
  });
});
