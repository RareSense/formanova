/**
 * admin-design-history.ts
 *
 * For a CAD run started from Idea / Doodle / Inspiration, finds the design
 * picture runs (design_image_v1) that led to it, so admin can see what the
 * customer drew and wrote, and every change asked in the design editor.
 *
 * The link is the stored picture itself: a design_image_v1 output lives at
 *   azure://.../design_image_same_camera_render/formanova_cad_design_image_<env>_state-<id>_desig-.../image_00.jpg
 * so the CAD's `image_artifact`, and an edit's `base` picture, name the run
 * that made them. A `markup` picture (pen marks flattened onto the design) is
 * uploaded fresh by the browser, so it does not say which design was marked up:
 * the trail stops there.
 */
import { inputImageUrl, payloadRoot, readCadStudioInputs, type AdminInputImage } from '@/lib/admin-generation-inputs';

export type DesignStepKind = 'doodle' | 'inspiration' | 'idea' | 'edit' | 'annotated_edit' | 'angle';

export interface DesignHistoryStep {
  workflowId: string;
  kind: DesignStepKind;
  /** What the customer wrote, or null when they wrote nothing (only our default words were sent). */
  text: string | null;
  /** The words actually sent, when they were our default rather than the customer's. */
  defaultText: string | null;
  images: AdminInputImage[];
  /** The picture this run made, when known. */
  outputUrl: string | null;
  view: string | null;
  createdAt: string | null;
}

export interface DesignHistory {
  /** Earliest first; the last step made the picture the CAD was built from. */
  steps: DesignHistoryStep[];
  /** True when the trail ends at a marked-up design whose source is not recorded. */
  brokenAtMarkup: boolean;
}

export interface DesignRunDetail {
  workflow_id: string;
  workflow_name: string;
  created_at?: string | null;
  input_payload: unknown;
}

export const MAX_DESIGN_HISTORY_STEPS = 12;

const RUN_ID_IN_PATH = /design_image[^/]*?_(state-[0-9a-f]{32})_/i;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** The design_image_v1 run that made this picture, read from its stored path. */
export function designRunIdFromArtifact(value: unknown): string | null {
  const record = asRecord(value);
  const candidates = record ? [record.uri, record.url] : [value];
  for (const c of candidates) {
    if (typeof c !== 'string') continue;
    const m = RUN_ID_IN_PATH.exec(c);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

// Words DesignToCadFlow sends when the customer wrote nothing.
const DEFAULT_PROMPTS = [
  /^Turn this drawing into a realistic .+ design\.$/,
  /^Design an? .+ inspired by this picture\.$/,
  /^Combine these pictures into one .+ design\.$/,
];

export function isDefaultPrompt(prompt: string | null | undefined): boolean {
  const p = (prompt ?? '').trim();
  return Boolean(p) && DEFAULT_PROMPTS.some((re) => re.test(p));
}

function roles(p: Record<string, unknown>): string[] {
  const entries = Array.isArray(p.images) ? p.images : [];
  return entries.map((e) => {
    const role = asRecord(e)?.role;
    return typeof role === 'string' ? role : 'reference';
  });
}

function kindOf(p: Record<string, unknown>): DesignStepKind {
  const r = roles(p);
  if (r.includes('drawing')) return 'doodle';
  if (r.includes('markup')) return 'annotated_edit';
  if (r.includes('base')) {
    const prompt = typeof p.prompt === 'string' ? p.prompt.trim() : '';
    return !prompt && typeof p.view === 'string' && p.view.trim() ? 'angle' : 'edit';
  }
  return r.length ? 'inspiration' : 'idea';
}

/** The run that made the design this run edited, if its picture says so. */
export function parentDesignRunId(inputPayload: unknown): string | null {
  const p = payloadRoot(inputPayload);
  const entries = Array.isArray(p.images) ? p.images : [];
  for (const e of entries) {
    const record = asRecord(e);
    if (record?.role !== 'base') continue;
    const id = designRunIdFromArtifact(record.artifact ?? record.image);
    if (id) return id;
  }
  return null;
}

export function designStepFromRun(detail: DesignRunDetail, outputUrl: string | null): DesignHistoryStep {
  const p = payloadRoot(detail.input_payload);
  const inputs = readCadStudioInputs('design_image_v1', detail.input_payload, false);
  const prompt = inputs?.prompt ?? null;
  const isDefault = isDefaultPrompt(prompt);
  const view = typeof p.view === 'string' && p.view.trim() ? p.view.trim() : null;
  return {
    workflowId: detail.workflow_id,
    kind: kindOf(p),
    text: isDefault ? null : prompt,
    defaultText: isDefault ? prompt : null,
    images: inputs?.images ?? [],
    outputUrl,
    view,
    createdAt: detail.created_at ?? null,
  };
}

/**
 * Walks back from the picture a CAD was built from, one design run at a time.
 * Stops at the first run with no recorded source, an unreadable run, a loop,
 * or MAX_DESIGN_HISTORY_STEPS. Returns null when the picture wasn't made by a
 * design run (Image to CAD, or an older upload).
 */
export async function traceDesignHistory(
  cadImageArtifact: unknown,
  fetchRun: (workflowId: string) => Promise<DesignRunDetail>,
  maxSteps = MAX_DESIGN_HISTORY_STEPS,
): Promise<DesignHistory | null> {
  let id = designRunIdFromArtifact(cadImageArtifact);
  if (!id) return null;
  let outputUrl = inputImageUrl(cadImageArtifact);
  const steps: DesignHistoryStep[] = [];
  const seen = new Set<string>();
  let brokenAtMarkup = false;

  while (id && !seen.has(id) && steps.length < maxSteps) {
    seen.add(id);
    let detail: DesignRunDetail;
    try {
      detail = await fetchRun(id);
    } catch {
      break;
    }
    const step = designStepFromRun(detail, outputUrl);
    steps.push(step);
    const parent = parentDesignRunId(detail.input_payload);
    if (!parent) {
      brokenAtMarkup = step.kind === 'annotated_edit';
      break;
    }
    // The design this run edited is the output of its parent.
    const p = payloadRoot(detail.input_payload);
    const base = (Array.isArray(p.images) ? p.images : [])
      .map(asRecord)
      .find((r) => r?.role === 'base');
    outputUrl = inputImageUrl(base?.artifact ?? base?.image ?? null);
    id = parent;
  }

  return steps.length ? { steps: steps.reverse(), brokenAtMarkup } : null;
}

/** The CAD run's picture, from its payload. */
export function cadDesignArtifact(inputPayload: unknown): unknown {
  return payloadRoot(inputPayload).image_artifact ?? null;
}

const KIND_LABELS: Record<DesignStepKind, string> = {
  doodle: 'Doodle',
  inspiration: 'Inspiration pictures',
  idea: 'Idea (words only)',
  edit: 'Edit in the design editor',
  annotated_edit: 'Annotated edit in the design editor',
  angle: 'New angle',
};

export function designStepLabel(kind: DesignStepKind): string {
  return KIND_LABELS[kind];
}

/** "CAD from Doodle" when the trail starts at a drawing (the CAD payload only says "idea"). */
export function startedFromDoodle(history: DesignHistory | null | undefined): boolean {
  return Boolean(history?.steps.some((s) => s.kind === 'doodle'));
}
