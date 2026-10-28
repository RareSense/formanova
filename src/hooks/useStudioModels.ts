/**
 * useStudioModels
 *
 * Owns the "My Models / My Inspirations" vault for UnifiedStudio.
 *
 * WHY THIS EXISTS
 * ---------------
 * UnifiedStudio.tsx was 2000+ lines with all state and logic inlined.
 * This hook was extracted (phase 27) to reduce the page file size.
 * It has NO UI — it only manages data and exposes handlers.
 *
 * WHAT IT MANAGES
 * ---------------
 * - myModels          Backend-fetched user assets (authoritative list)
 * - localPendingModels Optimistically added models that haven't synced yet
 * - mergedMyModels    The two lists merged and deduplicated by asset ID
 * - localStorage      Persists localPendingModels between page refreshes
 *
 * TWO-LIST PATTERN (why it's split)
 * ----------------------------------
 * When a user uploads a model we want to show it instantly in the grid
 * before the backend fetch completes. We add it to localPendingModels
 * immediately (optimistic update), then after the backend re-fetch we
 * remove any pending entries whose IDs now appear in the authoritative list.
 *
 * MODE: isProductShot
 * --------------------
 * Model-shot mode stores models under MY_MODELS_STORAGE_KEY and fetches
 * asset type 'model_photo'. Product-shot mode uses MY_INSPIRATIONS_STORAGE_KEY
 * and 'inspiration_photo'. Same hook, different bucket.
 *
 * HOW TO USE
 * ----------
 * Call inside UnifiedStudio (or any studio page) after isProductShot,
 * customModelImage, setCustomModelImage, and setModelAssetId are in scope:
 *
 *   const { mergedMyModels, fetchMyModels, handleDeleteUserModel, ... } =
 *     useStudioModels({ isProductShot, customModelImage, setCustomModelImage, setModelAssetId });
 *
 * setLocalPendingModels is returned so that handleModelUpload (in UnifiedStudio)
 * can push a freshly uploaded model into the optimistic list before fetchMyModels syncs.
 */
import { useState, useCallback, useEffect, useMemo } from 'react';
import { fetchUserAssets, getAssetDisplayName, renameAsset, type UserAsset } from '@/lib/assets-api';
import type { UserModel } from '@/components/studio/ModelCard';
import { parseServerTime } from '@/lib/server-time';

const MY_MODELS_STORAGE_KEY = 'formanova_my_models';
const MY_INSPIRATIONS_STORAGE_KEY = 'formanova_my_inspirations';
const MY_MODELS_VERSION = 2;

function loadMyModels(isProductShot = false): UserModel[] {
  const key = isProductShot ? MY_INSPIRATIONS_STORAGE_KEY : MY_MODELS_STORAGE_KEY;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (parsed._v !== MY_MODELS_VERSION) { localStorage.removeItem(key); return []; }
    return Array.isArray(parsed.models) ? parsed.models : [];
  } catch { return []; }
}

function saveMyModels(models: UserModel[], isProductShot = false) {
  const key = isProductShot ? MY_INSPIRATIONS_STORAGE_KEY : MY_MODELS_STORAGE_KEY;
  localStorage.setItem(key, JSON.stringify({ _v: MY_MODELS_VERSION, models }));
}

interface UseStudioModelsOptions {
  isProductShot: boolean;
  customModelImage: string | null;
  setCustomModelImage: (url: string | null) => void;
  setModelAssetId: (id: string | null) => void;
}

export function useStudioModels({
  isProductShot,
  customModelImage,
  setCustomModelImage,
  setModelAssetId,
}: UseStudioModelsOptions) {
  const [myModels, setMyModels] = useState<UserModel[]>([]);
  const [localPendingModels, setLocalPendingModels] = useState<UserModel[]>(() => loadMyModels(isProductShot));
  const [myModelsLoading, setMyModelsLoading] = useState(true);
  const [myModelsSearch, setMyModelsSearch] = useState('');

  const fetchMyModels = useCallback(async () => {
    try {
      setMyModelsLoading(true);
      const data = await fetchUserAssets(isProductShot ? 'inspiration_photo' : 'model_photo', 0, 100);
      const backendModels: UserModel[] = data.items.map((a: UserAsset) => ({
        id: a.id,
        name: getAssetDisplayName(a) || (isProductShot ? 'Inspiration' : 'Model'),
        url: a.thumbnail_url,
        uploadedAt: parseServerTime(a.created_at).getTime(),
      }));
      setMyModels(backendModels);
      const backendIds = new Set(backendModels.map(m => m.id));
      setLocalPendingModels(prev => {
        const remaining = prev.filter(m => !backendIds.has(m.id));
        saveMyModels(remaining, isProductShot);
        return remaining;
      });
    } catch (e) {
      console.warn('[MyModels] Failed to fetch from backend, falling back to localStorage', e);
    } finally {
      setMyModelsLoading(false);
    }
  }, [isProductShot]);

  useEffect(() => { fetchMyModels(); }, [fetchMyModels]);

  // Persist local pending models to localStorage whenever they change
  useEffect(() => { saveMyModels(localPendingModels, isProductShot); }, [localPendingModels, isProductShot]);

  const mergedMyModels = useMemo(() => {
    const backendIds = new Set(myModels.map(m => m.id));
    const unique = localPendingModels.filter(m => !backendIds.has(m.id));
    return [...unique, ...myModels];
  }, [myModels, localPendingModels]);

  const isMyModelsEmptyState = !myModelsLoading && mergedMyModels.length === 0;

  const handleDeleteUserModel = useCallback((modelId: string) => {
    setMyModels(prev => prev.filter(m => m.id !== modelId));
    setLocalPendingModels(prev => prev.filter(m => m.id !== modelId));
    if (customModelImage) {
      const allModels = [...localPendingModels, ...myModels];
      const deleted = allModels.find(m => m.id === modelId);
      if (deleted && deleted.url === customModelImage) {
        setCustomModelImage(null);
        setModelAssetId(null);
      }
    }
  }, [customModelImage, localPendingModels, myModels, setCustomModelImage, setModelAssetId]);

  const handleRenameUserModel = useCallback(async (modelId: string, newName: string) => {
    const updateList = (prev: UserModel[]) =>
      prev.map(m => m.id === modelId ? { ...m, name: newName } : m);
    setMyModels(updateList);
    setLocalPendingModels(updateList);
    try {
      await renameAsset(modelId, newName);
    } catch (e) {
      console.warn('[MyModels] Rename failed', e);
    }
  }, []);

  return {
    myModels,
    setMyModels,
    localPendingModels,
    setLocalPendingModels,
    myModelsLoading,
    myModelsSearch,
    setMyModelsSearch,
    mergedMyModels,
    isMyModelsEmptyState,
    fetchMyModels,
    handleDeleteUserModel,
    handleRenameUserModel,
  };
}
