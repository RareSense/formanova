/**
 * useStudioGeneration
 *
 * Owns the photoshoot generation pipeline for UnifiedStudio.
 *
 * WHY THIS EXISTS
 * ---------------
 * UnifiedStudio.tsx was 2000+ lines with all state and logic inlined.
 * This hook was extracted (phase 27) to reduce the page file size.
 * It has NO UI — it only manages state and runs the generation loop.
 *
 * WHAT IT MANAGES
 * ---------------
 * - All generation state: isGenerating, progress %, step label, result images,
 *   error string, workflow ID, regeneration count, feedback modal open state
 * - Rotating loading message timer (cycles every 4s while generating)
 * - handleGenerate: the full generation pipeline — credit check, file upload
 *   fallback, API call (startPhotoshoot OR startPdpShot), context tracking,
 *   PostHog analytics
 * - resetGeneration: clears all of the above state at once (called by handleStartOver)
 * - handleKeepBrowsing: marks user as navigated away, returns to model step
 *
 * SNAPSHOT PARAMS PATTERN (important to understand)
 * --------------------------------------------------
 * handleGenerate is a useCallback that closes over the options object passed
 * on every render. This means the hook always uses the LATEST values of
 * jewelryImage, activeModelUrl, etc. without needing to re-create the callback
 * on every state change — the dependency array lists them all explicitly.
 *
 * If you add new state that handleGenerate needs to read at call time, add it
 * to both the UseStudioGenerationOptions interface AND the useCallback dep array.
 *
 * TWO GENERATION MODES
 * ----------------------
 * isProductShot=false  -> calls startPhotoshoot  (model_image_url, input_preset_model_id)
 * isProductShot=true   -> calls startPdpShot     (inspiration_image_url, input_preset_inspiration_id)
 * All other logic (upload fallback, context tracking, result handling) is shared.
 *
 * HOW TO USE
 * ----------
 * Call inside UnifiedStudio after ALL input state is declared (jewelryImage,
 * activeModelUrl, jewelryUploadedUrl, jewelryAssetId, etc.) so TypeScript can
 * resolve the option types:
 *
 *   const { isGenerating, resultImages, handleGenerate, resetGeneration, ... } =
 *     useStudioGeneration({ isProductShot, effectiveJewelryType, jewelryImage, ... });
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  startPhotoshoot,
  startPdpShot,
} from '@/lib/photoshoot-api';
import { uploadToAzure } from '@/lib/microservices-api';
import { compressImageBlob, imageSourceToBlob } from '@/lib/image-compression';
import { TO_SINGULAR } from '@/lib/jewelry-utils';
import { markGenerationStarted } from '@/lib/generation-lifecycle';
import { resolveWorkflowPollingUrls } from '@/lib/workflow-urls';
import {
  trackPaywallHit,
  trackGenerationComplete,
  consumeFirstGeneration,
} from '@/lib/posthog-events';
import { useGenerations } from '@/contexts/GenerationsContext';
import type { PresetModel } from '@/lib/models-api';
import type { useToast } from '@/hooks/use-toast';
import type { Resolution } from '@/components/studio/OutputSettingsPills';

type StudioStep = 'upload' | 'model' | 'generating' | 'results';

interface UseStudioGenerationOptions {
  isProductShot: boolean;
  effectiveJewelryType: string;
  jewelryImage: string | null;
  activeModelUrl: string | null;
  jewelryUploadedUrl: string | null;
  jewelryAssetId: string | null;
  selectedModel: PresetModel | null;
  customModelImage: string | null;
  modelAssetId: string | null;
  aspectRatio: string;
  resolution: Resolution;
  checkCredits: (tool: string) => Promise<boolean>;
  toast: ReturnType<typeof useToast>['toast'];
  setCurrentStep: (step: StudioStep) => void;
  setJewelryAssetId: (id: string | null) => void;
  clearStudioSession: () => void;
}

export function useStudioGeneration({
  isProductShot,
  effectiveJewelryType,
  jewelryImage,
  activeModelUrl,
  jewelryUploadedUrl,
  jewelryAssetId,
  selectedModel,
  customModelImage,
  modelAssetId,
  aspectRatio,
  resolution,
  checkCredits,
  toast,
  setCurrentStep,
  setJewelryAssetId,
  clearStudioSession,
}: UseStudioGenerationOptions) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rotatingMsgIdx, setRotatingMsgIdx] = useState(0);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [resultImages, setResultImages] = useState<string[]>([]);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [regenerationCount, setRegenerationCount] = useState(0);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [generationInputUrlsMap, setGenerationInputUrlsMap] = useState<
    Record<string, { jewelryUrl: string; modelUrl: string }>
  >({});

  const { generations, trackGeneration, clearGeneration } = useGenerations();

  const myGeneration = generations.find(g => g.workflowId === workflowId);
  const isGenerating = isSubmitting || myGeneration?.status === 'running';
  const generationProgress = myGeneration?.progress ?? 0;
  const generationStep = myGeneration?.generationStep ?? '';
  const hasNavigatedAway = useRef(false);
  const generationInputUrls = workflowId ? (generationInputUrlsMap[workflowId] ?? null) : null;

  // Cycle rotating messages every 4s while generating
  useEffect(() => {
    if (!isGenerating) { setRotatingMsgIdx(0); return; }
    const id = setInterval(() => setRotatingMsgIdx(i => i + 1), 4000);
    return () => clearInterval(id);
  }, [isGenerating]);

  // React to generation completion or failure from GenerationsContext
  useEffect(() => {
    if (!myGeneration) return;
    if (myGeneration.status === 'completed') {
      setResultImages(myGeneration.resultImages);
      clearGeneration(workflowId!);
      trackGenerationComplete({
        source: 'unified-studio',
        category: TO_SINGULAR[effectiveJewelryType] ?? effectiveJewelryType,
        upload_type: null,
        duration_ms: Date.now() - (myGeneration.startedAt ?? Date.now()),
        is_first_ever: consumeFirstGeneration(),
        aspect_ratio: aspectRatio,
        resolution,
      });
      clearStudioSession();
      if (!hasNavigatedAway.current) {
        setCurrentStep('results');
      }
    }
    if (myGeneration.status === 'failed') {
      setGenerationError('unavailable');
      clearGeneration(workflowId!);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // Deps excluded: workflowId, clearGeneration, setResultImages, setCurrentStep, clearStudioSession,
    // effectiveJewelryType. All are stable refs, setters, or hook-level constants
    // that don't change identity between renders.
    // Regression to watch: if workflowId changes while in flight (user submits a second generation),
    // myGeneration becomes undefined and the effect is a no-op — safe because the new generation
    // will trigger its own completion effect when it resolves.
  }, [myGeneration?.status]);

  const handleGenerate = useCallback(async () => {
    if (isSubmitting) return;
    if (!jewelryImage || !activeModelUrl) {
      toast({ variant: 'destructive', title: 'Missing inputs', description: 'Upload a jewelry image and select a model.' });
      return;
    }

    const MODEL_SHOT_WORKFLOWS: Record<string, string> = { '1K': 'jewelry_photoshoots_generator', '2K': 'jewelry_photoshoots_generator_2k', '4K': 'jewelry_photoshoots_generator_4k' };
    const PRODUCT_SHOT_WORKFLOWS: Record<string, string> = { '1K': 'Product_shot_pipeline', '2K': 'Product_shot_pipeline_2k', '4K': 'Product_shot_pipeline_4k' };
    const workflowName = isProductShot ? (PRODUCT_SHOT_WORKFLOWS[resolution] ?? 'Product_shot_pipeline') : (MODEL_SHOT_WORKFLOWS[resolution] ?? 'jewelry_photoshoots_generator');
    const hasCredits = await checkCredits(workflowName);
    if (!hasCredits) {
      trackPaywallHit({
        category: TO_SINGULAR[effectiveJewelryType] ?? effectiveJewelryType,
        steps_completed: 2,
      });
      return;
    }

    clearStudioSession();
    setIsSubmitting(true);
    setGenerationError(null);
    hasNavigatedAway.current = false;

    try {
      let jewelryUrl: string;
      if (jewelryUploadedUrl) {
        jewelryUrl = jewelryUploadedUrl;
      } else {
        const jewelryBlob = await imageSourceToBlob(jewelryImage);
        const { blob: compressedJewelry } = await compressImageBlob(jewelryBlob);
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(compressedJewelry);
        });
        const azResult = await uploadToAzure(base64, 'image/jpeg', 'jewelry_photo', {
          category: TO_SINGULAR[effectiveJewelryType] ?? effectiveJewelryType,
        });
        jewelryUrl = azResult.sas_url || azResult.https_url;
        setJewelryAssetId(azResult.asset_id ?? null);
      }

      let modelUrl: string;
      if (selectedModel) {
        modelUrl = selectedModel.url;
      } else if (customModelImage) {
        modelUrl = customModelImage;
      } else {
        throw new Error('No model selected');
      }

      if (!jewelryUrl || !modelUrl) {
        toast({ variant: 'destructive', title: 'Missing images', description: 'Please select both a jewelry image and a model before generating.' });
        setIsSubmitting(false);
        setCurrentStep('model');
        return;
      }

      const idempotencyKey = `${Date.now()}-${effectiveJewelryType}-${selectedModel?.id || 'custom'}`;
      const category = TO_SINGULAR[effectiveJewelryType] ?? effectiveJewelryType;

      const startResponse = isProductShot
        ? await startPdpShot({
            jewelry_image_url: jewelryUrl,
            inspiration_image_url: modelUrl,
            category,
            idempotency_key: idempotencyKey,
            aspect_ratio: aspectRatio,
            resolution,
            ...(jewelryAssetId ? { input_jewelry_asset_id: jewelryAssetId } : {}),
            ...(selectedModel?.id ? { input_preset_inspiration_id: selectedModel.id }
                : modelAssetId ? { input_inspiration_asset_id: modelAssetId } : {}),
          })
        : await startPhotoshoot({
            jewelry_image_url: jewelryUrl,
            model_image_url: modelUrl,
            category,
            idempotency_key: idempotencyKey,
            aspect_ratio: aspectRatio,
            resolution,
            ...(jewelryAssetId ? { input_jewelry_asset_id: jewelryAssetId } : {}),
            ...(modelAssetId ? { input_model_asset_id: modelAssetId } : {}),
            ...(selectedModel?.id && !modelAssetId ? { input_preset_model_id: selectedModel.id } : {}),
          });

      const {
        workflowId: _workflowId,
        statusUrl,
        resultUrl,
      } = resolveWorkflowPollingUrls(startResponse);
      setGenerationInputUrlsMap(prev => ({ ...prev, [_workflowId]: { jewelryUrl, modelUrl } }));
      setWorkflowId(_workflowId);
      trackGeneration({
        workflowId: _workflowId,
        isProductShot,
        jewelryType: TO_SINGULAR[effectiveJewelryType] ?? effectiveJewelryType,
        statusUrl,
        resultUrl,
      });
      markGenerationStarted(_workflowId);
      setCurrentStep('generating');
    } catch (error) {
      setGenerationError('unavailable');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitting, jewelryImage, activeModelUrl, isProductShot, effectiveJewelryType,
    jewelryUploadedUrl, jewelryAssetId, selectedModel, customModelImage, modelAssetId,
    aspectRatio, resolution,
    checkCredits, toast, setCurrentStep, setJewelryAssetId, trackGeneration,
    clearStudioSession,
  ]);

  const handleKeepBrowsing = useCallback(() => {
    hasNavigatedAway.current = true;
    setCurrentStep('model');
  }, [setCurrentStep]);

  const resumeGeneration = useCallback((id: string) => {
    setWorkflowId(id);
    hasNavigatedAway.current = false;
    setCurrentStep('generating');
  }, [setCurrentStep]);

  const restoreAsyncResult = useCallback((id: string, images: string[]) => {
    setWorkflowId(id);
    setResultImages(images);
    hasNavigatedAway.current = false;
  }, []);

  const resetGeneration = useCallback(() => {
    hasNavigatedAway.current = false;
    setResultImages([]);
    setWorkflowId(null);
    setGenerationError(null);
    setRegenerationCount(0);
    setFeedbackOpen(false);
    setGenerationInputUrlsMap({});
  }, []);

  return {
    isGenerating,
    generationProgress,
    generationStep,
    rotatingMsgIdx,
    workflowId,
    resultImages,
    setResultImages,
    generationError,
    regenerationCount,
    setRegenerationCount,
    feedbackOpen,
    setFeedbackOpen,
    generationInputUrls,
    handleGenerate,
    handleKeepBrowsing,
    resumeGeneration,
    restoreAsyncResult,
    resetGeneration,
  };
}
