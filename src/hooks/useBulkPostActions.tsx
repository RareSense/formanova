/**
 * Fix with AI / Fix with Human for Bulk Studio results, reusing AIFixModal,
 * FeedbackModal and the human_fix_photoshoot credit check from the wizard.
 * Returns open handlers plus the modals to render once at page level.
 */
import { useMemo, useState } from 'react';
import { AIFixModal } from '@/components/studio/AIFixModal';
import { FeedbackModal } from '@/components/studio/FeedbackModal';
import { useEstimatedCost } from '@/hooks/use-estimated-cost';
import { azureUriToUrl } from '@/lib/azure-utils';
import { launchBulkFix } from '@/lib/bulk-fix';
import { trackAIFixModalOpened, trackAIFixSubmitted, trackFeedbackModalOpened } from '@/lib/posthog-events';
import { toast } from '@/hooks/use-toast';
import type { FeedbackCategory } from '@/lib/feedback-api';
import type { QueueItem, QueueView } from './useBulkQueue';
import type { UseCreditPreflightReturn } from './use-credit-preflight';

/** Same workflow name UnifiedStudio uses for the human fix credit check. */
const HUMAN_FIX_WORKFLOW = 'human_fix_photoshoot';

interface Args {
  checkCredits: UseCreditPreflightReturn['checkCredits'];
  addFix: (source: QueueItem, workflowId: string) => void;
  markHumanReview: (id: string) => void;
  userEmail?: string | null;
}

const display = (u?: string | null) => (u ? azureUriToUrl(u) || u : null);

export function useBulkPostActions({ checkCredits, addFix, markHumanReview, userEmail }: Args) {
  const [aiItem, setAiItem] = useState<QueueView | null>(null);
  const [humanItem, setHumanItem] = useState<QueueView | null>(null);

  const humanContext = useMemo(() => (humanItem ? {
    image_size: humanItem.resolution,
    effort: humanItem.tier,
    shot_type: humanItem.isProductShot ? 'product_shot' : 'model_shot',
    ...(humanItem.workflowId ? { workflow_id: humanItem.workflowId } : {}),
    ...(humanItem.outputAssetId ? { source_asset_id: humanItem.outputAssetId } : {}),
  } : undefined), [humanItem]);
  const { cost: humanFixCost } = useEstimatedCost({ workflowName: HUMAN_FIX_WORKFLOW, pricingContext: humanContext });

  const openFixAI = (item: QueueView) => {
    setAiItem(item);
    trackAIFixModalOpened({ category: item.category, workflow_id: item.workflowId ?? null });
  };

  const openFixHuman = async (item: QueueView) => {
    const approved = await checkCredits(HUMAN_FIX_WORKFLOW, 1, {
      pricingContext: {
        image_size: item.resolution, effort: item.tier,
        shot_type: item.isProductShot ? 'product_shot' : 'model_shot',
        ...(item.workflowId ? { workflow_id: item.workflowId } : {}),
        ...(item.outputAssetId ? { source_asset_id: item.outputAssetId } : {}),
      },
    });
    if (!approved) return;
    setHumanItem(item);
    trackFeedbackModalOpened({ category: item.category, workflow_id: item.workflowId ?? null });
  };

  const confirmFix = async (prompt: string) => {
    const item = aiItem;
    setAiItem(null);
    if (!item?.workflowId || !item.resultUrl) return;
    try {
      const wf = await launchBulkFix({
        workflowId: item.workflowId, isProductShot: item.isProductShot, tier: item.tier, category: item.category,
        aspectRatio: item.aspectRatio, resolution: item.resolution, resultImageUrl: display(item.resultUrl)!,
        outputAssetId: item.outputAssetId, jewelryUrls: item.jewelryUrls, referenceUrl: item.referenceUrl,
      }, prompt, checkCredits);
      if (!wf) return;
      addFix(item, wf);
      trackAIFixSubmitted({ category: item.category, prompt_length: prompt.length, workflow_id: item.workflowId, regeneration_number: 1 });
      toast({ title: 'Fix queued', description: `Piece ${item.pieceNumber} · ${item.assigneeName}` });
    } catch (e) {
      console.warn('[bulk-studio] fix failed', e);
      toast({ variant: 'destructive', title: "Couldn't start the fix", description: 'Please try again.' });
    }
  };

  const modals = (
    <>
      <AIFixModal
        open={!!aiItem}
        onClose={() => setAiItem(null)}
        onConfirm={(p) => void confirmFix(p)}
        jewelryDisplayUrl={display(aiItem?.jewelryUrls[0])}
        jewelryDisplayUrls={aiItem && aiItem.tier === 'high' ? aiItem.jewelryUrls.map((u) => display(u)!) : undefined}
        referenceUrl={aiItem && aiItem.tier === 'high' ? display(aiItem.referenceUrl) : undefined}
        referenceLabel={aiItem?.isProductShot ? 'Scene' : 'Model'}
        resultImageUrl={display(aiItem?.resultUrl)}
        isProductShot={aiItem?.isProductShot ?? false}
      />
      <FeedbackModal
        open={!!humanItem}
        onClose={() => setHumanItem(null)}
        onSubmitted={() => { if (humanItem) markHumanReview(humanItem.id); }}
        workflowId={humanItem?.workflowId ?? null}
        jewelryImageUrl={humanItem?.jewelryUrls[0] ?? null}
        jewelryDisplayUrl={display(humanItem?.jewelryUrls[0])}
        jewelryInputUrls={humanItem && humanItem.jewelryUrls.length > 1 ? humanItem.jewelryUrls.map((u) => display(u)!) : undefined}
        modelImageUrl={humanItem?.referenceUrl ?? null}
        resultImageUrl={humanItem?.resultUrl ?? null}
        category={(humanItem?.category ?? 'other') as FeedbackCategory}
        userEmail={userEmail}
        humanFixCost={humanFixCost}
      />
    </>
  );

  return { openFixAI, openFixHuman: (i: QueueView) => void openFixHuman(i), modals };
}
