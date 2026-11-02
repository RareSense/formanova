/**
 * Optional per-family enhancements for the admin detail page: labels and order ONLY
 * (AI_RULES.md section 13). A workflow without an entry here is still shown in full by the
 * walker; these only make known workflows read better. Keys are payload keys, or
 * `<tool>.<key>` for one step's output.
 */
import type { Enhancement } from './walker';

export type WorkflowFamily = 'product_shot' | 'photoshoot' | 'design_image' | 'cad_fastload' | 'cad_shot' | 'cad_model' | 'generic';

const ROLE_LABELS: Record<string, string> = {
  base: 'Design being edited',
  markup: 'Design with annotations',
  drawing: 'Doodle',
  reference: 'Inspiration / reference',
};

const PICTURE_INPUTS = {
  jewelry_image_urls: 'Jewelry',
  jewelry_image_url: 'Jewelry',
  inspiration_image_url: 'Inspiration',
  inspiration_image_urls: 'Inspiration',
  model_image_url: 'Model',
};

export const ENHANCEMENTS: Record<WorkflowFamily, Enhancement> = {
  product_shot: {
    labels: {
      ...PICTURE_INPUTS,
      user_art_direction: 'Art direction (user)',
      art_direction: 'Art direction',
      output_url: 'Generated image (url)',
      image: 'Generated image',
    },
    order: ['jewelry_image_urls', 'jewelry_image_url', 'inspiration_image_url', 'category', 'user_art_direction', 'aspect_ratio', 'image_size', 'prompt', 'image'],
  },
  photoshoot: {
    labels: {
      ...PICTURE_INPUTS,
      user_piece: 'Piece (user)',
      user_specs: 'Specs (user)',
      base_desc: 'Model description',
      'prepare_jewelry_request_initial_higher_tier.prompt': 'Initial prompt',
      'prepare_jewelry_request_polished_higher_tier.prompt': 'Polished prompt',
      'generate_jewelry_image_initial_higher_tier.image': 'Intermediate image',
      'generate_jewelry_image_polished_higher_tier.image': 'Polished image',
      'upscale_higher_tier_4k.image': 'Upscaled image',
    },
    order: ['model_image_url', 'jewelry_image_urls', 'jewelry_image_url', 'category', 'user_piece', 'user_specs', 'aspect_ratio', 'image_size', 'prompt', 'image'],
  },
  design_image: {
    labels: { jewelry_type: 'Category', view: 'Angle', consistent: 'Matches the design', image_artifact: 'Design picture' },
    label: ({ key, parent }) => {
      const role = typeof parent?.role === 'string' ? parent.role : null;
      return key === 'artifact' && role && Object.prototype.hasOwnProperty.call(ROLE_LABELS, role) ? ROLE_LABELS[role] : undefined;
    },
    order: ['prompt', 'images', 'image_artifact', 'consistent', 'drift'],
  },
  cad_fastload: {
    labels: { cad_file: 'Input .3dm', skeleton_3dm: 'Skeleton .3dm', meshes: 'Meshes', meshed: 'Surfaces meshed', unmeshed: 'Surfaces not meshed' },
    order: ['cad_file', 'skeleton_3dm', 'meshes', 'triangles'],
  },
  cad_shot: {
    labels: { render_image: 'Render', background_image: 'Background', image: 'Placed photo', ai_image: 'AI picture (before paste-back)' },
    order: ['kind', 'render_image', 'background_image', 'pictures', 'image', 'ai_image', 'images'],
  },
  cad_model: {
    labels: {
      threedm_artifact: '3DM', glb_artifact: 'GLB', stl_artifacts: 'STL', step_artifacts: 'STEP', casting_body: 'Casting',
      spec_sheet: 'Spec sheet', estimated_metal_mass_g: 'Estimated metal mass (g)', validation_status: 'Validation',
      cad_improve: 'Improve lineage', parent_asset_id: 'Improved from (parent asset)', root_asset_id: 'Root asset', set_id: 'Version set',
      user_description: 'Description (user)', reference_image_artifacts: 'Reference images',
    },
    order: ['glb_artifact', 'threedm_artifact', 'stl_artifacts', 'step_artifacts', 'derivatives', 'spec_sheet', 'estimated_metal_mass_g', 'validation_status'],
  },
  generic: {},
};

/**
 * isCadModel comes from the page's source-type resolution (resolveSourceType). cad_to_catalog_*
 * names contain "cad" but are neither CAD models nor image generations, so they match first.
 */
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
