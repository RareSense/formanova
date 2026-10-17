/**
 * admin-design-history.ts
 *
 * For a CAD run started from Idea / Doodle / Inspiration, finds the design
 * picture runs (design_image_v1) that led to it, so admin can see what the
 * customer drew and wrote, and every change asked in the design editor.
 *
 * Nothing stores the link as a field, so it is found from the pictures:
 * - the CAD's `image_artifact` is the picture a design run made (same sha256
 *   as that run's `image_artifact` output), and an editor edit's `base`
 *   picture is the one the run before it made;
 * - the stored azure path also names the run
 *   (.../formanova_cad_design_image_<env>_state-<id>_desig-.../image_00.jpg),
 *   but the admin API hands pictures back as /api/artifacts/<sha256>, so the
 *   sha256 match against the customer's own design runs is the main route.
 * A `markup` picture (pen marks flattened onto the design) is uploaded fresh by
 * the browser, so it does not say which design was marked up: the trail stops.
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
  steps?: Array<{ output: unknown }>;
}

export interface DesignRunSummary {
  workflow_id: string;
  created_at: string | null;
}

export interface DesignHistorySources {
  fetchRun: (workflowId: string) => Promise<DesignRunDetail>;
  /** The customer's design_image_v1 runs (any order). */
  listRuns: () => Promise<DesignRunSummary[]>;
}

export const MAX_DESIGN_HISTORY_STEPS = 12;
/** Design runs read while matching pictures, at most, per CAD page. */
export const MAX_DESIGN_RUNS_READ = 40;

const RUN_ID_IN_PATH = /design_image[^/]*?_(state-[0-9a-f]{32})_/i;
const SHA_IN_URL = /\/artifacts\/([0-9a-f]{64})(?:[/?#]|$)/i;
const SHA = /^[0-9a-f]{64}$/i;

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

/** The picture's content hash, from the artifact or its /artifacts/<sha256> url. */
export function artifactSha(value: unknown): string | null {
  const record = asRecord(value);
  if (record && typeof record.sha256 === 'string' && SHA.test(record.sha256)) return record.sha256.toLowerCase();
  const candidates = record ? [record.uri, record.url] : [value];
  for (const c of candidates) {
    if (typeof c !== 'string') continue;
    const m = SHA_IN_URL.exec(c);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

/** The picture a design run made (toolkit result `image_artifact`), as its sha256. */
export function designRunOutputSha(detail: DesignRunDetail): string | null {
  for (const step of detail.steps ?? []) {
    const out = asRecord(step.output);
    const result = asRecord(out?.result) ?? out;
    const sha = artifactSha(result?.image_artifact ?? result?.image);
    if (sha) return sha;
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

function imageEntries(p: Record<string, unknown>): Record<string, unknown>[] {
  return (Array.isArray(p.images) ? p.images : []).map((e) => asRecord(e) ?? {});
}

function kindOf(p: Record<string, unknown>): DesignStepKind {
  const roles = imageEntries(p).map((e) => (typeof e.role === 'string' ? e.role : 'reference'));
  if (roles.includes('drawing')) return 'doodle';
  if (roles.includes('markup')) return 'annotated_edit';
  if (roles.includes('base')) {
    const prompt = typeof p.prompt === 'string' ? p.prompt.trim() : '';
    return !prompt && typeof p.view === 'string' && p.view.trim() ? 'angle' : 'edit';
  }
  return roles.length ? 'inspiration' : 'idea';
}

/** The design this run edited (its `base` picture), if any. */
function baseArtifact(inputPayload: unknown): unknown {
  const base = imageEntries(payloadRoot(inputPayload)).find((e) => e.role === 'base');
  return base ? base.artifact ?? base.image ?? null : null;
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

const time = (v: string | null | undefined) => {
  const t = v ? Date.parse(v) : NaN;
  return Number.isNaN(t) ? null : t;
};

/**
 * Walks back from the picture a CAD was built from, one design run at a time.
 * Stops at a run with no recorded source, an unreadable run, a loop, or the
 * caps. Returns null when no design run made the picture (Image to CAD, or an
 * older upload).
 */
export async function traceDesignHistory(
  cadImageArtifact: unknown,
  cadCreatedAt: string | null,
  { fetchRun, listRuns }: DesignHistorySources,
  maxSteps = MAX_DESIGN_HISTORY_STEPS,
  maxReads = MAX_DESIGN_RUNS_READ,
): Promise<DesignHistory | null> {
  const details = new Map<string, Promise<DesignRunDetail | null>>();
  let reads = 0;
  const read = (id: string) => {
    if (!details.has(id)) {
      reads += 1;
      details.set(id, fetchRun(id).catch(() => null));
    }
    return details.get(id)!;
  };

  let candidates: DesignRunSummary[] | null = null;
  const runsBefore = async (before: number | null) => {
    if (candidates === null) {
      try {
        candidates = [...(await listRuns())].sort((a, b) => (time(b.created_at) ?? 0) - (time(a.created_at) ?? 0));
      } catch {
        candidates = [];
      }
    }
    return candidates.filter((r) => before === null || (time(r.created_at) ?? 0) <= before);
  };

  /** The run that made this picture: by stored path, else by matching outputs, newest first. */
  const findMaker = async (artifact: unknown, before: number | null): Promise<DesignRunDetail | null> => {
    const byPath = designRunIdFromArtifact(artifact);
    if (byPath) return read(byPath);
    const sha = artifactSha(artifact);
    if (!sha) return null;
    for (const run of await runsBefore(before)) {
      if (!details.has(run.workflow_id) && reads >= maxReads) return null;
      const detail = await read(run.workflow_id);
      if (detail && designRunOutputSha(detail) === sha) return detail;
    }
    return null;
  };

  const steps: DesignHistoryStep[] = [];
  const seen = new Set<string>();
  let brokenAtMarkup = false;
  let artifact: unknown = cadImageArtifact;
  let before = time(cadCreatedAt);

  while (steps.length < maxSteps) {
    const detail = await findMaker(artifact, before);
    if (!detail || seen.has(detail.workflow_id)) break;
    seen.add(detail.workflow_id);
    const step = designStepFromRun(detail, inputImageUrl(artifact));
    steps.push(step);
    const base = baseArtifact(detail.input_payload);
    if (!base) {
      brokenAtMarkup = step.kind === 'annotated_edit';
      break;
    }
    artifact = base;
    before = time(detail.created_at) ?? before;
  }

  return steps.length ? { steps: steps.reverse(), brokenAtMarkup } : null;
}

/** The CAD run's picture, from its payload. */
export function cadDesignArtifact(inputPayload: unknown): unknown {
  return payloadRoot(inputPayload).image_artifact ?? null;
}

/** Worth looking for design runs: a CAD from Idea / Inspiration built from a picture. */
export function mayHaveDesignHistory(inputPayload: unknown): boolean {
  const p = payloadRoot(inputPayload);
  const flow = typeof p.client_flow === 'string' ? p.client_flow : null;
  const artifact = p.image_artifact ?? null;
  if (designRunIdFromArtifact(artifact)) return true;
  return (flow === 'idea' || flow === 'inspiration') && Boolean(artifactSha(artifact));
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
