import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const authFetch = vi.hoisted(() => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/authenticated-fetch', () => authFetch);
vi.mock('@/components/generations/ScissorGLBGrid', () => ({
  ScissorGLBGrid: () => <div />,
  GLBPreviewSlot: () => <div />,
}));

import { DetailContent } from './AdminGenerationDetailPage';
import type { AdminGenerationDetail } from '@/lib/admin-generations-api';

function generation(workflowName: string): AdminGenerationDetail {
  return {
    workflow_id: 'wf-1',
    workflow_name: workflowName,
    status: 'running',
    user_email: 'a@b.co',
    user_type: null,
    is_paying: false,
    created_at: '2026-10-24T10:00:00Z',
    finished_at: null,
    actual_cost: null,
    total_provider_cost: null,
    input_payload: { prompt: 'a ring', llm_tier: 'gpt_6_astra_openai', analysis_tier: null },
    steps: [],
    feedback: null,
  };
}

function renderDetail(detail: AdminGenerationDetail) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><DetailContent detail={detail} /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AdminGenerationDetailPage AI block', () => {
  beforeEach(() => authFetch.authenticatedFetch.mockReset());

  it('shows the submitted AI and the one applied at Start for a supervised run', async () => {
    authFetch.authenticatedFetch.mockResolvedValue(new Response(JSON.stringify({
      supervision: { tiers: { llm_tier: 'gpt_6_astra_pro_openrouter', analysis_tier: null } },
    }), { status: 200 }));
    renderDetail(generation('jewelry_cad_generate'));
    expect((await screen.findByText(/^Applied at Start/)).textContent)
      .toBe('Applied at Start: Build AI GPT-6 Astra Pro · OpenRouter · Review AI Default');
    expect(screen.getByText(/^Submitted/).textContent)
      .toBe('Submitted: Build AI GPT-6 Astra · Direct API · Review AI Default');
    fireEvent.click(screen.getByRole('button', { name: 'Input Payload' }));
    expect(await screen.findByText(/Raw JSON shows the submitted request/)).toBeTruthy();
    expect(String(authFetch.authenticatedFetch.mock.calls[0][0])).toContain('/wf-1');
  });

  it('shows only Submitted when the run is not supervised', async () => {
    authFetch.authenticatedFetch.mockResolvedValue(new Response(JSON.stringify({ detail: 'Not found' }), { status: 404 }));
    renderDetail(generation('jewelry_cad_generate'));
    expect(await screen.findByText(/^Submitted/)).toBeTruthy();
    await waitFor(() => expect(authFetch.authenticatedFetch).toHaveBeenCalled());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(screen.queryByText(/^Applied at Start/)).toBeNull();
  });

  it('does not look up or show the block for non-CAD generations', () => {
    renderDetail(generation('some_image_workflow'));
    expect(authFetch.authenticatedFetch).not.toHaveBeenCalled();
    expect(screen.queryByText(/^Submitted/)).toBeNull();
  });
});
