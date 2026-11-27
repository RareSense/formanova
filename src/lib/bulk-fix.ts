/**
 * Fix with AI for one Bulk Studio result.
 *
 * Mirrors useStudioGeneration.handleAIFix (analyze-output for high-tier fixes,
 * jewelry description for low product fixes, credit check, startFixShot)
 * without that hook's single-result page state. Keep the two in step; merge
 * into one shared helper when the wizard is retired.
 */
import {
  fixWorkflowFor, getAnalyzeOutput, getJewelryDescription, startFixShot,
} from './photoshoot-api';
import { toast } from '@/hooks/use-toast';
import { azureUriToUrl } from './azure-utils';
import type { ShotTier } from './bulk-plan';

export interface FixSource {
  workflowId: string;
  isProductShot: boolean;
  tier: ShotTier;
  category: string;
  aspectRatio: string;
  resolution: string;
  resultImageUrl: string;
  outputAssetId?: string | null;
  jewelryUrls: string[];
  /** Model or scene image used for the shot. */
  referenceUrl: string;
}

type CheckCredits = (workflow: string, n?: number, meta?: { pricingContext?: Record<string, unknown> }) => Promise<boolean>;

/** Returns the new fix workflow id, or null when stopped (a toast explains why). */
export async function launchBulkFix(src: FixSource, prompt: string, checkCredits: CheckCredits): Promise<string | null> {
  const isHigh = src.tier === 'high';
  let jewelryDescription: string | undefined;
  let modelDescription: string | undefined;
  let generationType: string | undefined;

  if (isHigh) {
    let analyze: Awaited<ReturnType<typeof getAnalyzeOutput>>;
    try {
      analyze = await getAnalyzeOutput(src.workflowId);
    } catch {
      toast({ variant: 'destructive', title: "Couldn't prepare the fix", description: 'Something went wrong loading this image. Please try again in a moment.' });
      return null;
    }
    if (analyze.status === 'pending') {
      toast({ title: 'Almost ready', description: 'This image is still being prepared for editing. Please try again in a moment.' });
      return null;
    }
    if (analyze.status === 'unavailable') {
      toast({ variant: 'destructive', title: "Can't fix this image", description: "We couldn't load the details needed to fix it. Try generating it again." });
      return null;
    }
    jewelryDescription = analyze.data.jewelry_description;
    modelDescription = analyze.data.model_description || undefined;
    generationType = analyze.data.generation_type;
  } else if (src.isProductShot) {
    try { jewelryDescription = (await getJewelryDescription(src.workflowId)) ?? undefined; } catch { /* optional */ }
  }

  const approved = await checkCredits(
    fixWorkflowFor(src.isProductShot),
    1,
    src.outputAssetId ? { pricingContext: { source_asset_id: src.outputAssetId } } : undefined,
  );
  if (!approved) return null;

  const reference = azureUriToUrl(src.referenceUrl) || src.referenceUrl;
  const res = await startFixShot({
    isProductShot: src.isProductShot,
    resolution: src.resolution,
    resultImageUrl: src.resultImageUrl,
    jewelryImageUrl: src.jewelryUrls[0],
    prompt,
    category: src.category,
    aspect_ratio: src.aspectRatio,
    idempotency_key: `fix-${Date.now()}-${src.category}`,
    sourceAssetId: src.outputAssetId,
    ...(isHigh
      ? {
          tier: 'high' as const,
          jewelryImageUrls: src.jewelryUrls.map((u) => azureUriToUrl(u) || u),
          ...(jewelryDescription ? { jewelry_description: jewelryDescription } : {}),
          ...(generationType ? { generationType } : {}),
          ...(src.isProductShot
            ? { inspirationImageUrl: reference }
            : { modelImageUrl: reference, ...(modelDescription ? { modelDescription } : {}) }),
        }
      : (src.isProductShot && jewelryDescription ? { jewelry_description: jewelryDescription } : {})),
  });
  return res.workflow_id;
}
