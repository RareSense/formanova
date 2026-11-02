/**
 * CAD generate / improve (jewelry_cad_*, ring_cad_*, and the older CAD model workflows).
 * The customer's inputs (pictures, prompt, type, material, tiers, flow, design history)
 * keep their existing reader on the page (admin-generation-inputs / admin-design-history);
 * this adds what the steps hold: every file published (3DM, GLB, STL, STEP, casting STL,
 * spec sheet), the metal mass, the validation status, and an improve's lineage.
 *
 * Files are read from the step outputs on purpose: /api/result/{id} answers 403 when an
 * admin opens another user's run (docs/admin-backend-handoff-2026-11-02.md).
 */
import { payloadRoot } from '@/lib/admin-generation-inputs';
import type { AdminGenerationDetail, AdminGenerationStep } from '@/lib/admin-generations-api';
import { asRecord, buildSteps, collectFiles, field, lastNodeWithKey, stepFailure, unwrapResult } from './common';
import { imagesIn } from './generic';
import { emptySection, type ViewFile, type WorkflowView } from './types';

const STEP_KEYS: Array<[string, string]> = [
  ['status', 'Status'], ['operation', 'Operation'], ['phase', 'Phase'], ['model', 'Model'], ['provider', 'Provider'],
  ['validation_status', 'Validation'], ['error_category', 'Error category'], ['user_message', 'Message'],
];

/** A short, readable summary per CAD step; the code and raw model answers stay in the raw JSON. */
function describe(step: AdminGenerationStep) {
  const out = unwrapResult(step.output);
  return { fields: STEP_KEYS.flatMap(([key, label]) => field(label, out[key])), images: imagesIn(step.output) };
}

export function cadModelView(detail: AdminGenerationDetail): WorkflowView {
  const improve = asRecord(asRecord(detail.input_payload)?.cad_improve) ?? asRecord(payloadRoot(detail.input_payload).cad_improve);
  const seen = new Set<string>();
  const files: ViewFile[] = detail.steps
    .filter((s) => !stepFailure(s.output).failed)
    .flatMap((s) => collectFiles(s.output))
    .filter((f) => (seen.has(f.url) ? false : (seen.add(f.url), true)));
  const massNode = lastNodeWithKey(detail.steps, 'estimated_metal_mass_g');
  const mass = typeof massNode?.estimated_metal_mass_g === 'number' && massNode.estimated_metal_mass_g >= 0
    ? `${massNode.estimated_metal_mass_g} g`
    : null;
  const validation = lastNodeWithKey(detail.steps, 'validation_status')?.validation_status;
  return {
    family: 'cad_model',
    inputs: {
      ...emptySection(),
      fields: improve
        ? [
            ...field('Improved from (parent asset)', improve.parent_asset_id),
            ...field('Root asset', improve.root_asset_id),
            ...field('Version set', improve.set_id),
          ]
        : [],
    },
    steps: buildSteps(detail.steps, describe),
    outputs: { ...emptySection(), files, fields: [...field('Estimated metal mass', mass), ...field('Validation', validation)] },
  };
}
