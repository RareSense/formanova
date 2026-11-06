import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/hooks/use-estimated-cost', () => ({ useEstimatedCost: () => ({ cost: 70, loading: false }) }));
vi.mock('@/hooks/useAuthenticatedImage', () => ({ useAuthenticatedImage: () => null }));
vi.mock('@/components/generations/ScissorGLBGrid', () => ({
  ScissorGLBGrid: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  GLBPreviewSlot: () => <div data-testid="glb" />,
}));

import LeftPanel from './LeftPanel';

const props = {
  model: 'gemini', setModel: vi.fn(), prompt: '', setPrompt: vi.fn(), isGenerating: false, hasModel: true,
  onGenerate: vi.fn(), magicTexturing: false, onMagicTexturingChange: vi.fn(), pageTitle: 'CAD from Image',
  versions: [{ asset_id: 'v1', position: 0, glb_url: '/v1.glb' }], selectedVersionId: 'v1', onSelectVersion: vi.fn(),
};

describe('LeftPanel', () => {
  it("shows the version's spec sections right under VERSIONS", () => {
    render(<LeftPanel {...props} versionSpec={<div data-testid="spec">spec</div>} />);
    const versions = screen.getByText('Versions');
    const spec = screen.getByTestId('spec');
    expect(versions.compareDocumentPosition(spec) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders no spec sections when given none', () => {
    render(<LeftPanel {...props} />);
    expect(screen.queryByTestId('spec')).toBeNull();
  });

  const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it("puts the customer's description directly under the input picture, above Versions and Metal weight", () => {
    render(
      <LeftPanel
        {...props}
        prompt="a twisted gold band with a small oval diamond"
        referenceImagePreviewUrls={['blob:photo-1']}
        versionSpec={<div data-testid="metal-weight">Metal weight</div>}
      />,
    );
    const image = screen.getByRole('button', { name: 'Expand reference image 1' });
    const brief = screen.getByTestId('cad-panel-brief');
    expect(brief).toHaveTextContent('a twisted gold band with a small oval diamond');
    expect(follows(image, brief)).toBe(true);
    expect(follows(brief, screen.getByText('Versions'))).toBe(true);
    expect(follows(brief, screen.getByTestId('metal-weight'))).toBe(true);
    // Only once in the panel.
    expect(screen.getAllByText('a twisted gold band with a small oval diamond')).toHaveLength(1);
  });

  it('shows the description under the picture while an image run is still building', () => {
    render(<LeftPanel {...props} hasModel={false} versions={[]} prompt="a ring" referenceImagePreviewUrls={['blob:photo-1']} />);
    const brief = screen.getByTestId('cad-panel-brief');
    expect(follows(screen.getByRole('button', { name: 'Expand reference image 1' }), brief)).toBe(true);
  });

  it('clamps a long description to three lines with a more / less toggle, and none for a short one', () => {
    const long = `${'a very long description of the ring '.repeat(12)}end`;
    const { unmount } = render(<LeftPanel {...props} prompt={long} referenceImagePreviewUrls={['blob:photo-1']} />);
    const text = screen.getByTestId('cad-panel-brief-text');
    expect(text.className).toContain('line-clamp-3');
    fireEvent.click(screen.getByRole('button', { name: 'more' }));
    expect(text.className).not.toContain('line-clamp-3');
    fireEvent.click(screen.getByRole('button', { name: 'less' }));
    expect(text.className).toContain('line-clamp-3');
    unmount();
    render(<LeftPanel {...props} prompt="a ring" referenceImagePreviewUrls={['blob:photo-1']} />);
    expect(screen.queryByRole('button', { name: 'more' })).toBeNull();
  });

  it('shows no description block for a run made from photos alone', () => {
    render(<LeftPanel {...props} prompt="" referenceImagePreviewUrls={['blob:photo-1']} />);
    expect(screen.queryByTestId('cad-panel-brief')).toBeNull();
  });
});
