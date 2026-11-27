/**
 * Models (On-Model) or scenes (Product Shot) for the Bulk Studio assign drawer.
 * Presets share the React Query cache with UnifiedStudio; the user's own list
 * reuses useStudioModels (optimistic uploads + backend sync).
 */
import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchPresetInspirations, fetchPresetModels, type PresetModel,
} from '@/lib/models-api';
import { useStudioModels } from '@/hooks/useStudioModels';
import { uploadToAzure } from '@/lib/microservices-api';
import { compressImageBlob } from '@/lib/image-compression';
import { isLikelyImageFile, normalizeImageFile } from '@/lib/image-normalize';
import { toast } from '@/hooks/use-toast';
import { TO_SINGULAR } from '@/lib/jewelry-utils';
import type { AssigneeKind, ShotAssignee } from '@/lib/shot-list';
import type { UserModel } from '@/components/studio/ModelCard';

export interface CatalogCategory { id: string; label: string; items: ShotAssignee[] }

/** Words that mark a preset category as a fit for a jewelry type (categories carry no type field). */
const TYPE_HINTS: Record<string, string[]> = {
  ring: ['ring', 'hand'],
  bracelet: ['bracelet', 'wrist', 'hand'],
  watch: ['watch', 'wrist'],
  earring: ['earring', 'ear'],
  necklace: ['necklace', 'neck'],
};

const noop = () => {};

function fromPreset(p: PresetModel, kind: AssigneeKind): ShotAssignee {
  return { id: `preset:${p.id}`, kind, name: p.label, imageUrl: p.url, source: 'preset', refId: p.id };
}

function fromUser(m: UserModel, kind: AssigneeKind): ShotAssignee {
  return { id: `asset:${m.id}`, kind, name: m.name, imageUrl: m.url, source: 'user', refId: m.id };
}

async function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/** Call with a stable `kind`; remount (key on kind) when it changes. */
export function useAssigneeCatalog(kind: AssigneeKind, jewelryType: string) {
  const isProductShot = kind === 'scene';

  const models = useQuery({ queryKey: ['preset-models'], queryFn: fetchPresetModels, enabled: !isProductShot, staleTime: 5 * 60 * 1000 });
  const scenes = useQuery({ queryKey: ['preset-inspirations'], queryFn: fetchPresetInspirations, enabled: isProductShot, staleTime: 5 * 60 * 1000 });

  const library = useMemo<CatalogCategory[]>(() => {
    const cats = isProductShot
      ? (scenes.data?.categories ?? []).map((c) => ({ id: c.id, label: c.label, raw: c.inspirations }))
      : (models.data?.categories ?? []).map((c) => ({ id: c.id, label: c.label, raw: c.models }));
    return cats
      .map((c) => ({
        id: c.id,
        label: c.label,
        items: [...c.raw]
          .sort((a, b) => Number(a.metadata?.sort_order ?? Infinity) - Number(b.metadata?.sort_order ?? Infinity))
          .map((p) => fromPreset(p, kind)),
      }))
      .sort((a, b) => (b.label.toLowerCase() === 'plain' ? 1 : 0) - (a.label.toLowerCase() === 'plain' ? 1 : 0));
  }, [isProductShot, kind, models.data, scenes.data]);

  /** Category matching the jewelry type when one exists, else the first (Plain first). */
  const defaultCategoryId = useMemo(() => {
    const hints = TYPE_HINTS[TO_SINGULAR[jewelryType] ?? jewelryType] ?? [];
    const match = library.find((c) => hints.some((h) => `${c.id} ${c.label}`.toLowerCase().includes(h)));
    return (match ?? library[0])?.id ?? null;
  }, [library, jewelryType]);

  const mine = useStudioModels({
    isProductShot, customModelImage: null, setCustomModelImage: noop, setModelAssetId: noop,
  });
  const myItems = useMemo(() => mine.mergedMyModels.map((m) => fromUser(m, kind)), [mine.mergedMyModels, kind]);

  const [uploading, setUploading] = useState(false);
  const { setLocalPendingModels, fetchMyModels } = mine;
  const upload = useCallback(async (file: File): Promise<ShotAssignee | null> => {
    if (!isLikelyImageFile(file)) {
      toast({ variant: 'destructive', title: 'Invalid file', description: 'Please upload an image.' });
      return null;
    }
    setUploading(true);
    try {
      const normalized = await normalizeImageFile(file);
      const { blob } = await compressImageBlob(normalized);
      const name = file.name.replace(/\.[^.]+$/, '');
      const res = await uploadToAzure(await fileToBase64(blob), 'image/jpeg', isProductShot ? 'inspiration_photo' : 'model_photo', { name });
      const model: UserModel = {
        id: res.asset_id ?? `user-${Date.now()}`,
        name: res.name || res.display_name || name,
        url: res.sas_url || res.https_url,
        uploadedAt: Date.now(),
      };
      setLocalPendingModels((prev) => [model, ...prev]);
      fetchMyModels();
      return fromUser(model, kind);
    } catch (e) {
      console.warn('[bulk-studio] model upload failed', e);
      toast({ variant: 'destructive', title: 'Upload failed', description: 'The image could not be uploaded. Please try again.' });
      return null;
    } finally {
      setUploading(false);
    }
  }, [isProductShot, kind, setLocalPendingModels, fetchMyModels]);

  const presetQuery = isProductShot ? scenes : models;
  return {
    library,
    defaultCategoryId,
    libraryLoading: presetQuery.isLoading,
    libraryError: presetQuery.isError,
    myItems,
    myLoading: mine.myModelsLoading,
    upload,
    uploading,
  };
}
