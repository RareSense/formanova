import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { GenerationIndicator, isNavLinkActivePath } from './Header';

const mockGenerations = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock('@/contexts/GenerationsContext', () => ({
  useGenerations: () => ({ generations: mockGenerations.list }),
  buildCadRestorePath: vi.fn(),
}));

const running = (extra: Record<string, unknown> = {}) => ({
  workflowId: 'w1',
  kind: 'cad',
  status: 'running',
  ...extra,
});

function renderPill() {
  return render(
    <MemoryRouter>
      <GenerationIndicator />
    </MemoryRouter>,
  );
}

describe('GenerationIndicator', () => {
  it('shows a calm In queue pill, with no spinner, when every running run is supervised CAD', () => {
    mockGenerations.list = [running({ supervised: true })];
    const { container } = renderPill();
    expect(screen.getByText('In queue')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'In queue' })).toBeTruthy();
    expect(container.querySelector('.animate-spin')).toBeNull();
  });

  it('counts several supervised runs', () => {
    mockGenerations.list = [running({ supervised: true }), running({ workflowId: 'w2', supervised: true })];
    renderPill();
    expect(screen.getByText('2 in queue')).toBeTruthy();
  });

  it('keeps the spinning Generating pill for an ordinary running run', () => {
    mockGenerations.list = [running()];
    const { container } = renderPill();
    expect(screen.getByText('Generating…')).toBeTruthy();
    expect(container.querySelector('.animate-spin')).not.toBeNull();
  });

  it('keeps Generating when supervised and ordinary runs are mixed', () => {
    mockGenerations.list = [running({ supervised: true }), running({ workflowId: 'w2' })];
    renderPill();
    expect(screen.getByText('2 Generating…')).toBeTruthy();
  });
});

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
