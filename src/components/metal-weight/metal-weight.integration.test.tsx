/**
 * The result screen's weight surfaces, fed from one mocked version payload the
 * way the pages feed them: resolveMetalWeight picks the volume, useCadMetal
 * holds the page's one metal choice (shared with the Material panel's "All
 * metal parts"), and every surface must agree.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/posthog-events', () => ({ trackDownloadClicked: vi.fn() }));

import { CadDownloadMenu } from '@/components/downloads/CadDownloadMenu';
import { useCadMetal } from '@/hooks/useCadMetal';
import { metalWeightLine } from '@/lib/metal-weight/format';
import { resolveMetalWeight, type ShownVersionWeight } from '@/lib/metal-weight/source';
import { WeightCard } from './WeightCard';
import { WeightTag } from './WeightTag';

function ResultScreen({ version, applyMetalToAll }: { version: ShownVersionWeight; applyMetalToAll: (id: string) => void }) {
  const input = resolveMetalWeight({ shownVersion: version, workflowId: 'wf-1', resultVolumeMm3: null, resultMassG: null, sent: null });
  const { view, chooseLook } = useCadMetal(input, applyMetalToAll);
  return (
    <>
      <WeightCard {...view} />
      {/* Stands in for the Material panel's "All metal parts". */}
      <button type="button" onClick={() => chooseLook('gold-rose-polished')}>Rose Gold look</button>
      <CadDownloadMenu onDownloadGlb={() => {}} metalWeightLine={metalWeightLine(view.source, view.alloy)} />
      <div data-testid="tag"><WeightTag source={view.source} alloy={view.alloy} /></div>
    </>
  );
}

const VERSION: ShownVersionWeight = {
  asset_id: 'v1',
  source_workflow_id: 'wf-1',
  metal_volume_mm3: 2192.4,
  weight_target: { grams: 28, tolerance_pct: 5, alloy_id: 'au14y' },
};

const card = () => screen.getByRole('region', { name: 'Metal weight' });
const openDownloads = () => fireEvent.keyDown(screen.getByRole('button', { name: /^download$/i }), { key: 'Enter' });

function setup(version = VERSION) {
  const applyMetalToAll = vi.fn();
  render(<ResultScreen version={version} applyMetalToAll={applyMetalToAll} />);
  return { applyMetalToAll };
}

describe('metal weight on the result screen', () => {
  beforeEach(() => localStorage.clear());

  it('card, download line and tag agree for a version with metal_volume_mm3', async () => {
    setup();
    expect(within(card()).getByRole('radio', { name: '14K Yellow Gold' })).toBeChecked();
    expect(within(card()).getByText('On target (−0.1%)')).toBeInTheDocument();
    expect(within(screen.getByTestId('tag')).getByText('28.0 g · 14K')).toBeInTheDocument();
    openDownloads();
    expect(await screen.findByText('Metal: 14K Yellow Gold · Est. 27.98 g · 17.99 dwt')).toBeInTheDocument();
  });

  it('picking a row moves every surface and the look, with no request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { applyMetalToAll } = setup();
    fireEvent.click(within(card()).getByRole('radio', { name: '18K Yellow Gold' }));

    expect(within(card()).getByRole('radio', { name: '18K Yellow Gold' })).toBeChecked();
    expect(within(card()).getByText('21.3% over in 18K Yellow Gold')).toBeInTheDocument();
    expect(within(screen.getByTestId('tag')).getByText('34.0 g · 18K')).toBeInTheDocument();
    expect(applyMetalToAll).toHaveBeenCalledWith('gold-yellow-polished');
    openDownloads();
    expect(await screen.findByText('Metal: 18K Yellow Gold · Est. 33.96 g · 21.84 dwt')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a look picked in the Material panel moves the weight to that colour, same karat', () => {
    const { applyMetalToAll } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Rose Gold look' }));
    expect(applyMetalToAll).toHaveBeenCalledWith('gold-rose-polished');
    // 14K Rose Gold is not a common-five row; the shown metal is listed anyway.
    expect(within(card()).getByRole('radio', { name: '14K Rose Gold' })).toBeChecked();
    expect(within(screen.getByTestId('tag')).getByText('28.9 g · 14K')).toBeInTheDocument();
  });

  it('an old version without a volume is not available anywhere, with no figures', async () => {
    setup({ asset_id: 'v0', source_workflow_id: 'wf-0' });
    expect(within(card()).getByText(/Weight not available for this model/)).toBeInTheDocument();
    expect(screen.getByTestId('tag')).toBeEmptyDOMElement();
    openDownloads();
    await screen.findByText('3D preview');
    expect(screen.queryByText(/^Metal:/)).toBeNull();
  });
});
