import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowSummary } from '@/lib/generation-history-api';

vi.mock('./ScissorGLBGrid', () => ({
  GLBPreviewSlot: () => <div data-testid="glb-preview" />,
}));
vi.mock('./SnapshotPreviewModal', () => ({ SnapshotPreviewModal: () => null }));
vi.mock('./PhotoCard', () => ({ PhotoCard: () => null }));
vi.mock('@/lib/generation-history-api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/generation-history-api')>('@/lib/generation-history-api');
  return { ...actual, fetchCadResult: vi.fn() };
});
vi.mock('./cad-artifact-download', async () => {
  const actual = await vi.importActual<typeof import('./cad-artifact-download')>('./cad-artifact-download');
  return { ...actual, downloadCadArtifact: vi.fn() };
});

import { WorkflowCard } from './WorkflowCard';
import { fetchCadResult } from '@/lib/generation-history-api';
import { downloadCadArtifact } from './cad-artifact-download';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.mocked(fetchCadResult).mockResolvedValue({
    glb_url: '/fresh/preview-glb',
    threedm_url: '/fresh/manufacturing-3dm',
    azure_source: null,
  });
});

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
  output_asset_id: 'asset-1',
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
      'Download .3dm',
      'Open in Studio',
    ]);

    const threedm = screen.getByRole('button', { name: 'Download .3dm' });
    const studio = screen.getByRole('button', { name: 'Open in Studio' });
    // Sibling actions match in height and width rather than one sitting
    // shorter than the other.
    expect(threedm.className).toContain('h-11');
    expect(studio.className).toContain('h-11');
    expect(threedm.className).toContain('w-full');
    expect(studio.className).toContain('w-full');
    // Secondary, but still legible: not washed out to muted.
    expect(studio.className).toContain('text-foreground');
    expect(screen.getByRole('region', { name: 'Manufacturing deliverable' })).toBeTruthy();
    expect(screen.getByText('Native Rhino 3DM')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Export GLB' })).toBeNull();
  });

  it('uses an extension-free design name for the 3DM filename', () => {
    render(
      <MemoryRouter>
        <WorkflowCard workflow={cadWorkflow} index={1} onClick={() => {}} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Design name')).toBeTruthy();
    expect(screen.getByText('ring.3dm')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Rename design' }));
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('ring');
    expect(screen.queryByText('.glb')).toBeNull();
  });

  it('renames the 3DM file locally without an output asset id', () => {
    render(
      <MemoryRouter>
        <WorkflowCard workflow={{ ...cadWorkflow, output_asset_id: null }} index={1} onClick={() => {}} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Rename design' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Customer Ring' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save design name' }));

    expect(screen.getByText('Customer Ring.3dm')).toBeTruthy();
  });

  it('downloads the refreshed 3DM URL with the renamed 3DM filename and type', async () => {
    render(
      <MemoryRouter>
        <WorkflowCard workflow={{ ...cadWorkflow, output_asset_id: null }} index={1} onClick={() => {}} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Rename design' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Customer Ring' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save design name' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download .3dm' }));

    await waitFor(() => expect(downloadCadArtifact).toHaveBeenCalledWith(
      '/fresh/manufacturing-3dm',
      'Customer Ring.3dm',
      '3dm',
    ));
  });

  it('falls back to the cached 3DM URL when the fresh result fetch times out', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(fetchCadResult).mockReturnValue(new Promise(() => {})); // never resolves
      render(
        <MemoryRouter>
          <WorkflowCard workflow={cadWorkflow} index={1} onClick={() => {}} />
        </MemoryRouter>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Download .3dm' }));
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });

      expect(downloadCadArtifact).toHaveBeenCalledWith('/api/artifacts/3dm', 'ring.3dm', '3dm');
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries with the cached 3DM URL when the fresh URL download fails', async () => {
    vi.mocked(downloadCadArtifact).mockImplementation(async (url) => {
      if (url === '/fresh/manufacturing-3dm') throw new Error('bad file');
    });

    render(
      <MemoryRouter>
        <WorkflowCard workflow={cadWorkflow} index={1} onClick={() => {}} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Download .3dm' }));

    await waitFor(() => expect(downloadCadArtifact).toHaveBeenCalledWith('/api/artifacts/3dm', 'ring.3dm', '3dm'));
    expect(downloadCadArtifact).toHaveBeenNthCalledWith(1, '/fresh/manufacturing-3dm', 'ring.3dm', '3dm');
  });

  it('shows credits used explicitly, including zero', () => {
    render(
      <MemoryRouter>
        <WorkflowCard workflow={{ ...cadWorkflow, credits_spent: 0 }} index={1} onClick={() => {}} />
      </MemoryRouter>,
    );

    expect(screen.getByText('0 credits used')).toBeTruthy();
  });
});
