/**
 * useStudioUpload
 *
 * Owns all jewelry and model upload logic for UnifiedStudio.
 *
 * WHY THIS EXISTS
 * ---------------
 * UnifiedStudio.tsx contained two large async upload handlers
 * (handleJewelryUpload, handleModelUpload) plus their associated state.
 * This hook was extracted (phase 30) to reduce the page file size.
 * It has NO UI -- it only manages upload state and runs upload flows.
 *
 * WHAT IT MANAGES
 * ---------------
 * - handleJewelryUpload: normalise -> preview -> compress -> upload to Azure
 * - handleModelUpload: normalise -> preview -> compress -> upload to Azure
 *   -> push to My Models optimistic list -> re-fetch
 * - handleSelectLibraryModel: select a preset model, clear custom model state
 *
 * WHAT STAYS IN UnifiedStudio
 * ---------------------------
 * All state (jewelryImage, jewelryFile, validationResult, jewelryUploadedUrl,
 * jewelrySasUrl, jewelryAssetId, customModelImage, modelAssetId, selectedModel)
 * stays in UnifiedStudio and is passed in as setter options. This avoids TDZ
 * errors in the production bundle -- session restore useEffects run before this
 * hook is called in the component body, so all setters must be initialized
 * as inline useState before those effects.
 *
 * HOW TO USE
 * ----------
 * Call after useStudioModels (needs setLocalPendingModels + fetchMyModels):
 *
 *   const { handleJewelryUpload, handleModelUpload, handleSelectLibraryModel } =
 *     useStudioUpload({ isProductShot, effectiveJewelryType, toast,
 *       setJewelryImage, setJewelryFile,
 *       setJewelryUploadedUrl, setJewelrySasUrl, setJewelryAssetId,
 *       setCustomModelImage, setCustomModelFile, setModelAssetId, setSelectedModel,
 *       setLocalPendingModels, fetchMyModels,
 *     });
 */
import { useCallback, useState } from 'react';
import { normalizeImageFile, isLikelyImageFile } from '@/lib/image-normalize';
import { compressImageBlob } from '@/lib/image-compression';
import { uploadToAzure } from '@/lib/microservices-api';
import { TO_SINGULAR } from '@/lib/jewelry-utils';
import { trackJewelryUploaded, trackModelSelected, trackInspirationSelected } from '@/lib/posthog-events';
import type { PresetModel } from '@/lib/models-api';
import type { UserModel } from '@/components/studio/ModelCard';
import type { useToast } from '@/hooks/use-toast';

interface UseStudioUploadOptions {
  isProductShot: boolean;
  effectiveJewelryType: string;
  toast: ReturnType<typeof useToast>['toast'];
  // all state setters -- owned by UnifiedStudio, passed in to avoid TDZ in production bundle
  setJewelryImage: (url: string | null) => void;
  setJewelryFile: (file: File | null) => void;
  setJewelryUploadedUrl: (url: string | null) => void;
  setJewelrySasUrl: (url: string | null) => void;
  setJewelryAssetId: (id: string | null) => void;
  setCustomModelImage: (url: string | null) => void;
  setCustomModelFile: (file: File | null) => void;
  setModelAssetId: (id: string | null) => void;
  setSelectedModel: (model: PresetModel | null) => void;
  // from useStudioModels
  setLocalPendingModels: React.Dispatch<React.SetStateAction<UserModel[]>>;
  fetchMyModels: () => Promise<void>;
}

export function useStudioUpload({
  isProductShot,
  effectiveJewelryType,
  toast,
  setJewelryImage,
  setJewelryFile,
  setJewelryUploadedUrl,
  setJewelrySasUrl,
  setJewelryAssetId,
  setCustomModelImage,
  setCustomModelFile,
  setModelAssetId,
  setSelectedModel,
  setLocalPendingModels,
  fetchMyModels,
}: UseStudioUploadOptions) {
  const [isModelUploading, setIsModelUploading] = useState(false);

  const handleJewelryUpload = useCallback(async (file: File) => {
    if (!isLikelyImageFile(file)) {
      toast({ variant: 'destructive', title: 'Invalid file', description: 'Please upload an image.' });
      return;
    }
    const normalized = await normalizeImageFile(file);
    setJewelryFile(normalized);
    setJewelryUploadedUrl(null);
    setJewelrySasUrl(null);
    setJewelryAssetId(null);
    const reader = new FileReader();
    reader.onload = (e) => { setJewelryImage(e.target?.result as string); };
    reader.readAsDataURL(normalized);

    const intendedUse = isProductShot ? 'pdp' : 'on_model';
    const uploadType = isProductShot ? 'product_shot' : 'model';
    try {
      const { blob: compressed } = await compressImageBlob(normalized);
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader2 = new FileReader();
        reader2.onload = () => resolve(reader2.result as string);
        reader2.onerror = reject;
        reader2.readAsDataURL(compressed);
      });
      const azResult = await uploadToAzure(base64, 'image/jpeg', 'jewelry_photo', { category: TO_SINGULAR[effectiveJewelryType] ?? effectiveJewelryType, intended_use: intendedUse });
      setJewelryUploadedUrl(azResult.sas_url || azResult.https_url);
      setJewelrySasUrl(azResult.sas_url ?? null);
      setJewelryAssetId(azResult.asset_id ?? null);
      trackJewelryUploaded({ category: TO_SINGULAR[effectiveJewelryType] ?? effectiveJewelryType, upload_type: uploadType, was_flagged: false });
    } catch (err) {
      console.error('[jewelry upload] failed', err);
    }
  }, [toast, effectiveJewelryType, isProductShot]);

  const handleModelUpload = useCallback(async (file: File) => {
    if (!isLikelyImageFile(file)) {
      toast({ variant: 'destructive', title: 'Invalid file', description: 'Please upload an image.' });
      return;
    }
    const normalized = await normalizeImageFile(file);
    setCustomModelFile(normalized);

    // Show preview immediately via local blob URL while upload runs
    const localPreviewUrl = URL.createObjectURL(normalized);
    setCustomModelImage(localPreviewUrl);
    setSelectedModel(null);
    setIsModelUploading(true);

    // Upload to Azure immediately so the model registers in My Models vault
    try {
      const { blob: compressed } = await compressImageBlob(normalized);
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader2 = new FileReader();
        reader2.onload = () => resolve(reader2.result as string);
        reader2.onerror = reject;
        reader2.readAsDataURL(compressed);
      });
      const modelName = file.name.replace(/\.[^.]+$/, '');
      const azResult = await uploadToAzure(base64, 'image/jpeg', isProductShot ? 'inspiration_photo' : 'model_photo', { name: modelName });
      const stableUrl = azResult.sas_url || azResult.https_url;
      setCustomModelImage(stableUrl);
      setModelAssetId(azResult.asset_id ?? null);
      setCustomModelFile(null);
      setIsModelUploading(false);
      trackModelSelected({
        category: TO_SINGULAR[effectiveJewelryType] ?? effectiveJewelryType,
        model_type: 'custom_upload',
      });

      // Add to My Models list -- use real asset_id so dedup matches backend fetch
      const newModel: UserModel = {
        id: azResult.asset_id ?? `user-${Date.now()}`,
        name: azResult.name || azResult.display_name || file.name.replace(/\.[^.]+$/, ''),
        url: stableUrl,
        uploadedAt: Date.now(),
      };
      setLocalPendingModels(prev => [newModel, ...prev]);
      // Refetch from backend to sync
      fetchMyModels();
    } catch (e) {
      setCustomModelImage(null);
      setCustomModelFile(null);
      setIsModelUploading(false);
      toast({ variant: 'destructive', title: 'Upload failed', description: 'Model image could not be uploaded. Please re-select the file.' });
      console.warn('[handleModelUpload] Azure upload failed:', e);
    }
  }, [toast]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectLibraryModel = useCallback((model: PresetModel) => {
    setSelectedModel(model);
    setCustomModelImage(null);
    setCustomModelFile(null);
    setModelAssetId(null);
    const singularCategory = TO_SINGULAR[effectiveJewelryType] ?? effectiveJewelryType;
    if (isProductShot) {
      trackInspirationSelected({
        category: singularCategory,
        inspiration_id: model.id,
        inspiration_label: model.label,
        inspiration_category: model.category ?? null,
      });
    } else {
      trackModelSelected({
        category: singularCategory,
        model_type: 'catalog',
      });
    }
  }, [isProductShot, effectiveJewelryType, setSelectedModel, setCustomModelImage, setCustomModelFile, setModelAssetId]);

  return {
    handleJewelryUpload,
    handleModelUpload,
    handleSelectLibraryModel,
    isModelUploading,
  };
}
