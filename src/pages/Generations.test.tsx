import React from 'react';
import '@testing-library/jest-dom/vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowSummary } from '@/lib/generation-history-api';

vi.mock('react-helmet-async', () => ({ Helmet: () => null }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
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
