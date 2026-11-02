/**
 * Workflow name -> extractor for the admin detail page (Inputs -> Steps -> Outputs).
 * Unknown workflows get the generic view: every picture found and every key.
 *
 * isCadModel comes from the page's existing source-type resolution (resolveSourceType),
 * so the CAD model family matches what the rest of the page treats as a CAD model.
 * cad_to_catalog_* are matched first: their names contain "cad" but they are neither CAD
 * models nor image generations.
 */
import type { AdminGenerationDetail } from '@/lib/admin-generations-api';
import { catalogShotView, fastloadView } from './cad-catalog';
import { cadModelView } from './cad-model';
import { designImageView } from './design-image';
import { genericView } from './generic';
import { photoshootView } from './photoshoot';
import { productShotView } from './product-shot';
import type { WorkflowExtractor, WorkflowFamily, WorkflowView } from './types';

export type { ViewField, ViewFile, ViewImage, ViewSection, ViewStep, WorkflowFamily, WorkflowView } from './types';

const EXTRACTORS: Record<WorkflowFamily, WorkflowExtractor> = {
  product_shot: productShotView,
  photoshoot: photoshootView,
  design_image: designImageView,
  cad_fastload: fastloadView,
  cad_shot: catalogShotView,
  cad_model: cadModelView,
  generic: genericView,
};

export function workflowFamily(workflowName: string | null | undefined, isCadModel: boolean): WorkflowFamily {
  const name = (workflowName ?? '').toLowerCase();
  if (name.startsWith('cad_to_catalog_fastload')) return 'cad_fastload';
  if (name.startsWith('cad_to_catalog_shot')) return 'cad_shot';
  if (name.startsWith('product_shot_pipeline')) return 'product_shot';
  if (name.startsWith('jewelry_photoshoots_generator')) return 'photoshoot';
  if (name.startsWith('design_image')) return 'design_image';
  if (isCadModel) return 'cad_model';
  return 'generic';
}

export function extractWorkflowView(detail: AdminGenerationDetail, isCadModel: boolean): WorkflowView {
  return EXTRACTORS[workflowFamily(detail.workflow_name, isCadModel)](detail);
}
