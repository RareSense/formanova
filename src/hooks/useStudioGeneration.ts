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
  startFixShot,
  workflowFor,
  buildJewelryRequestFields,
  fixWorkflowFor,
} from '@/lib/photoshoot-api';
import type { EffortLevel } from '@/components/studio/EffortToggle';
import { startUpscale, tierForUpscale, estimateUpscaleCostCached, UPSCALE_POLL_TIMEOUT_MS } from '@/lib/upscale-api';
import { uploadToAzure, bulkUploadJewelry, MAX_BULK_JEWELRY_FILES } from '@/lib/microservices-api';
import { azureUriToUrl } from '@/lib/azure-utils';
import { compressImageBlob, imageSourceToBlob } from '@/lib/image-compression';
import { TO_SINGULAR } from '@/lib/jewelry-utils';
import { markGenerationStarted } from '@/lib/generation-lifecycle';
import { getJewelryDescription, getAnalyzeOutput, type AnalyzeOutputResult } from '@/lib/photoshoot-api';
import {
  trackPaywallHit,
  trackGenerationComplete,
  trackAIFixSubmitted,
  consumeFirstGeneration,
  trackUpscaleStarted,
  trackUpscaleCompleted,
  trackUpscalePaywallHit,
} from '@/lib/posthog-events';
import { useGenerations } from '@/contexts/GenerationsContext';
import type { PresetModel } from '@/lib/models-api';
import type { useToast } from '@/hooks/use-toast';
import type { Resolution } from '@/components/studio/OutputSettingsPills';

type StudioStep = 'upload' | 'model' | 'generating' | 'results';

/** Compress a File to a jpeg File for the multipart bulk upload (matches the per-file path). */
async function compressToJpegFile(file: File): Promise<File> {
  const { blob } = await compressImageBlob(file);
  const base = file.name.replace(/\.[^.]+$/, '') || 'jewelry';
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
}

interface UseStudioGenerationOptions {
  isProductShot: boolean;
  effectiveJewelryType: string;
  effort: EffortLevel;
  /**
   * High Effort supporting angles, cover-excluded, in slot order. Each is either
   * a fresh `file` (bulk-uploaded with the cover at generate time so the backend
   * mints one input_group_id) or a pre-existing vault member (`url` + `assetId`,
   * reused as-is with no re-upload). Empty for Low effort or single-image High.
   */
  supportingItems: { file?: File; url?: string; assetId?: string }[];
  /** Cover file for the bulk set (the primary jewelry image). */
  jewelryFile: File | null;
  jewelryImage: string | null;
  activeModelUrl: string | null;
  jewelryUploadedUrl: string | null;
  jewelryAssetId: string | null;
  selectedModel: PresetModel | null;
  customModelImage: string | null;
  modelAssetId: string | null;
  aspectRatio: string;
  resolution: Resolution;
  generationCost: number | null;
  checkCredits: (
    tool: string,
    numVariations?: number,
    metadata?: { model?: string; pricingContext?: Record<string, unknown> },
  ) => Promise<boolean>;
  toast: ReturnType<typeof useToast>['toast'];
  setCurrentStep: (step: StudioStep) => void;
  setJewelryAssetId: (id: string | null) => void;
  clearStudioSession: () => void;
}

export function useStudioGeneration({
  isProductShot,
  effectiveJewelryType,
  effort,
  supportingItems,
  jewelryFile,
  jewelryImage,
  activeModelUrl,
  jewelryUploadedUrl,
  jewelryAssetId,
  selectedModel,
  customModelImage,
  modelAssetId,
  aspectRatio,
  resolution,
  generationCost,
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
  // Vault asset id of the currently displayed result. Tracks whatever produced
  // resultImages[0] — the generation, a fix, or (crucially) an upscale that swapped
  // the image in place. Consumed as the fix source_asset_id so a fix prices/runs at
  // the tier of the exact asset on screen, including an already-upscaled one.
  const [resultAssetId, setResultAssetId] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [regenerationCount, setRegenerationCount] = useState(0);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  // Inline upscale runs ON the results screen without navigating away. It is
  // tracked separately from the main workflow so completion does not trigger the
  // generate/fix completion path (which transitions steps and clears the image).
  const [upscaleStatus, setUpscaleStatus] = useState<'idle' | 'starting' | 'processing' | 'completed' | 'error'>('idle');
  const [upscaleError, setUpscaleError] = useState<string | null>(null);
  const [activeUpscaleId, setActiveUpscaleId] = useState<string | null>(null);
  // Captured at launch so the upscale completion effect emits the upscale's OWN
  // cost/tier/factor — NOT the tracked generation's generationCost (original gen).
  const upscalePropsRef = useRef<{
    source_tier: Resolution;
    factor: number;
    credits_cost: number;
    category: string;
  } | null>(null);
  const [generationInputUrlsMap, setGenerationInputUrlsMap] = useState<
    Record<string, {
      jewelryUrl?: string;
      modelUrl?: string;
      aspectRatio: string;
      resolution: Resolution;
      generationCost: number | null;
      jewelryDescription?: string;
      /** High Effort: the full cover-first jewelry angle URLs the generation used. */
      jewelryUrls?: string[];
      /** Effort of the generation being fixed (drives the higher-tier fix family). */
      effort?: EffortLevel;
      /** Original model (model shot) / inspiration (product shot) URL, preserved across
       *  fix chains so a higher-tier fix always references the real model/setting, not
       *  the previous result image that `modelUrl` gets swapped to for display. */
      referenceModelUrl?: string;
    }>
  >({});

  const { generations, trackGeneration, clearGeneration } = useGenerations();

  const myGeneration = generations.find(g => g.workflowId === workflowId);
  const upscaleGeneration = generations.find(g => g.workflowId === activeUpscaleId);
  const isGenerating = isSubmitting || myGeneration?.status === 'running';
  const generationProgress = myGeneration?.progress ?? 0;
  const generationStep = myGeneration?.generationStep ?? '';
  const hasNavigatedAway = useRef(false);
  const generationInputUrls = workflowId ? ({
    jewelryUrl: generationInputUrlsMap[workflowId]?.jewelryUrl ?? myGeneration?.jewelryUrl,
    modelUrl: generationInputUrlsMap[workflowId]?.modelUrl ?? myGeneration?.modelUrl,
    aspectRatio: generationInputUrlsMap[workflowId]?.aspectRatio ?? myGeneration?.aspectRatio ?? '3:4',
    resolution: generationInputUrlsMap[workflowId]?.resolution ?? myGeneration?.resolution ?? '1K',
    generationCost: generationInputUrlsMap[workflowId]?.generationCost ?? myGeneration?.generationCost ?? null,
    // High Effort context, needed by every input preview (generating spinner, AI
    // Fix modal, feedback/human-fix popup) so they surface the full angle set + the
    // real reference and branch on the generation's own effort, not the live toggle.
    jewelryUrls: generationInputUrlsMap[workflowId]?.jewelryUrls ?? myGeneration?.jewelryUrls,
    effort: generationInputUrlsMap[workflowId]?.effort,
    referenceModelUrl: generationInputUrlsMap[workflowId]?.referenceModelUrl,
  }) : null;

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
      setResultAssetId(myGeneration.outputAssetId ?? null);
      if (myGeneration.jewelryDescription) {
        setGenerationInputUrlsMap(prev => ({
          ...prev,
          [workflowId!]: { ...prev[workflowId!], jewelryDescription: myGeneration.jewelryDescription },
        }));
      }
      clearGeneration(workflowId!);
      const isFirst = consumeFirstGeneration();
      trackGenerationComplete({
        source: 'unified-studio',
        category: TO_SINGULAR[effectiveJewelryType] ?? effectiveJewelryType,
        upload_type: null,
        duration_ms: Date.now() - (myGeneration.startedAt ?? Date.now()),
        is_first_ever: isFirst,
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

  // React to inline-upscale completion/failure. Swaps the result image in place
  // (so its download action just works) without leaving the results screen.
  useEffect(() => {
    if (!upscaleGeneration) return;
    if (upscaleGeneration.status === 'completed') {
      setResultImages(upscaleGeneration.resultImages);
      // The upscaled asset replaces the on-screen result, so a subsequent fix must
      // anchor to IT, not the pre-upscale generation.
      setResultAssetId(upscaleGeneration.outputAssetId ?? null);
      setUpscaleStatus('completed');
      trackGenerationComplete({
        source: 'unified-studio',
        category: TO_SINGULAR[effectiveJewelryType] ?? effectiveJewelryType,
        upload_type: null,
        duration_ms: Date.now() - (upscaleGeneration.startedAt ?? Date.now()),
        is_first_ever: false,
        aspect_ratio: upscaleGeneration.aspectRatio,
        resolution: upscaleGeneration.resolution,
      });
      if (upscalePropsRef.current) {
        trackUpscaleCompleted({
          ...upscalePropsRef.current,
          is_product_shot: isProductShot,
          surface: 'studio',
        });
      }
      clearGeneration(activeUpscaleId!);
      setActiveUpscaleId(null);
    }
    if (upscaleGeneration.status === 'failed') {
      setUpscaleStatus('error');
      setUpscaleError('Upscale failed. Please try again.');
      clearGeneration(activeUpscaleId!);
      setActiveUpscaleId(null);
    }
    // Deps: upscaleGeneration.status only. activeUpscaleId, setters, clearGeneration,
    // and effectiveJewelryType are stable refs/setters/hook constants. Mirrors the
    // main completion effect above. Watch: if activeUpscaleId changes mid-flight the
    // lookup yields undefined and the effect no-ops, which is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upscaleGeneration?.status]);

  const handleGenerate = useCallback(async () => {
    if (isSubmitting) return;
    if (!jewelryImage || !activeModelUrl) {
      toast({ variant: 'destructive', title: 'Missing inputs', description: 'Upload a jewelry image and select a model.' });
      return;
    }

    // Effort chooses the workflow_name (low → unsuffixed, high → higher-tier); the
    // resolution tier travels as image_size both in the run payload and the preflight
    // pricing_context, so the credit hold matches the actual per-tier charge instead of
    // authorizing the worst-case tier. Step 5 + effort toggle.
    const workflowName = workflowFor(isProductShot, resolution, effort);
    const hasCredits = await checkCredits(workflowName, 1, { pricingContext: { image_size: resolution } });
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
    // A fresh generation is never an upscaled result. Clear any stale upscale
    // state so its 'completed' status can't carry over from a prior upscale
    // (e.g. done in the other studio, then switched here) and wrongly hide the
    // fix actions on this new result.
    setUpscaleStatus('idle');
    setUpscaleError(null);
    setActiveUpscaleId(null);

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

      // High Effort with supporting angles: send the cover-first
      // jewelry_image_urls + input_jewelry_asset_ids arrays for the whole set.
      // Each set member is either a fresh File (needs upload) or a pre-existing
      // vault asset (url + assetId, reused as-is with no re-upload, no duplicate
      // grouped set). The fresh Files upload together as ONE grouped
      // POST /upload/bulk call so the backend mints a single input_group_id.
      // When every member is from the vault (a grouped set clicked in My
      // Products), nothing is uploaded and the original input_group_id is kept.
      // Low effort, or High with just the cover, keeps the singular/existing path.
      let jewelryReqFields;
      if (effort === 'high' && supportingItems.length > 0) {
        type SetEntry = { file?: File; url?: string; assetId?: string };
        const coverEntry: SetEntry = jewelryFile
          ? { file: jewelryFile }
          : { url: jewelryUrl ?? undefined, assetId: jewelryAssetId ?? undefined };
        const entries: SetEntry[] = [coverEntry, ...supportingItems].slice(0, MAX_BULK_JEWELRY_FILES);

        // Upload only the fresh Files, in one grouped bulk call. Persist the same
        // jewelry metadata the single-file path sets so grouped assets get a
        // correct tier/category badge (matches useStudioUpload.ts).
        const fileEntries = entries.filter(e => e.file);
        let uploaded: { uri: string; asset_id: string }[] = [];
        if (fileEntries.length > 0) {
          const compressed = await Promise.all(fileEntries.map(e => compressToJpegFile(e.file!)));
          const intendedUse = isProductShot ? 'pdp' : 'on_model';
          const bulk = await bulkUploadJewelry(compressed, { category, intended_use: intendedUse });
          uploaded = bulk.jewelry;
        }

        // Reassemble cover-first: File entries take the next uploaded result (bulk
        // preserves order); vault entries use their own url/id. Push url+id together
        // so the two arrays stay index-aligned.
        let u = 0;
        const urls: string[] = [];
        const ids: string[] = [];
        for (const e of entries) {
          if (e.file) {
            const up = uploaded[u++];
            if (up?.uri && up?.asset_id) { urls.push(up.uri); ids.push(up.asset_id); }
          } else if (e.url && e.assetId) {
            urls.push(e.url); ids.push(e.assetId);
          }
        }
        jewelryReqFields = { tier: 'high' as const, jewelry_image_urls: urls, input_jewelry_asset_ids: ids };
      } else {
        jewelryReqFields = buildJewelryRequestFields({
          effort,
          coverUrl: jewelryUrl,
          coverAssetId: jewelryAssetId,
          supporting: [],
        });
      }

      const startResponse = isProductShot
        ? await startPdpShot({
            jewelry_image_url: jewelryUrl,
            inspiration_image_url: modelUrl,
            category,
            idempotency_key: idempotencyKey,
            aspect_ratio: aspectRatio,
            resolution,
            ...jewelryReqFields,
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
            ...jewelryReqFields,
            ...(modelAssetId ? { input_model_asset_id: modelAssetId } : {}),
            ...(selectedModel?.id && !modelAssetId ? { input_preset_model_id: selectedModel.id } : {}),
          });

      const _workflowId = startResponse.workflow_id;
      setGenerationInputUrlsMap(prev => ({
        ...prev,
        [_workflowId]: {
          jewelryUrl, modelUrl, aspectRatio, resolution, generationCost,
          jewelryUrls: jewelryReqFields.jewelry_image_urls ?? [jewelryUrl],
          effort,
          referenceModelUrl: modelUrl,
        },
      }));
      setWorkflowId(_workflowId);
      trackGeneration({
        workflowId: _workflowId,
        isProductShot,
        jewelryType: TO_SINGULAR[effectiveJewelryType] ?? effectiveJewelryType,
        jewelryUrl,
        modelUrl,
        aspectRatio,
        resolution,
        generationCost,
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
    effort, supportingItems, jewelryFile,
    jewelryUploadedUrl, jewelryAssetId, selectedModel, customModelImage, modelAssetId,
    aspectRatio, resolution,
    generationCost, checkCredits, toast, setCurrentStep, setJewelryAssetId, trackGeneration,
    clearStudioSession,
  ]);

  const handleAIFix = useCallback(async (prompt: string) => {
    if (isSubmitting) return;

    const prevData = generationInputUrlsMap[workflowId ?? ''];
    // Asset id of the exact image on screen (generation / prior fix / upscale). This
    // is the source of truth for fix tier + price now; fixResolution below stays only
    // as a UI/fallback resolution, not a billing driver. Undefined for restored async
    // results whose asset id wasn't carried through nav state -> backend falls back to
    // image_size (safe, same tier as today).
    const sourceAssetId = resultAssetId;
    const fixResolution = prevData?.resolution ?? resolution;
    const fixAspectRatio = prevData?.aspectRatio ?? aspectRatio;
    // Fix workflow expects https blob URLs, not raw azure:// URIs. jewelryUploadedUrl
    // stores the raw URI, so convert it; fall back to the original if no blob base is set.
    const rawJewelryUrl = prevData?.jewelryUrl ?? jewelryUploadedUrl;
    const resultImageUrl = azureUriToUrl(resultImages[0]) || resultImages[0];
    const jewelryImageUrl = azureUriToUrl(rawJewelryUrl) || rawJewelryUrl;

    // High Effort fix: routes to the higher-tier fix family, which needs the full
    // cover-first jewelry angle set plus the original model/inspiration reference.
    // Effort follows the generation being fixed, not the live toggle.
    const isHighFix = (prevData?.effort ?? effort) === 'high';
    const jewelryImageUrls = (prevData?.jewelryUrls ?? (rawJewelryUrl ? [rawJewelryUrl] : []))
      .map(u => azureUriToUrl(u) || u)
      .filter((u): u is string => !!u);
    const referenceRaw = prevData?.referenceModelUrl ?? prevData?.modelUrl;
    const referenceModelUrl = referenceRaw ? (azureUriToUrl(referenceRaw) || referenceRaw) : undefined;

    let jewelryDescription = prevData?.jewelryDescription;
    let modelDescription: string | undefined;
    let generationType: string | undefined;

    if (isHighFix && workflowId) {
      // Higher-tier fix: pull jewelry + model descriptions and generation_type from the
      // analyze output the original generation produced (both shot types). generation_type
      // is required as-is downstream (never reconstruct it), so if analyze isn't ready or
      // available we stop with a clear message instead of sending a wrong/omitted value.
      let analyze: AnalyzeOutputResult;
      try {
        analyze = await getAnalyzeOutput(workflowId);
      } catch (e) {
        console.warn('[handleAIFix] getAnalyzeOutput failed:', e);
        toast({ variant: 'destructive', title: "Couldn't prepare the fix", description: 'Something went wrong loading this image. Please try again in a moment.' });
        return;
      }
      if (analyze.status === 'pending') {
        // 409 - right image, analysis just isn't finished (still running, or it failed
        // to produce output). In-progress, not an app error. Log the backend detail
        // (running vs no-output) but show the user a plain, non-jargon message.
        console.info('[handleAIFix] analyze not ready:', analyze.detail);
        toast({ title: 'Almost ready', description: 'This image is still being prepared for editing. Please try again in a moment.' });
        return;
      }
      if (analyze.status === 'unavailable') {
        // 404/422 - shouldn't happen in the normal fix flow; without generation_type the
        // higher-tier fix can't run, so stop rather than fail downstream.
        toast({ variant: 'destructive', title: "Can't fix this image", description: 'We couldn\'t load the details needed to fix it. Try starting a new photoshoot.' });
        return;
      }
      jewelryDescription = jewelryDescription ?? analyze.data.jewelry_description;
      modelDescription = analyze.data.model_description || undefined;
      generationType = analyze.data.generation_type;
    } else if (!jewelryDescription && isProductShot && workflowId) {
      // Low-effort product fix keeps the PDP-only jewelry-description endpoint.
      try {
        jewelryDescription = await getJewelryDescription(workflowId) ?? undefined;
      } catch (e) {
        console.warn('[handleAIFix] getJewelryDescription failed:', e);
      }
    }

    if (!resultImageUrl || !jewelryImageUrl) {
      toast({ variant: 'destructive', title: 'Missing images', description: 'Cannot fix — original images are not available.' });
      return;
    }

    // Base fix workflow (no _2k/_4k suffix); tier resolves from source_asset_id. Step 5.
    const fixWorkflowName = fixWorkflowFor(isProductShot);

    // After fix cuts over to the base workflow_name, price is driven by source_asset_id
    // (not the name), so send it as pricing_context to keep the preflight quote accurate.
    const hasCredits = await checkCredits(
      fixWorkflowName,
      1,
      sourceAssetId ? { pricingContext: { source_asset_id: sourceAssetId } } : undefined,
    );
    if (!hasCredits) {
      trackPaywallHit({ category: TO_SINGULAR[effectiveJewelryType] ?? effectiveJewelryType, steps_completed: 3 });
      return;
    }

    const category = TO_SINGULAR[effectiveJewelryType] ?? effectiveJewelryType;
    const newRegenerationNumber = regenerationCount + 1;

    setIsSubmitting(true);
    setGenerationError(null);
    hasNavigatedAway.current = false;
    setRegenerationCount(c => c + 1);
    // Show result image in the second slot while the fix API call is in flight
    if (workflowId) {
      setGenerationInputUrlsMap(prev => ({
        ...prev,
        [workflowId]: { ...prev[workflowId], modelUrl: resultImageUrl },
      }));
    }
    setResultImages([]);
    setCurrentStep('generating');

    try {
      const startResponse = await startFixShot({
        isProductShot,
        resolution: fixResolution,
        resultImageUrl,
        jewelryImageUrl,
        prompt,
        category,
        aspect_ratio: fixAspectRatio,
        idempotency_key: `fix-${Date.now()}-${effectiveJewelryType}`,
        sourceAssetId,
        ...(isHighFix
          ? {
              tier: 'high' as const,
              jewelryImageUrls,
              ...(jewelryDescription ? { jewelry_description: jewelryDescription } : {}),
              ...(generationType ? { generationType } : {}),
              ...(isProductShot
                ? { inspirationImageUrl: referenceModelUrl }
                : {
                    modelImageUrl: referenceModelUrl,
                    ...(modelDescription ? { modelDescription } : {}),
                  }),
            }
          : (isProductShot && jewelryDescription ? { jewelry_description: jewelryDescription } : {})),
      });

      const _workflowId = startResponse.workflow_id;
      trackAIFixSubmitted({ category, prompt_length: prompt.length, workflow_id: workflowId, regeneration_number: newRegenerationNumber });
      setGenerationInputUrlsMap(prev => ({
        ...prev,
        [_workflowId]: {
          jewelryUrl: jewelryImageUrl,
          modelUrl: resultImageUrl,
          aspectRatio: fixAspectRatio,
          resolution: fixResolution,
          generationCost: prevData?.generationCost ?? generationCost,
          ...(jewelryDescription ? { jewelryDescription } : {}),
          // Preserve the fix references across chained fixes (fixing a fix): the
          // jewelry angle set, the generation effort, and the real model/inspiration
          // image (modelUrl above is swapped to the result image for display).
          jewelryUrls: prevData?.jewelryUrls ?? jewelryImageUrls,
          effort: prevData?.effort ?? (isHighFix ? 'high' : 'low'),
          referenceModelUrl: prevData?.referenceModelUrl ?? referenceModelUrl,
        },
      }));
      setWorkflowId(_workflowId);
      trackGeneration({
        workflowId: _workflowId,
        isProductShot,
        jewelryType: category,
        jewelryUrl: jewelryImageUrl,
        modelUrl: resultImageUrl,
        aspectRatio: fixAspectRatio,
        resolution: fixResolution,
        generationCost: prevData?.generationCost ?? generationCost,
      });
      markGenerationStarted(_workflowId);
    } catch {
      setGenerationError('unavailable');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitting, resultImages, resultAssetId, workflowId, generationInputUrlsMap,
    jewelryUploadedUrl, isProductShot, effectiveJewelryType, effort,
    resolution, aspectRatio, generationCost, checkCredits,
    toast, setCurrentStep, trackGeneration, regenerationCount,
  ]);

  const handleUpscale = useCallback(async (factor: number) => {
    // Prevent duplicate submissions while one is starting or processing.
    if (upscaleStatus === 'starting' || upscaleStatus === 'processing') return;

    const prevData = generationInputUrlsMap[workflowId ?? ''];
    const upscaleResolution = prevData?.resolution ?? resolution;
    const upscaleAspectRatio = prevData?.aspectRatio ?? aspectRatio;
    // The image to enlarge is the current result. image.uri accepts the SAS https
    // URL we already render (or an azure:// URI) per the backend contract.
    const sourceImageUrl = resultImages[0];

    if (!sourceImageUrl) {
      toast({ variant: 'destructive', title: 'Missing image', description: 'Cannot upscale — the result image is not available.' });
      return;
    }

    setUpscaleStatus('starting');
    setUpscaleError(null);

    // Quoted hold price at launch (policy-driven, cache warm from UpscaleControl).
    const upscaleCreditsCost = (await estimateUpscaleCostCached({ resolution: upscaleResolution, factor })) ?? 0;

    const hasCredits = await checkCredits('upscale_image', 1, {
      pricingContext: { image_size: tierForUpscale(upscaleResolution), factor },
    });
    if (!hasCredits) {
      // Existing insufficient-credit modal is raised by checkCredits; just reset.
      setUpscaleStatus('idle');
      trackPaywallHit({ category: TO_SINGULAR[effectiveJewelryType] ?? effectiveJewelryType, steps_completed: 3 });
      trackUpscalePaywallHit({
        source_tier: upscaleResolution,
        factor,
        credits_cost: upscaleCreditsCost,
        category: TO_SINGULAR[effectiveJewelryType] ?? effectiveJewelryType,
        surface: 'studio',
      });
      return;
    }

    const category = TO_SINGULAR[effectiveJewelryType] ?? effectiveJewelryType;

    try {
      const startResponse = await startUpscale({
        imageUri: sourceImageUrl,
        factor,
        resolution: upscaleResolution,
        idempotency_key: `upscale-${Date.now()}-${effectiveJewelryType}`,
      });

      const _upscaleId = startResponse.workflow_id;
      upscalePropsRef.current = {
        source_tier: upscaleResolution, factor, credits_cost: upscaleCreditsCost, category,
      };
      trackUpscaleStarted({
        source_tier: upscaleResolution, factor, credits_cost: upscaleCreditsCost, category,
        is_product_shot: isProductShot, surface: 'studio',
      });
      // Record input urls so a restore (e.g. via the header indicator) keeps context.
      setGenerationInputUrlsMap(prev => ({
        ...prev,
        [_upscaleId]: {
          jewelryUrl: prevData?.jewelryUrl,
          modelUrl: sourceImageUrl,
          aspectRatio: upscaleAspectRatio,
          resolution: upscaleResolution,
          generationCost: prevData?.generationCost ?? generationCost,
        },
      }));
      setActiveUpscaleId(_upscaleId);
      setUpscaleStatus('processing');
      // Track via GenerationsContext so polling, the header indicator, and
      // leave-and-return all work. The completion effect above swaps the image in.
      trackGeneration({
        workflowId: _upscaleId,
        isProductShot,
        jewelryType: category,
        jewelryUrl: prevData?.jewelryUrl ?? '',
        modelUrl: sourceImageUrl,
        aspectRatio: upscaleAspectRatio,
        resolution: upscaleResolution,
        generationCost: prevData?.generationCost ?? generationCost,
        // Upscale can be much slower than a normal generation — give the poller room.
        timeoutMs: UPSCALE_POLL_TIMEOUT_MS,
        // Anchor the upscale to the source generation so restore paths (toast/header)
        // bring the studio back to the original workflow, keeping feedback/category/
        // inputs correct. The upscale's own modelUrl is the source image being enlarged,
        // so carry the original reference model separately for feedback attribution.
        parentWorkflowId: workflowId ?? undefined,
        parentModelUrl: prevData?.modelUrl ?? activeModelUrl ?? undefined,
      });
      markGenerationStarted(_upscaleId);
    } catch {
      setUpscaleStatus('error');
      setUpscaleError('Could not start the upscale. Please try again.');
    }
  }, [
    upscaleStatus, resultImages, workflowId, generationInputUrlsMap,
    isProductShot, effectiveJewelryType, resolution, aspectRatio,
    generationCost, activeModelUrl, checkCredits, toast, trackGeneration,
  ]);

  const handleKeepBrowsing = useCallback(() => {
    hasNavigatedAway.current = true;
    setCurrentStep('model');
  }, [setCurrentStep]);

  const resumeGeneration = useCallback((id: string, meta?: {
    aspectRatio?: string;
    resolution?: Resolution;
    generationCost?: number | null;
  }) => {
    if (meta?.resolution || meta?.aspectRatio || meta?.generationCost !== undefined) {
      setGenerationInputUrlsMap(prev => ({
        ...prev,
        [id]: {
          jewelryUrl: prev[id]?.jewelryUrl,
          modelUrl: prev[id]?.modelUrl,
          aspectRatio: meta?.aspectRatio ?? prev[id]?.aspectRatio ?? '3:4',
          resolution: meta?.resolution ?? prev[id]?.resolution ?? '1K',
          generationCost: meta?.generationCost ?? prev[id]?.generationCost ?? null,
        },
      }));
    }
    setWorkflowId(id);
    hasNavigatedAway.current = false;
    setCurrentStep('generating');
  }, [setCurrentStep]);

  const restoreAsyncResult = useCallback((id: string, images: string[], meta?: {
    aspectRatio?: string;
    resolution?: Resolution;
    generationCost?: number | null;
    // Original inputs, carried when re-anchoring a derivative (upscale) run back to
    // its source generation so feedback keeps the real jewelry/reference inputs.
    jewelryUrl?: string;
    modelUrl?: string;
  }) => {
    if (
      meta?.resolution || meta?.aspectRatio || meta?.generationCost !== undefined ||
      meta?.jewelryUrl !== undefined || meta?.modelUrl !== undefined
    ) {
      setGenerationInputUrlsMap(prev => ({
        ...prev,
        [id]: {
          jewelryUrl: meta?.jewelryUrl ?? prev[id]?.jewelryUrl,
          modelUrl: meta?.modelUrl ?? prev[id]?.modelUrl,
          aspectRatio: meta?.aspectRatio ?? prev[id]?.aspectRatio ?? '3:4',
          resolution: meta?.resolution ?? prev[id]?.resolution ?? '1K',
          generationCost: meta?.generationCost ?? prev[id]?.generationCost ?? null,
        },
      }));
    }
    setWorkflowId(id);
    setResultImages(images);
    hasNavigatedAway.current = false;
  }, []);

  const resetGeneration = useCallback(() => {
    hasNavigatedAway.current = false;
    setResultImages([]);
    setResultAssetId(null);
    setWorkflowId(null);
    setGenerationError(null);
    setRegenerationCount(0);
    setFeedbackOpen(false);
    setGenerationInputUrlsMap({});
    setUpscaleStatus('idle');
    setUpscaleError(null);
    setActiveUpscaleId(null);
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
    handleAIFix,
    handleUpscale,
    upscaleStatus,
    upscaleError,
    handleKeepBrowsing,
    resumeGeneration,
    restoreAsyncResult,
    resetGeneration,
  };
}
