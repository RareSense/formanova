import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseCadHistoryLibrary = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useCadHistoryLibrary', () => ({
  useCadHistoryLibrary: mockUseCadHistoryLibrary,
}));
vi.mock('@/hooks/useAuthenticatedImage', () => ({
  useAuthenticatedImage: (url: string | null) => url,
}));

import CadHistoryLibrary from './CadHistoryLibrary';

function baseState(overrides: Partial<ReturnType<typeof mockUseCadHistoryLibrary>> = {}) {
  return {
    isLoading: false,
    error: null,
    hasHistory: true,
    isSearchable: true,
    items: [],
    totalCount: 0,
    search: '',
    setSearch: vi.fn(),
    page: 0,
    setPage: vi.fn(),
    totalPages: 1,
    ...overrides,
  };
}

beforeEach(() => {
  mockUseCadHistoryLibrary.mockReset();
});

describe('CadHistoryLibrary', () => {
  it('renders nothing while loading or with no history, so the caller can show "Try an example" instead', () => {
    mockUseCadHistoryLibrary.mockReturnValue(baseState({ isLoading: true, hasHistory: false }));
    const { container: loadingContainer } = render(<CadHistoryLibrary variant="prompts" />);
    expect(loadingContainer.firstChild).toBeNull();

    mockUseCadHistoryLibrary.mockReturnValue(baseState({ isLoading: false, hasHistory: false }));
    const { container: emptyContainer } = render(<CadHistoryLibrary variant="prompts" />);
    expect(emptyContainer.firstChild).toBeNull();
  });

  it('reports hasHistory to the caller once loading settles', () => {
    const onHasHistoryChange = vi.fn();
    mockUseCadHistoryLibrary.mockReturnValue(baseState({ hasHistory: true }));
    render(<CadHistoryLibrary variant="prompts" onHasHistoryChange={onHasHistoryChange} />);
    expect(onHasHistoryChange).toHaveBeenCalledWith(true);
  });

  it('selecting a prompt card calls onSelectPrompt with its text', () => {
    const onSelectPrompt = vi.fn();
    mockUseCadHistoryLibrary.mockReturnValue(baseState({
      items: [{ workflowId: 'wf-1', createdAt: '2026-08-15T00:00:00Z', prompt: 'Twisted vine ring', referenceImageUrls: [] }],
    }));
    render(<CadHistoryLibrary variant="prompts" onSelectPrompt={onSelectPrompt} />);

    fireEvent.click(screen.getByText('Twisted vine ring'));
    expect(onSelectPrompt).toHaveBeenCalledWith('Twisted vine ring');
  });

  it('selecting a single-image card calls onSelectImages with its url, and hides the search box for images', () => {
    const onSelectImages = vi.fn();
    mockUseCadHistoryLibrary.mockReturnValue(baseState({
      isSearchable: false,
      items: [{ workflowId: 'wf-2', createdAt: '2026-08-15T00:00:00Z', prompt: null, referenceImageUrls: ['/api/artifacts/abc'] }],
    }));
    render(<CadHistoryLibrary variant="images" onSelectImages={onSelectImages} />);

    expect(screen.queryByPlaceholderText('Search prompts...')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reuse this reference image' }));
    expect(onSelectImages).toHaveBeenCalledWith(['/api/artifacts/abc']);
  });

  it('shows every image from a multi-image upload as its own tile, not just the primary angle', () => {
    const onSelectImages = vi.fn();
    mockUseCadHistoryLibrary.mockReturnValue(baseState({
      isSearchable: false,
      items: [
        { workflowId: 'wf-multi', createdAt: '2026-08-15T00:00:00Z', prompt: null, referenceImageUrls: ['/api/artifacts/angle-1', '/api/artifacts/angle-2', '/api/artifacts/angle-3'] },
        { workflowId: 'wf-single', createdAt: '2026-08-14T00:00:00Z', prompt: null, referenceImageUrls: ['/api/artifacts/single'] },
      ],
    }));
    render(<CadHistoryLibrary variant="images" onSelectImages={onSelectImages} />);

    const tiles = screen.getAllByRole('button', { name: 'Reuse this reference image' });
    expect(tiles).toHaveLength(4);

    fireEvent.click(tiles[1]);
    expect(onSelectImages).toHaveBeenCalledWith(['/api/artifacts/angle-2']);
  });

  it('strips raw markdown emphasis from prompt text before rendering', () => {
    mockUseCadHistoryLibrary.mockReturnValue(baseState({
      items: [{ workflowId: 'wf-md', createdAt: '2026-08-17T15:27:00Z', prompt: 'Create a **spider-shaped statement ring** with the spider centered symmetrically', referenceImageUrls: [] }],
    }));
    render(<CadHistoryLibrary variant="prompts" />);

    expect(screen.getByText('Create a spider-shaped statement ring with the spider centered symmetrically')).toBeTruthy();
    expect(screen.queryByText(/\*\*/)).toBeNull();
  });

  it('shows an error message instead of the grid when the fetch failed', () => {
    mockUseCadHistoryLibrary.mockReturnValue(baseState({ error: 'Could not load your past designs.' }));
    render(<CadHistoryLibrary variant="prompts" />);
    expect(screen.getByText('Could not load your past designs.')).toBeTruthy();
  });

  it('renders pagination controls and paging through calls setPage', () => {
    const setPage = vi.fn();
    mockUseCadHistoryLibrary.mockReturnValue(baseState({
      items: [{ workflowId: 'wf-1', createdAt: '2026-08-15T00:00:00Z', prompt: 'A ring', referenceImageUrls: [] }],
      totalPages: 3,
      page: 1,
      setPage,
    }));
    render(<CadHistoryLibrary variant="prompts" />);

    expect(screen.getByText('2 / 3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(setPage).toHaveBeenCalledWith(2);
  });
});
