import React from 'react';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowSummary } from '@/lib/generation-history-api';

vi.mock('react-helmet-async', () => ({ Helmet: () => null }));
// One user object for the whole test, as the real context keeps it between renders.
const authState = vi.hoisted(() => ({ user: { id: 'user-1' } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('@/lib/generation-history-api', () => ({
  listAllMyWorkflows: vi.fn(),
  getWorkflowDetails: vi.fn(),
  fetchWorkflowCreditAudit: vi.fn(async () => 0),
  fetchCadResult: vi.fn(async () => null),
}));
vi.mock('@/lib/assets-api', () => ({
  fetchUserAssets: vi.fn(async () => ({ items: [] })),
  getAssetDisplayName: () => null,
}));
vi.mock('@/lib/cad-versions-api', () => ({ fetchCadRings: vi.fn(async () => []) }));
// The cards themselves are tested elsewhere; here only what the page hands them matters.
vi.mock('@/components/generations/WorkflowSection', () => ({
  SectionIcons: {},
  WorkflowSection: ({ workflows }: { workflows: WorkflowSummary[] }) => (
    <>
      {workflows.map((w) => (
        <div
          key={w.workflow_id}
          data-testid={`row-${w.workflow_id}`}
          data-glb={w.glb_url ?? ''}
          data-thumbnail={w.thumbnail_url ?? ''}
        />
      ))}
    </>
  ),
}));
vi.mock('@/components/generations/ScissorGLBGrid', () => ({
  ScissorGLBGrid: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/cad/CADRuntimeErrorBoundary', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import Generations from './Generations';
import { fetchCadResult, getWorkflowDetails, listAllMyWorkflows } from '@/lib/generation-history-api';
import { fetchCadRings } from '@/lib/cad-versions-api';

function cadRow(overrides: Partial<WorkflowSummary>): WorkflowSummary {
  return {
    workflow_id: 'wf-1',
    name: 'jewelry_cad',
    status: 'completed',
    created_at: '2026-10-20T10:00:00Z',
    finished_at: null,
    source_type: 'image_to_cad',
    client_flow: 'image',
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <Generations />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  // Supervised runs report no steps from history details.
  vi.mocked(getWorkflowDetails).mockResolvedValue({ steps: [] } as never);
});

describe('Generations: /result is only asked about finished runs', () => {
  it('never asks /result about a CAD run that is still running', async () => {
    vi.mocked(listAllMyWorkflows).mockResolvedValue([
      cadRow({ workflow_id: 'wf-running', status: 'running' }),
      cadRow({ workflow_id: 'wf-done', status: 'completed' }),
    ]);
    renderPage();

    // The finished run is enriched; the running one must not be asked about.
    await waitFor(() => expect(fetchCadResult).toHaveBeenCalledWith('wf-done'));
    expect(fetchCadResult).not.toHaveBeenCalledWith('wf-running');
  });
});

describe('Generations: supervised runs', () => {
  it("shows the delivered version's model and thumbnail when the run has no steps", async () => {
    vi.mocked(listAllMyWorkflows).mockResolvedValue([
      cadRow({ workflow_id: 'wf-supervised', output_asset_id: 'asset-delivered' }),
    ]);
    vi.mocked(fetchCadRings).mockResolvedValue([
      {
        set_id: 'set-1',
        versions: [{
          asset_id: 'asset-delivered',
          position: 0,
          source_workflow_id: 'wf-admin',
          glb_url: '/api/artifacts/delivered-glb',
          thumbnail_url: '/api/artifacts/delivered-thumb',
        }],
      },
    ]);
    renderPage();

    const row = await screen.findByTestId('row-wf-supervised');
    await waitFor(() => expect(row).toHaveAttribute('data-glb', '/api/artifacts/delivered-glb'));
    expect(row).toHaveAttribute('data-thumbnail', '/api/artifacts/delivered-thumb');
    // The vault already answered, so /result is not asked as well.
    expect(fetchCadResult).not.toHaveBeenCalled();
    // The vault is read once per page load, never per card.
    expect(fetchCadRings).toHaveBeenCalledTimes(1);
  });
});
