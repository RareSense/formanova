import { useCallback, useEffect, useMemo, useState } from 'react';
import { listMyWorkflows, type SourceType } from '@/lib/generation-history-api';
import { fetchUserAssets, getAssetDisplayName, renameAsset, type UserAsset } from '@/lib/assets-api';

export interface CadLibraryEntry {
  /** Stable react key. Workflow id for prompts, set id (or asset id when
   * ungrouped) for images. */
  id: string;
  createdAt: string;
  /** Design brief text — text_to_cad only. */
  prompt: string | null;
  /** Every image in this set, as same-origin artifact-proxy URLs. Index 0 is
   * the cover — image_to_cad only. */
  referenceImageUrls: string[];
  /** Asset ids, index-parallel to referenceImageUrls. */
  assetIds: string[];
  /** Cover asset id — what rename targets. Null for prompt entries. */
  assetId: string | null;
  /** Cover's user-given name, if any — image entries only. */
  name: string | null;
}

/** Groups vault assets into one entry per set, and shows each image exactly
 * once. Assets with no set stand alone. Order follows first appearance so the
 * grid does not reshuffle, and within a set the earliest-created asset is the
 * cover. */
function groupBySet(assets: UserAsset[]): CadLibraryEntry[] {
  const groups = new Map<string, UserAsset[]>();
  const order: string[] = [];
  const placed = new Set<string>();
  for (const a of assets) {
    // Each image is shown once, in the first set it belongs to.
    //
    // An asset can be in several sets: re-uploading one already owned adds it
    // to the new set while keeping the old. Photo Studio renders it in every
    // card, which is meaningful there because a card is a product. Here a card
    // is an upload batch, and since every attach is its own upload, batches are
    // arbitrary. Repeating the image across them just reads as duplicates.
    if (placed.has(a.id)) continue;
    placed.add(a.id);
    const key = a.set_ids?.[0] ?? a.input_group_id ?? `single:${a.id}`;
    if (!groups.has(key)) { groups.set(key, []); order.push(key); }
    groups.get(key)!.push(a);
  }
  return order.map((key) => {
    const members = [...groups.get(key)!].sort((x, y) =>
      x.created_at < y.created_at ? -1 : x.created_at > y.created_at ? 1 : 0);
    const cover = members[0];
    return {
      id: key,
      createdAt: cover.created_at,
      prompt: null,
      referenceImageUrls: members.map((m) => m.thumbnail_url),
      assetIds: members.map((m) => m.id),
      assetId: cover.id,
      name: getAssetDisplayName(cover) || null,
    };
  });
}

const PAGE_SIZE = 10;

/**
 * Past material the user can reuse as a starting point — powers "My Prompts"
 * (text_to_cad) and "My Rings" (image_to_cad). The two variants read from
 * different places, deliberately:
 *
 * - Images come from the cad_reference asset vault
 *   (GET /assets?asset_type=cad_reference), which is the real store: named,
 *   renameable, searchable server-side, one row per image. Only images
 *   uploaded through POST /upload/cad-reference are registered there, so the
 *   panel is empty for users who have not uploaded since that shipped. That is
 *   expected, not a bug — historical reference images were never assets.
 *
 * - Prompts stay on listMyWorkflows(): a design brief is not an asset and has
 *   no vault to live in, so past runs remain the only source.
 *
 * Consequently pagination and search differ too. Images page and search on the
 * server (`total` stays correct while searching); prompts page and filter in
 * memory over a single fetched batch.
 */
export function useCadHistoryLibrary(sourceType: Extract<SourceType, 'text_to_cad' | 'image_to_cad'>) {
  const isImages = sourceType === 'image_to_cad';

  const [entries, setEntries] = useState<CadLibraryEntry[] | null>(null);
  const [serverTotal, setServerTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  // Debounce so typing does not fire a request per keystroke. Images only:
  // prompts filter in memory and need no debounce.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    if (!isImages) return;
    const id = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(id);
  }, [search, isImages]);

  useEffect(() => { setPage(0); }, [search]);

  // Only images refetch when the page changes; prompts hold one batch and
  // slice it in memory, so pinning this to 0 keeps page changes from
  // needlessly re-firing (and blanking) the prompt list.
  const fetchPage = isImages ? page : 0;

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setError(null);

    const load = isImages
      ? fetchUserAssets('cad_reference', fetchPage, PAGE_SIZE, undefined, undefined, undefined, debouncedSearch || undefined)
          .then((res) => {
            if (cancelled) return;
            setServerTotal(res.total);
            setEntries(groupBySet(res.items));
          })
      : listMyWorkflows(100, 0)
          .then((workflows) => {
            if (cancelled) return;
            setEntries(
              workflows
                .filter((w) => w.source_type === sourceType && w.status === 'completed' && Boolean(w.prompt))
                .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
                .map((w): CadLibraryEntry => ({
                  id: w.workflow_id,
                  createdAt: w.created_at,
                  prompt: w.prompt ?? null,
                  referenceImageUrls: [],
                  assetIds: [],
                  assetId: null,
                  name: null,
                })),
            );
          });

    load.catch((err) => {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : 'Could not load your past designs.');
      setEntries([]);
    });

    return () => { cancelled = true; };
  }, [sourceType, isImages, fetchPage, debouncedSearch]);

  // Prompts filter in memory; images are already filtered server-side.
  const filtered = useMemo(() => {
    if (!entries) return [];
    if (isImages) return entries;
    const term = search.trim().toLowerCase();
    if (!term) return entries;
    return entries.filter((e) => (e.prompt ?? '').toLowerCase().includes(term));
  }, [entries, search, isImages]);

  /** Renames a vault asset, updating the local entry so the new name shows
   * without a refetch (which would also reset the user's page and search). */
  const renameEntry = useCallback(async (assetId: string, name: string) => {
    await renameAsset(assetId, name);
    setEntries(prev => prev?.map(e => (e.assetId === assetId ? { ...e, name } : e)) ?? prev);
  }, []);

  const totalCount = isImages ? serverTotal : filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  // Images arrive pre-paged from the server; prompts are sliced here.
  const pageItems = isImages ? filtered : filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return {
    isLoading: entries === null,
    error,
    // While searching, an empty page must not read as "no history at all" —
    // that would hide the search box the user is typing into.
    hasHistory: (entries?.length ?? 0) > 0 || Boolean(search),
    isSearchable: true,
    items: pageItems,
    totalCount,
    renameEntry,
    search,
    setSearch,
    page,
    setPage,
    totalPages,
  };
}
