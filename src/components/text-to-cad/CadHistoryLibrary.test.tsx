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
    renameEntry: vi.fn().mockResolvedValue(undefined),
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
      items: [{ id: 'wf-1', createdAt: '2026-08-15T00:00:00Z', prompt: 'Twisted vine ring', referenceImageUrls: [] }],
    }));
    render(<CadHistoryLibrary variant="prompts" onSelectPrompt={onSelectPrompt} />);

    fireEvent.click(screen.getByText('Twisted vine ring'));
    expect(onSelectPrompt).toHaveBeenCalledWith('Twisted vine ring');
  });

  it('selecting a single-image card calls onSelectImages with its url', () => {
    const onSelectImages = vi.fn();
    mockUseCadHistoryLibrary.mockReturnValue(baseState({
      items: [{ id: 'wf-2', createdAt: '2026-08-15T00:00:00Z', prompt: null, referenceImageUrls: ['/api/artifacts/abc'] }],
    }));
    render(<CadHistoryLibrary variant="images" onSelectImages={onSelectImages} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reuse this inspiration image' }));
    expect(onSelectImages).toHaveBeenCalledWith(['/api/artifacts/abc']);
  });

  it('gives images a real name search box, wired to the hook', () => {
    const setSearch = vi.fn();
    mockUseCadHistoryLibrary.mockReturnValue(baseState({
      setSearch,
      items: [{ id: 'wf-2', createdAt: '2026-08-15T00:00:00Z', prompt: null, referenceImageUrls: ['/api/artifacts/abc'] }],
    }));
    render(<CadHistoryLibrary variant="images" />);

    // Searches by asset name (server-side), not by prompt text.
    const box = screen.getByPlaceholderText('Search by name...');
    expect(box).not.toHaveProperty('disabled', true);
    fireEvent.change(box, { target: { value: 'signet' } });
    expect(setSearch).toHaveBeenCalledWith('signet');
  });

  it('renders no "Show all" toggle for images, since CAD has no intended_use to filter by', () => {
    mockUseCadHistoryLibrary.mockReturnValue(baseState({
      isSearchable: true,
      items: [{ id: 'wf-2', createdAt: '2026-08-15T00:00:00Z', prompt: null, referenceImageUrls: ['/api/artifacts/abc'] }],
    }));
    render(<CadHistoryLibrary variant="images" />);

    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByText('Show all')).toBeNull();
  });

  it('groups a multi-image set into one card and reuses the whole set on click', () => {
    const onSelectImages = vi.fn();
    const urls = ['/api/artifacts/angle-1', '/api/artifacts/angle-2', '/api/artifacts/angle-3'];
    mockUseCadHistoryLibrary.mockReturnValue(baseState({
      items: [
        { id: 'set-multi', createdAt: '2026-08-15T00:00:00Z', prompt: null, referenceImageUrls: urls, assetIds: ['a', 'b', 'c'], assetId: 'a', name: null },
        { id: 'set-single', createdAt: '2026-08-14T00:00:00Z', prompt: null, referenceImageUrls: ['/api/artifacts/single'], assetIds: ['d'], assetId: 'd', name: null },
      ],
    }));
    render(<CadHistoryLibrary variant="images" onSelectImages={onSelectImages} />);

    // One card per set, not one tile per image.
    fireEvent.click(screen.getByRole('button', { name: 'Reuse these 3 inspiration images' }));
    expect(onSelectImages).toHaveBeenCalledWith(urls);
    expect(screen.getByRole('button', { name: 'Reuse this inspiration image' })).toBeTruthy();

    // Every angle is still reachable, via the strip below the cover.
    expect(screen.getAllByRole('button', { name: /^Show angle/ })).toHaveLength(3);
  });

  it('renames a set through the hook, targeting the cover asset', async () => {
    const renameEntry = vi.fn().mockResolvedValue(undefined);
    mockUseCadHistoryLibrary.mockReturnValue(baseState({
      renameEntry,
      items: [{ id: 'set-1', createdAt: '2026-08-15T00:00:00Z', prompt: null, referenceImageUrls: ['/api/artifacts/abc'], assetIds: ['cover-id'], assetId: 'cover-id', name: null }],
    }));
    render(<CadHistoryLibrary variant="images" />);

    fireEvent.click(screen.getByTitle('Click to rename'));
    fireEvent.change(screen.getByPlaceholderText('Name this ring...'), { target: { value: 'Signet band' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));

    expect(renameEntry).toHaveBeenCalledWith('cover-id', 'Signet band');
  });

  it('strips raw markdown emphasis from prompt text before rendering', () => {
    mockUseCadHistoryLibrary.mockReturnValue(baseState({
      items: [{ id: 'wf-md', createdAt: '2026-08-17T15:27:00Z', prompt: 'Create a **spider-shaped statement ring** with the spider centered symmetrically', referenceImageUrls: [] }],
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
      items: [{ id: 'wf-1', createdAt: '2026-08-15T00:00:00Z', prompt: 'A ring', referenceImageUrls: [] }],
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
