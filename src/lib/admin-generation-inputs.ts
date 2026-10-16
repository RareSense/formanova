/**
 * admin-generation-inputs.ts
 *
 * Reads what the customer sent for the CAD studio runs so the admin detail page
 * can show it: design pictures (design_image_v1) and CAD runs started from
 * Image / Idea / Inspiration (client_flow). Pure functions only.
 *
 * design_image_v1 payload (see design-image-api.ts):
 *   { prompt, images: [{ role, artifact }], output, view?, jewelry_type?, dimensions? }
 * `artifact` is a stored artifact ({ uri, type, sha256 }) once the backend has
 * received it, or the data: URL / plain URL the browser sent.
 */

export interface AdminInputImage {
  url: string;
  label: string;
}

export interface AdminInputDetail {
  label: string;
  value: string;
}

export interface AdminRunInputs {
  /** What the run was asked, in full, as sent. */
  prompt: string | null;
  images: AdminInputImage[];
  details: AdminInputDetail[];
}

const ROLE_LABELS: Record<string, string> = {
  base: 'Design being edited',
  markup: 'Design with annotations',
  drawing: 'Doodle',
  reference: 'Inspiration / reference',
};

const FLOW_LABELS: Record<string, string> = {
  image: 'CAD from Image',
  idea: 'CAD from Idea',
  inspiration: 'CAD from Inspiration',
};

const PROMPT_KEYS = ['prompt', 'user_description', 'description', 'ring_description', 'text_input', 'input_text', 'text', 'query'];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** The request is stored either flat or wrapped as { payload: {...} }. */
export function payloadRoot(inputPayload: unknown): Record<string, unknown> {
  const root = asRecord(inputPayload) ?? {};
  return asRecord(root.payload) ?? root;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** A picture we can show: http(s), artifact proxy, azure:// or an inline data: image. */
export function inputImageUrl(value: unknown): string | null {
  if (typeof value === 'string') {
    const v = value.trim();
    if (v.startsWith('data:image/')) return v;
    if (v.startsWith('https://') || v.startsWith('http://') || v.startsWith('azure://') || v.includes('/artifacts/')) return v;
    return null;
  }
  const record = asRecord(value);
  if (!record) return null;
  // Stored artifacts don't always carry a mime type, so the url alone decides.
  return inputImageUrl(record.url) ?? inputImageUrl(record.uri) ?? inputImageUrl(record.data_url);
}

export function cadFlowLabel(inputPayload: unknown): string | null {
  const flow = text(payloadRoot(inputPayload).client_flow);
  return flow ? FLOW_LABELS[flow] ?? null : null;
}

export function isDesignImageWorkflow(workflowName: string | null | undefined): boolean {
  return (workflowName ?? '').toLowerCase().startsWith('design_image');
}

function designImageInputs(p: Record<string, unknown>): AdminRunInputs {
  const entries = Array.isArray(p.images) ? p.images : [];
  const counts: Record<string, number> = {};
  const roles = entries.map((entry) => text(asRecord(entry)?.role) ?? 'reference');
  roles.forEach((role) => { counts[role] = (counts[role] ?? 0) + 1; });
  const seen: Record<string, number> = {};
  const images = entries.flatMap((entry, i) => {
    const record = asRecord(entry);
    const url = inputImageUrl(record ? record.artifact ?? record.image ?? record : entry);
    if (!url) return [];
    const role = roles[i];
    seen[role] = (seen[role] ?? 0) + 1;
    const base = ROLE_LABELS[role] ?? role;
    return [{ url, label: counts[role] > 1 ? `${base} ${seen[role]}` : base }];
  });

  const details: AdminInputDetail[] = [];
  const add = (label: string, value: unknown) => {
    const v = text(value);
    if (v) details.push({ label, value: v });
  };
  add('Category', p.jewelry_type);
  add('Angle', p.view);
  add('Dimensions', p.dimensions);
  add('Output', p.output);

  return { prompt: text(p.prompt), images, details };
}

function cadInputs(p: Record<string, unknown>): AdminRunInputs {
  const refs = Array.isArray(p.reference_image_artifacts) ? p.reference_image_artifacts : [];
  const urls = [...new Set(
    [...refs, p.image_artifact].map(inputImageUrl).filter((u): u is string => Boolean(u)),
  )];
  const label = text(p.client_flow) === 'image' || !text(p.client_flow) ? 'Uploaded photo' : 'Approved design';
  const images = urls.map((url, i) => ({ url, label: urls.length > 1 ? `${label} ${i + 1}` : label }));

  const details: AdminInputDetail[] = [];
  const flow = cadFlowLabel(p);
  if (flow) details.push({ label: 'Flow', value: flow });
  const type = text(p.jewelry_type);
  if (type) details.push({ label: 'Category', value: type });
  const alloy = text(asRecord(p.material)?.alloy);
  if (alloy) details.push({ label: 'Material', value: alloy });
  const tier = text(p.llm_tier);
  if (tier) details.push({ label: 'Tier', value: tier });

  const prompt = PROMPT_KEYS.map((k) => text(p[k])).find(Boolean) ?? null;
  return { prompt, images, details };
}

/**
 * Inputs for the CAD studio runs, or null for any other workflow so the page
 * keeps its existing rendering for those.
 */
export function readCadStudioInputs(
  workflowName: string | null | undefined,
  inputPayload: unknown,
  isCadModel: boolean,
): AdminRunInputs | null {
  const p = payloadRoot(inputPayload);
  if (isDesignImageWorkflow(workflowName)) return designImageInputs(p);
  if (isCadModel) return cadInputs(p);
  return null;
}
