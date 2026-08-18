import { useEffect, useMemo, useState } from 'react';
import { listMyWorkflows, type SourceType } from '@/lib/generation-history-api';

export interface CadLibraryEntry {
  workflowId: string;
  createdAt: string;
  /** Design brief text — text_to_cad only. */
  prompt: string | null;
  /** Uploaded reference images, resolved to same-origin artifact-proxy URLs — image_to_cad only. */
  referenceImageUrls: string[];
}

const PAGE_SIZE = 10;

/**
 * Past completed CAD runs the user can reuse as a starting point — powers
 * "My Prompts" (text_to_cad) and "My Rings" (image_to_cad). Sourced entirely
 * from listMyWorkflows(), which already carries reference_image_urls/prompt
 * per run (see docs/CAD_LIBRARY_PANEL_PLAN.md) — no separate endpoint.
 *
 * Search only applies to prompts: image_to_cad entries have no user-given
 * name to search by (these are past workflow runs, not named vault assets).
 */
export function useCadHistoryLibrary(sourceType: Extract<SourceType, 'text_to_cad' | 'image_to_cad'>) {
  const [entries, setEntries] = useState<CadLibraryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setError(null);
    listMyWorkflows(100, 0)
      .then((workflows) => {
        if (cancelled) return;
        const mapped = workflows
          .filter((w) => w.source_type === sourceType && w.status === 'completed')
          .filter((w) => sourceType === 'text_to_cad' ? Boolean(w.prompt) : (w.reference_image_urls?.length ?? 0) > 0)
          .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
          .map((w): CadLibraryEntry => ({
            workflowId: w.workflow_id,
            createdAt: w.created_at,
            prompt: w.prompt ?? null,
            referenceImageUrls: w.reference_image_urls ?? [],
          }));
        setEntries(mapped);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load your past designs.');
        setEntries([]);
      });
    return () => { cancelled = true; };
  }, [sourceType]);

  useEffect(() => { setPage(0); }, [search]);

  const filtered = useMemo(() => {
    if (!entries) return [];
    if (sourceType !== 'text_to_cad') return entries;
    const term = search.trim().toLowerCase();
    if (!term) return entries;
    return entries.filter((e) => (e.prompt ?? '').toLowerCase().includes(term));
  }, [entries, search, sourceType]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return {
    isLoading: entries === null,
    error,
    hasHistory: (entries?.length ?? 0) > 0,
    isSearchable: sourceType === 'text_to_cad',
    items: pageItems,
    totalCount: filtered.length,
    search,
    setSearch,
    page,
    setPage,
    totalPages,
  };
}
