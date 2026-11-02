/**
 * Metal weight against real pieces, end to end inside the app's own code.
 *
 * Only the network is faked: authenticatedFetch answers the start, vault and
 * download calls, and GenerationsContext (the app's poller) is stubbed to hand
 * back a finished run, as the workflow hook's own tests do. Everything between
 * the request form and the numbers on screen is the real code.
 *
 * Volumes are measured casting volumes from real FormaNova pieces:
 *   crest  2192.4 mm³ (casting body union)
 *   oval   228.49 mm³ (oval ring build report)
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { useMemo, useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const checkCredits = vi.hoisted(() => vi.fn(async () => true));
vi.mock('@/hooks/use-credit-preflight', () => ({ useCreditPreflight: () => ({ checkCredits }) }));
const generationsState = vi.hoisted(() => ({ generations: [] as unknown[] }));
vi.mock('@/contexts/GenerationsContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/contexts/GenerationsContext')>();
  return { ...actual, useGenerations: () => ({ generations: generationsState.generations, trackCadGeneration: vi.fn() }) };
});
vi.mock('@/lib/authenticated-fetch', () => ({
  authenticatedFetch: vi.fn(),
  AuthExpiredError: class AuthExpiredError extends Error {},
}));
vi.mock('@/lib/cad-reference-upload', () => ({ buildReferenceInputs: vi.fn(async () => []) }));
vi.mock('@/lib/posthog-events', () => ({
  trackPaywallHit: vi.fn(),
  trackCadGenerationStarted: vi.fn(),
  trackCadGenerationFailed: vi.fn(),
  trackCadImproveRequested: vi.fn(),
  trackCadResultRestored: vi.fn(),
  trackDownloadClicked: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock('@/components/generations/ScissorGLBGrid', () => ({ GLBPreviewSlot: () => <div data-testid="glb-preview" /> }));
vi.mock('@/components/generations/SnapshotPreviewModal', () => ({ SnapshotPreviewModal: () => null }));

import { CadDownloadMenu } from '@/components/downloads/CadDownloadMenu';
import { WorkflowCard } from '@/components/generations/WorkflowCard';
import MeshPanel from '@/components/text-to-cad/MeshPanel';
import { useCadMetal } from '@/hooks/useCadMetal';
import { useImageToCADWorkflow } from '@/hooks/useImageToCADWorkflow';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import type { CadRingVersion } from '@/lib/cad-versions-api';
import type { WorkflowSummary } from '@/lib/generation-history-api';
import { METAL_ALLOYS } from '@/lib/metal-weight/alloys';
import { metalWeightLine } from '@/lib/metal-weight/format';
import { EMPTY_METAL_REQUEST, metalRequestPayload, type MetalRequest } from '@/lib/metal-weight/request';
import { resolveMetalWeight, type ShownVersionWeight } from '@/lib/metal-weight/source';
import { METAL_CHOICE_STORAGE_KEY } from '@/hooks/useMetalChoice';
import { MetalWeightStep } from './MetalWeightStep';
import { WeightCard } from './WeightCard';

// Whole-app renders (Radix menus, 21-row tables): give them room under full-suite load.
vi.setConfig({ testTimeout: 20_000 });

const CREST_MM3 = 2192.4;
const OVAL_MM3 = 228.49;
const GRAMS_PER_DWT = 1.55517384;
const GLB = `/api/artifacts/${'c'.repeat(64)}`;

const mockFetch = vi.mocked(authenticatedFetch);
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
const startCalls = () => mockFetch.mock.calls.filter(([url]) => String(url).startsWith('/api/run/state/'));

beforeAll(() => {
  // Radix Select needs these in jsdom.
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
});

beforeEach(() => {
  localStorage.clear();
  generationsState.generations = [];
  mockFetch.mockReset();
});

const card = () => screen.getByRole('region', { name: 'Metal weight' });
const rowCells = (label: string) =>
  within(within(card()).getByRole('radio', { name: label }).closest('tr') as HTMLElement)
    .getAllByRole('cell').slice(1).map((c) => c.textContent);
const openDownloads = () => fireEvent.keyDown(screen.getByRole('button', { name: /^download$/i }), { key: 'Enter' });

/** The card and download line for one version, the way the result page wires them. */
function VersionScreen({ version, applyLook = () => {} }: { version: ShownVersionWeight; applyLook?: (id: string) => void }) {
  const input = resolveMetalWeight({ shownVersion: version, workflowId: null, resultVolumeMm3: null, resultMassG: null, sent: null });
  const { view } = useCadMetal(input, applyLook);
  return (
    <>
      <WeightCard {...view} />
      <CadDownloadMenu onDownloadGlb={() => {}} metalWeightLine={metalWeightLine(view.source, view.alloy)} />
    </>
  );
}

describe('real pieces: every cited alloy', () => {
  it.each([
    ['crest', CREST_MM3],
    ['oval ring', OVAL_MM3],
  ])('%s: shown g = volume × cited density ÷ 1000 and dwt = g ÷ 1.55517384, for all 21 alloys', (_name, volume) => {
    render(<VersionScreen version={{ asset_id: 'v', metal_volume_mm3: volume }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show all metals' }));
    for (const alloy of METAL_ALLOYS) {
      const grams = (volume * Number(alloy.density_cited)) / 1000;
      expect(rowCells(alloy.label), alloy.id).toEqual([
        grams.toFixed(2),
        (grams / GRAMS_PER_DWT).toFixed(2),
        (grams * 0.95).toFixed(2),
      ]);
    }
  });

  it('crest in 10K is 24.64 g: UPMR 204 at 11.24 g/cm³, not the old 11.57', () => {
    // The spec's example "25.37 g · 16.31 dwt" is this crest at 11.57 g/cm³,
    // the density the table used before it moved to the UPMR 204 data sheet
    // (11.24). 25.37 g is therefore wrong for our 10K and must not come back.
    render(<VersionScreen version={{ asset_id: 'v', metal_volume_mm3: CREST_MM3 }} />);
    expect(rowCells('10K Yellow Gold')).toEqual(['24.64', '15.85', '23.41']);
    expect(rowCells('10K Yellow Gold')[0]).not.toBe('25.37');
  });
});

/** The request form and the result screen, around the real workflow hook. */
function Studio({ applyLook }: { applyLook: (id: string) => void }) {
  const [request, setRequest] = useState<MetalRequest>(EMPTY_METAL_REQUEST);
  const payload = useMemo(() => metalRequestPayload(request), [request]);
  const workflow = useImageToCADWorkflow({
    model: 'gemini', prompt: 'an oval ring', referenceImages: [], cadRoute: '/text-to-cad',
    onWorkspaceActivate: () => {}, material: payload.material, weightTarget: payload.weightTarget,
  });
  const { view } = useCadMetal(workflow.metalWeight, applyLook);
  return (
    <>
      <MetalWeightStep value={request} onChange={setRequest} />
      <button type="button" onClick={() => { void workflow.simulateGeneration(); }}>Generate CAD</button>
      {workflow.hasModel && (
        <>
          <WeightCard {...view} />
          <CadDownloadMenu onDownloadGlb={() => {}} metalWeightLine={metalWeightLine(view.source, view.alloy)} />
        </>
      )}
    </>
  );
}

async function chooseRequestMetal(name: string) {
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Metal' }), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('option', { name }));
}

/** Answers the start call, then the vault with `versions`. */
function backend(workflowId: string, versions: CadRingVersion[]) {
  mockFetch.mockImplementation(async (url) => {
    const path = String(url);
    if (path.startsWith('/api/run/state/')) return json({ workflow_id: workflowId });
    if (path.startsWith('/api/cad/models')) return json({ items: [{ set_id: 'set-1', versions }] });
    return json({}, 404);
  });
}

/** GenerationsContext reporting the run finished, with this result. */
function finishRun(workflowId: string, result: { metalVolumeMm3?: number | null; estimatedMetalMassG?: number | null }) {
  generationsState.generations = [{
    workflowId, kind: 'cad', status: 'completed', generationStep: 'Completed', glbUrl: GLB,
    threedmUrl: null, stlUrls: [], stepUrls: [], notAllSolid: false, ...result,
  }];
}

describe('request → result round trip', () => {
  const target = { grams: 25, tolerance_pct: 5, alloy_id: 'au14y' };
  const version: CadRingVersion = {
    asset_id: 'v1', position: 0, source_workflow_id: 'wf-rt', glb_url: GLB,
    metal_volume_mm3: CREST_MM3, weight_target: target,
  };

  it('sends 14K Yellow 25 g ±5%, then shows identical numbers in the table, status, download line and history tag', async () => {
    backend('wf-rt', [version]);
    const { rerender } = render(<Studio applyLook={vi.fn()} />);

    await chooseRequestMetal('14K Yellow Gold');
    fireEvent.change(screen.getByLabelText('Target weight'), { target: { value: '25' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Generate CAD' })); });

    expect(startCalls()).toHaveLength(1);
    const body = JSON.parse(String(startCalls()[0][1]?.body));
    // The material block keeps exactly its three keys.
    expect(body.payload.material).toEqual({
      alloy: '14K Yellow Gold',
      density_g_cm3: 12.76,
      density_source: 'UPMR 204 Standard Yellow: https://www.unitedpmr.com/wp-content/uploads/2021/07/204.pdf',
    });
    expect(body.payload.weight_target).toEqual(target);

    finishRun('wf-rt', { metalVolumeMm3: CREST_MM3, estimatedMetalMassG: 27.975024 });
    rerender(<Studio applyLook={vi.fn()} />);

    await waitFor(() => expect(within(card()).getByRole('radio', { name: '14K Yellow Gold' })).toBeChecked());
    expect(rowCells('14K Yellow Gold')).toEqual(['27.98', '17.99', '26.58']);
    expect(within(card()).getByText('11.9% over')).toBeInTheDocument();
    expect(within(card()).getByRole('button', { name: /metal weight/i })).toHaveTextContent('Target 25.00 g ±5%');
    openDownloads();
    expect(await screen.findByText('Metal: 14K Yellow Gold · Est. 27.98 g · 17.99 dwt')).toBeInTheDocument();

    // The history card for the same version: the tag is 1 dp by design, its
    // tooltip carries the same 2 dp figures as the table and download line.
    render(
      <MemoryRouter>
        <WorkflowCard
          workflow={{
            workflow_id: 'wf-rt', name: 'ring_cad_nurbs_v1', status: 'completed', source_type: 'text_to_cad',
            created_at: '2026-11-02T10:00:00Z', screenshots: [], glb_url: GLB,
            ring_versions: [{ assetId: 'v1', position: 0, workflowId: 'wf-rt', thumbnailUrl: null, glbUrl: GLB }],
            cad_restore_seed: { ring: { set_id: 'set-1', versions: [version] }, selectedVersionId: 'v1' },
          } as unknown as WorkflowSummary}
        />
      </MemoryRouter>,
    );
    const tag = screen.getByText('28.0 g · 14K');
    expect(tag.closest('[title]')).toHaveAttribute('title', '27.98 g · 17.99 dwt, 14K Yellow Gold');
  });

  it('an old run with only estimated_metal_mass_g weighs from the mass and the density it was sent with', async () => {
    // The vault version predates metal_volume_mm3.
    backend('wf-old', [{ asset_id: 'v1', position: 0, source_workflow_id: 'wf-old', glb_url: GLB }]);
    const { rerender } = render(<Studio applyLook={vi.fn()} />);
    await chooseRequestMetal('10K Yellow Gold');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Generate CAD' })); });

    // The toolkit computed the crest's mass with the 10K density we sent.
    finishRun('wf-old', { metalVolumeMm3: null, estimatedMetalMassG: (CREST_MM3 * 11.24) / 1000 });
    rerender(<Studio applyLook={vi.fn()} />);

    await waitFor(() => expect(within(card()).getByRole('radio', { name: '10K Yellow Gold' })).toBeChecked());
    expect(rowCells('10K Yellow Gold')).toEqual(['24.64', '15.85', '23.41']);
    expect(rowCells('14K Yellow Gold')).toEqual(['27.98', '17.99', '26.58']);
  });
});

describe('legacy and edge paths', () => {
  it('a version without a volume is not available, with no download line', async () => {
    render(<VersionScreen version={{ asset_id: 'v0' }} />);
    expect(within(card()).getByText(/Weight not available for this model/)).toBeInTheDocument();
    openDownloads();
    await screen.findByText('3D preview');
    expect(screen.queryByText(/^Metal:/)).toBeNull();
  });

  it('a target in platinum_cobalt (no cited density) shows the default metal and says so', () => {
    render(<VersionScreen version={{ asset_id: 'v', metal_volume_mm3: CREST_MM3, weight_target: { grams: 28, tolerance_pct: 5, alloy_id: 'platinum_cobalt' } }} />);
    expect(within(card()).getByRole('radio', { name: '14K Yellow Gold' })).toBeChecked();
    expect(within(card()).getByText('Requested metal unavailable')).toBeInTheDocument();
  });

  it('a legacy target id resolves to its new alloy', () => {
    render(<VersionScreen version={{ asset_id: 'v', metal_volume_mm3: CREST_MM3, weight_target: { grams: 34, tolerance_pct: 5, alloy_id: '18k_yellow_gold' } }} />);
    expect(within(card()).getByRole('radio', { name: '18K Yellow Gold' })).toBeChecked();
    expect(within(card()).getByText('On target (−0.1%)')).toBeInTheDocument();
  });

  it('a two-tone version notes the total is in the chosen metal', () => {
    render(<VersionScreen version={{ asset_id: 'v', metal_volume_mm3: CREST_MM3, metal_body_count: 2 }} />);
    expect(within(card()).getByText('Two-tone: total of all metal parts, weighed in 14K Yellow Gold.')).toBeInTheDocument();
  });

  it('restores the stored pick for a version without a target', async () => {
    localStorage.setItem(METAL_CHOICE_STORAGE_KEY, 'au18y');
    render(<VersionScreen version={{ asset_id: 'v', metal_volume_mm3: CREST_MM3 }} />);
    expect(within(card()).getByRole('radio', { name: '18K Yellow Gold' })).toBeChecked();
    openDownloads();
    expect(await screen.findByText('Metal: 18K Yellow Gold · Est. 33.96 g · 21.84 dwt')).toBeInTheDocument();
  });

  it('the table and the Material panel are one choice: each moves the other', async () => {
    const applyLook = vi.fn();
    function Linked() {
      const input = resolveMetalWeight({ shownVersion: { asset_id: 'v', metal_volume_mm3: CREST_MM3 }, workflowId: null, resultVolumeMm3: null, resultMassG: null, sent: null });
      const { view, chooseLook } = useCadMetal(input, applyLook);
      return (
        <>
          <WeightCard {...view} />
          <MeshPanel
            section="material" meshes={[]} onSelectMesh={() => {}} onAction={() => {}} onApplyMaterial={() => {}}
            onApplyMetalToAll={chooseLook} onApplyGemToAll={() => {}} onSceneAction={() => {}}
          />
        </>
      );
    }
    render(<Linked />);

    // Material panel → weight: the White Gold look keeps the 14K karat.
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Apply one metal to all metal parts' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: 'White Gold' }));
    expect(applyLook).toHaveBeenLastCalledWith('gold-white-polished');
    expect(within(card()).getByRole('radio', { name: '14K White Gold (nickel)' })).toBeChecked();

    // Weight → look: picking silver in the table changes every metal part's look.
    fireEvent.click(within(card()).getByRole('radio', { name: 'Sterling Silver 925' }));
    expect(applyLook).toHaveBeenLastCalledWith('silver-natural-polished');
  });
});
