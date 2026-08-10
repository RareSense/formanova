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

export function buildImageCadStartBody(
  referenceImageDataUri: string,
  prompt: string,
  model?: string | null,
) {
  return {
    payload: {
      tier: resolveCadGenerationTier(model),
      prompt: prompt.trim(),
      reference_image: referenceImageDataUri,
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
