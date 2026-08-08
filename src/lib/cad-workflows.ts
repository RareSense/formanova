import { resolveCadGenerationTier } from '@/lib/cad-tier';

export const CAD_GENERATION_WORKFLOW = 'ring_generate_v1';
export const CAD_EDIT_WORKFLOW = 'ring_edit_v1';

export const CAD_GENERATION_RETURN_NODES = [
  'generate_initial',
  'build_initial',
  'build_retry',
  'validate_output',
  'build_corrected',
] as const;

export const CAD_EDIT_RETURN_NODES = [
  'load_state',
  'edit_code_initial',
  'build_initial',
  'edit_code_fix',
  'build_retry',
] as const;

export function buildCadGenerationStartBody(
  prompt: string,
  model?: string | null,
) {
  return {
    payload: {
      tier: resolveCadGenerationTier(model),
      prompt: prompt.trim(),
      max_attempts: 3,
      skip_validation: false,
    },
    return_nodes: [...CAD_GENERATION_RETURN_NODES],
  };
}

export const CAD_IMAGE_GENERATION_WORKFLOW = 'sketch_generate_v1';

export const CAD_IMAGE_GENERATION_RETURN_NODES = [
  'generate_from_sketch',
  'build_initial',
  'build_retry',
  'validate_against_sketch',
  'build_corrected',
] as const;

/**
 * sketch_generate_v1 accepts 1 to 5 reference images. The first is required;
 * the rest are optional additional angles of the same design.
 */
export const MIN_CAD_REFERENCE_IMAGES = 1;
export const MAX_CAD_REFERENCE_IMAGES = 5;

export function buildImageCadStartBody(
  referenceImageDataUris: string[],
  prompt: string,
  model?: string | null,
) {
  if (referenceImageDataUris.length < MIN_CAD_REFERENCE_IMAGES) {
    throw new Error('At least one reference image is required');
  }
  if (referenceImageDataUris.length > MAX_CAD_REFERENCE_IMAGES) {
    throw new Error(`At most ${MAX_CAD_REFERENCE_IMAGES} reference images are allowed`);
  }
  return {
    payload: {
      tier: resolveCadGenerationTier(model),
      prompt: prompt.trim(),
      reference_images: [...referenceImageDataUris],
      max_attempts: 3,
      skip_validation: false,
    },
    return_nodes: [...CAD_IMAGE_GENERATION_RETURN_NODES],
  };
}

export function buildCadEditStartBody(
  description: string,
  sourceWorkflowId: string,
  model?: string | null,
) {
  return {
    payload: {
      tier: resolveCadGenerationTier(model),
      max_attempts: 3,
      description: description.trim(),
      ring_id: sourceWorkflowId,
      source_workflow_id: sourceWorkflowId,
    },
    return_nodes: [...CAD_EDIT_RETURN_NODES],
  };
}
