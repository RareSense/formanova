/**
 * The result screen's four weight surfaces, fed from one mocked version
 * payload the way the pages feed them: resolveMetalWeight picks the volume,
 * useMetalChoice picks the metal, and every surface must agree.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/posthog-events', () => ({ trackDownloadClicked: vi.fn() }));

import { CadDownloadMenu } from '@/components/downloads/CadDownloadMenu';
import { useMetalChoice } from '@/hooks/useMetalChoice';
import { metalWeightLine } from '@/lib/metal-weight/format';
import { resolveMetalWeight, type ShownVersionWeight } from '@/lib/metal-weight/source';
import { WeightBar } from './WeightBar';
import { WeightCard } from './WeightCard';
import { WeightTag } from './WeightTag';

function ResultScreen({ version }: { version: ShownVersionWeight }) {
  const input = resolveMetalWeight({ shownVersion: version, workflowId: 'wf-1', resultVolumeMm3: null, resultMassG: null, sent: null });
  const metal = useMetalChoice(input);
  const view = { source: input.source, target: input.target, ...metal };
  return (
    <>
      <WeightBar {...view} />
      <WeightCard {...view} />
      <CadDownloadMenu onDownloadGlb={() => {}} metalWeightLine={metalWeightLine(view.source, metal.alloy)} />
      <div data-testid="tag"><WeightTag source={view.source} alloy={metal.alloy} /></div>
    </>
  );
}

const VERSION: ShownVersionWeight = {
  asset_id: 'v1',
  source_workflow_id: 'wf-1',
  metal_volume_mm3: 2192.4,
  weight_target: { grams: 28, tolerance_pct: 5, alloy_id: 'au14y' },
};

const bar = () => screen.getByRole('group', { name: 'Metal weight' });
const card = () => screen.getByRole('region', { name: 'Metal weight' });
const openDownloads = () => fireEvent.keyDown(screen.getByRole('button', { name: /^download$/i }), { key: 'Enter' });

describe('metal weight on the result screen', () => {
  beforeEach(() => localStorage.clear());

  it('bar, card, download line and tag agree for a version with metal_volume_mm3', async () => {
    render(<ResultScreen version={VERSION} />);
    expect(within(bar()).getByText('27.98 g · 17.99 dwt')).toBeInTheDocument();
    expect(within(bar()).getByText('On target −0.1%')).toBeInTheDocument();
    expect(within(card()).getByText('17.99 dwt · 14K Yellow Gold')).toBeInTheDocument();
    expect(within(card()).getByText('On target −0.1%')).toBeInTheDocument();
    expect(within(screen.getByTestId('tag')).getByText('28.0 g · 14K')).toBeInTheDocument();
    openDownloads();
    expect(await screen.findByText('Metal: 14K Yellow Gold · Est. 27.98 g · 17.99 dwt')).toBeInTheDocument();
  });

  it('switching metal in the bar moves every surface, with no request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<ResultScreen version={VERSION} />);
    fireEvent.change(within(bar()).getByRole('combobox', { name: 'Metal' }), { target: { value: 'au18y' } });

    expect(within(bar()).getByText('33.96 g · 21.84 dwt')).toBeInTheDocument();
    expect(within(bar()).getByText('21.3% over in 18K Yellow Gold')).toBeInTheDocument();
    expect(within(card()).getByRole('button', { name: '18K Yellow Gold' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(card()).getByText('≈ 32.26 g after finishing (−5%)')).toBeInTheDocument();
    expect(within(screen.getByTestId('tag')).getByText('34.0 g · 18K')).toBeInTheDocument();
    openDownloads();
    expect(await screen.findByText('Metal: 18K Yellow Gold · Est. 33.96 g · 21.84 dwt')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a chip in the card moves the bar too', () => {
    render(<ResultScreen version={VERSION} />);
    fireEvent.click(within(card()).getByRole('button', { name: 'Sterling Silver 925' }));
    expect(within(bar()).getByRole('combobox', { name: 'Metal' })).toHaveValue('ag925');
    expect(within(bar()).getByText('22.71 g · 14.60 dwt')).toBeInTheDocument();
  });

  it('an old version without a volume is not available anywhere, with no figures', async () => {
    render(<ResultScreen version={{ asset_id: 'v0', source_workflow_id: 'wf-0' }} />);
    expect(within(bar()).getByText(/Weight not available for this model/)).toBeInTheDocument();
    expect(within(card()).getByText(/Weight not available for this model/)).toBeInTheDocument();
    expect(screen.getByTestId('tag')).toBeEmptyDOMElement();
    openDownloads();
    await screen.findByText('3D preview');
    expect(screen.queryByText(/^Metal:/)).toBeNull();
  });
});
