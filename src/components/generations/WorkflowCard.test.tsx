import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
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
vi.mock('@/lib/cad-artifact-download', async () => {
  const actual = await vi.importActual<typeof import('@/lib/cad-artifact-download')>('@/lib/cad-artifact-download');
  return { ...actual, downloadCadArtifact: vi.fn() };
});

import { WorkflowCard } from './WorkflowCard';
import { fetchCadResult } from '@/lib/generation-history-api';
import { downloadCadArtifact } from '@/lib/cad-artifact-download';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.mocked(fetchCadResult).mockResolvedValue({
    glb_url: '/fresh/preview-glb',
    threedm_url: '/fresh/manufacturing-3dm',
    azure_source: null,
    not_all_solid: false,
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

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function openInStudio(workflow: WorkflowSummary) {
  render(
    <MemoryRouter>
      <WorkflowCard workflow={workflow} index={1} onClick={() => {}} />
      <LocationProbe />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Open in Studio' }));
  return screen.getByTestId('location').textContent ?? '';
}

describe('CAD generation history card', () => {
  it('opens an image-to-cad run in the image workspace, not the text one', () => {
    // One card serves both CAD types, so the destination has to follow the
    // source. Sending an image run to /text-to-cad drops it in the wrong tool.
    const location = openInStudio({ ...cadWorkflow, source_type: 'image_to_cad' });

    expect(location.startsWith('/image-to-cad?')).toBe(true);
    expect(location).toContain('workflow_id=workflow-1');
  });

  it('opens a text-to-cad run in the text workspace', () => {
    const location = openInStudio({ ...cadWorkflow, source_type: 'text_to_cad' });

    expect(location.startsWith('/text-to-cad?')).toBe(true);
    expect(location).toContain('workflow_id=workflow-1');
  });

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
    ]);

    const threedm = screen.getByRole('button', { name: 'Download 3DM' });
    const studio = screen.getByRole('button', { name: 'Open in Studio' });
    // Sibling actions match in height and width rather than one sitting
    // shorter than the other.
    expect(threedm.className).toContain('h-11');
    expect(studio.className).toContain('h-11');
    expect(threedm.className).toContain('w-full');
    expect(studio.className).toContain('w-full');
    // One filled action, not two. The original rule here was that two solid
    // blocks under the preview compete with the ring for attention, which
    // still holds, but leaving both outlined made the download invisible in
    // dark mode: a 20%-lightness border on a 5%-lightness card. Promoting
    // only the download gives one clear primary action and keeps the pair
    // from competing.
    expect(threedm.className).toContain('bg-primary');
    expect(threedm.className).toContain('text-primary-foreground');
    expect(studio.className).toContain('border-border');
    expect(studio.className).toContain('bg-transparent');
    expect(studio.className).toContain('text-foreground');
    expect(studio.className).not.toContain('formanova-hero-accent');
    expect(screen.queryByRole('button', { name: 'Export GLB' })).toBeNull();
  });

  it('uses an extension-free design name for the 3DM filename', async () => {
    render(
      <MemoryRouter>
        <WorkflowCard workflow={cadWorkflow} index={1} onClick={() => {}} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Design name')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Rename design' }));
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('ring');
    expect(screen.queryByText('.glb')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Download 3DM' }));
    await waitFor(() => expect(downloadCadArtifact).toHaveBeenCalledWith(
      expect.any(String),
      'ring.3dm',
      '3dm',
    ));
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
    fireEvent.click(screen.getByRole('button', { name: 'Download 3DM' }));

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

      fireEvent.click(screen.getByRole('button', { name: 'Download 3DM' }));
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

    fireEvent.click(screen.getByRole('button', { name: 'Download 3DM' }));

    await waitFor(() => expect(downloadCadArtifact).toHaveBeenCalledWith('/api/artifacts/3dm', 'ring.3dm', '3dm'));
    expect(downloadCadArtifact).toHaveBeenNthCalledWith(1, '/fresh/manufacturing-3dm', 'ring.3dm', '3dm');
  });

  it('shows the figure alone, and still announces it in full', () => {
    render(
      <MemoryRouter>
        <WorkflowCard workflow={{ ...cadWorkflow, credits_spent: 0 }} index={1} onClick={() => {}} />
      </MemoryRouter>,
    );

    // Coin and number only, matching the photo cards. Zero is shown rather
    // than hidden, since a free run and an unknown one are different things.
    expect(screen.getByText('0')).toBeTruthy();
    expect(screen.queryByText('0 credits used')).toBeNull();
    expect(screen.getByLabelText('0 credits used')).toBeTruthy();
  });
});
