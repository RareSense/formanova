import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { WorkflowSummary } from '@/lib/generation-history-api';

vi.mock('./ScissorGLBGrid', () => ({
  GLBPreviewSlot: () => <div data-testid="glb-preview" />,
}));
vi.mock('./SnapshotPreviewModal', () => ({ SnapshotPreviewModal: () => null }));
vi.mock('./PhotoCard', () => ({ PhotoCard: () => null }));

import { WorkflowCard } from './WorkflowCard';

const cadWorkflow: WorkflowSummary = {
  workflow_id: 'workflow-1',
  name: 'ring_cad_nurbs_v1',
  status: 'completed',
  created_at: '2026-08-18T14:05:00+0500',
  finished_at: '2026-08-18T14:06:00+0500',
  source_type: 'image_to_cad',
  screenshots: [],
  glb_url: '/api/artifacts/glb',
  glb_filename: 'ring.glb',
  threedm_url: '/api/artifacts/3dm',
  mode: 'INTERNAL_MODE_SENTINEL',
  ai_model: 'INTERNAL_PROVIDER_SENTINEL',
};

describe('CAD generation history card', () => {
  it('does not expose internal mode or provider values', () => {
    render(
      <MemoryRouter>
        <WorkflowCard workflow={cadWorkflow} index={1} onClick={() => {}} />
      </MemoryRouter>,
    );

    expect(screen.queryByText('INTERNAL_MODE_SENTINEL')).toBeNull();
    expect(screen.queryByText('INTERNAL_PROVIDER_SENTINEL')).toBeNull();
  });

  it('presents explicit artifact actions in user-priority order', () => {
    render(
      <MemoryRouter>
        <WorkflowCard workflow={cadWorkflow} index={1} onClick={() => {}} />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole('button').map((button) => button.textContent?.trim()).filter(Boolean)).toEqual([
      'Download 3DM',
      'Open in Studio',
      'Export GLB',
    ]);
  });
});
