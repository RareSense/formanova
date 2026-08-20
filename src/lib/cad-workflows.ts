import { resolveCadGenerationTier } from '@/lib/cad-tier';

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
