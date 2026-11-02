import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';

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
});
