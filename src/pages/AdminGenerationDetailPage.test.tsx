import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    fireEvent.click(screen.getByRole('button', { name: 'Input payload' }));
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

describe('AdminGenerationDetailPage customer prompt', () => {
  beforeEach(() => {
    authFetch.authenticatedFetch.mockReset();
    authFetch.authenticatedFetch.mockResolvedValue(new Response(JSON.stringify({ detail: 'Not found' }), { status: 404 }));
  });

  function cadRun(prompt: string): AdminGenerationDetail {
    return {
      ...generation('jewelry_cad_generate'),
      input_payload: {
        prompt,
        client_flow: 'image',
        image_artifact: 'https://example.com/uploads/ring-photo.png',
        llm_tier: null,
        analysis_tier: null,
      },
    };
  }

  function inputsGroup(): HTMLElement {
    return screen.getByRole('group', { name: 'Inputs' });
  }

  it('renders the prompt right after the input images, inside the Inputs part of the strip', () => {
    renderDetail(cadRun('a twisted gold band with a small oval diamond'));
    const group = inputsGroup();
    const prompt = within(group).getByTestId('admin-io-prompt');
    expect(prompt.textContent).toContain('a twisted gold band with a small oval diamond');
    const image = within(group).getByRole('figure');
    // The prompt follows the input image in document order, and is the group's last block.
    expect(image.compareDocumentPosition(prompt) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(group.lastElementChild).toBe(prompt);
    // Not in the Outputs part.
    expect(within(screen.getByRole('group', { name: 'Outputs' })).queryByTestId('admin-io-prompt')).toBeNull();
  });

  it('shows the prompt only once: not again in the Input payload section, raw JSON kept', () => {
    renderDetail(cadRun('a twisted gold band with a small oval diamond'));
    fireEvent.click(screen.getByRole('button', { name: 'Input payload' }));
    const payload = screen.getByRole('region', { name: 'Input payload' });
    expect(within(payload).getByText('Client flow')).toBeTruthy();
    expect(within(payload).queryByText('a twisted gold band with a small oval diamond')).toBeNull();
    expect(screen.getAllByText('a twisted gold band with a small oval diamond')).toHaveLength(1);
    fireEvent.click(within(payload).getByRole('button', { name: /Raw JSON/ }));
    expect(within(payload).getByText(/a twisted gold band with a small oval diamond/)).toBeTruthy();
  });

  it('clamps a long prompt to a few lines with a more / less toggle', () => {
    const long = `${'a very long description of the ring '.repeat(12)}end`;
    renderDetail(cadRun(long));
    const text = within(inputsGroup()).getByTestId('admin-io-prompt-text');
    expect(text.className).toContain('line-clamp-3');
    fireEvent.click(within(inputsGroup()).getByRole('button', { name: 'more' }));
    expect(text.className).not.toContain('line-clamp-3');
    fireEvent.click(within(inputsGroup()).getByRole('button', { name: 'less' }));
    expect(text.className).toContain('line-clamp-3');
  });

  it('has no toggle for a short prompt and no prompt block when there is none', () => {
    const { unmount } = renderDetail(cadRun('a ring'));
    expect(within(inputsGroup()).queryByRole('button', { name: 'more' })).toBeNull();
    unmount();
    renderDetail(generation('some_image_workflow'));
    expect(screen.queryByTestId('admin-io-prompt')).toBeNull();
  });
});
