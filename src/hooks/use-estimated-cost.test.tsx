import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuthFetch = vi.hoisted(() => vi.fn());

vi.mock('@/lib/authenticated-fetch', () => ({
  authenticatedFetch: mockAuthFetch,
}));

import { useEstimatedCost } from './use-estimated-cost';

function okJson(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

describe('useEstimatedCost', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    mockAuthFetch.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('sends the backend estimate body shape without pricing context', async () => {
    mockAuthFetch.mockResolvedValueOnce(okJson({ projected_max_hold: 85 }));

    function Harness() {
      useEstimatedCost({ workflowName: 'ring_generate_v1', model: 'claude-opus' });
      return null;
    }

    await act(async () => {
      root.render(<Harness />);
    });

    expect(mockAuthFetch).toHaveBeenCalledWith('/api/credits/estimate', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflow_name: 'ring_generate_v1',
        num_variations: 1,
      }),
    }));

    const estimateBody = JSON.parse(mockAuthFetch.mock.calls[0][1].body);
    expect(estimateBody).toEqual({
      workflow_name: 'ring_generate_v1',
      num_variations: 1,
    });
    expect(estimateBody).not.toHaveProperty('pricing_context');
  });

  it('forwards pricing context when provided', async () => {
    mockAuthFetch.mockResolvedValueOnce(okJson({ projected_max_hold: 44 }));

    function Harness() {
      useEstimatedCost({
        workflowName: 'human_fix_photoshoot',
        pricingContext: {
          image_size: '4K',
          effort: 'high',
          shot_type: 'model_shot',
          workflow_id: 'wf-123',
          source_asset_id: 'asset-123',
        },
      });
      return null;
    }

    await act(async () => {
      root.render(<Harness />);
    });

    const estimateBody = JSON.parse(mockAuthFetch.mock.calls[0][1].body);
    expect(estimateBody).toEqual({
      workflow_name: 'human_fix_photoshoot',
      num_variations: 1,
      pricing_context: {
        image_size: '4K',
        effort: 'high',
        shot_type: 'model_shot',
        workflow_id: 'wf-123',
        source_asset_id: 'asset-123',
      },
    });
  });
});
