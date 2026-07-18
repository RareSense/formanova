import { authenticatedFetch } from '@/lib/authenticated-fetch';

const ADMIN_GENERATIONS_BASE = '/api/admin/generations';

export class AdminGenerationsApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'AdminGenerationsApiError';
    this.status = status;
  }
}

export type AdminGenerationStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | string;

export type AdminGenerationUserType =
  | 'jewelry_brand'
  | 'freelancer'
  | 'researcher_student'
  | 'content_creator'
  | 'other'
  | string;

export interface AdminGenerationsListParams {
  limit?: number;
  offset?: number;
  status?: string;
  workflow_name?: string;
  user_email?: string;
  has_feedback?: boolean;
  user_type?: string;
  is_paying?: boolean;
}

export interface AdminGenerationListItem {
  workflow_id: string;
  workflow_name: string;
  status: AdminGenerationStatus;
  created_at: string;
  finished_at: string | null;
  user_email: string;
  actual_cost: number | null;
  provider_cost: number | null;
  user_type: AdminGenerationUserType | null;
  is_paying: boolean;
  feedback_id: string | null;
}

export interface AdminGenerationsListResponse {
  items: AdminGenerationListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminGenerationStep {
  tool_name: string;
  took_ms: number | null;
  at: string | null;
  input: unknown;
  output: unknown;
}

export interface AdminGenerationFeedback {
  id: string;
  complaint: string;
  category: string;
  reporter_email: string;
  created_at: string;
  input_image_urls: string[] | null;
  output_image_url: string | null;
}

export interface AdminGenerationDetail {
  workflow_id: string;
  workflow_name: string;
  /** Backend source_type enum, when the endpoint provides it (Step 6). Consumers
   * prefer this over parsing workflow_name, falling back to the name when absent. */
  source_type?: string;
  status: AdminGenerationStatus;
  user_email: string;
  user_type: AdminGenerationUserType | null;
  is_paying: boolean;
  created_at: string;
  finished_at: string | null;
  actual_cost: number | null;
  total_provider_cost: number | null;
  input_payload: unknown;
  steps: AdminGenerationStep[];
  feedback: AdminGenerationFeedback | null;
}

function unwrapPayload(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;

  const nestedPayload = (value as Record<string, unknown>).payload;
  if (nestedPayload && typeof nestedPayload === 'object') {
    return nestedPayload;
  }

  return value;
}

function isRenderableUrl(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.includes('/artifacts/') ||
    /\.(png|jpg|jpeg|webp|gif|bmp|svg)(\?|$)/i.test(lower)
  );
}

function extractImageUrls(value: unknown): string[] {
  const urls = new Set<string>();

  function visit(node: unknown) {
    if (typeof node === 'string') {
      if (isRenderableUrl(node)) {
        urls.add(node);
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node && typeof node === 'object') {
      Object.values(node as Record<string, unknown>).forEach(visit);
    }
  }

  visit(value);
  return Array.from(urls);
}

function findString(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== 'object') return null;

  for (const key of keys) {
    const candidate = (value as Record<string, unknown>)[key];
    if (typeof candidate === 'string' && candidate) {
      return candidate;
    }
  }

  return null;
}

function findStringArray(value: unknown, keys: string[]): string[] {
  if (!value || typeof value !== 'object') return [];

  for (const key of keys) {
    const candidate = (value as Record<string, unknown>)[key];
    if (Array.isArray(candidate)) {
      return candidate.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
    }
  }

  return [];
}

function normalizeListItem(item: any): AdminGenerationListItem {
  return {
    workflow_id: item.workflow_id ?? item.id ?? '',
    workflow_name: item.workflow_name ?? item.name ?? '',
    status: item.status ?? 'unknown',
    created_at: item.created_at ?? '',
    finished_at: item.finished_at ?? null,
    user_email: item.user_email ?? item.email ?? '',
    actual_cost: typeof item.actual_cost === 'number' ? item.actual_cost : null,
    provider_cost: typeof item.provider_cost === 'number'
      ? item.provider_cost
      : typeof item.total_provider_cost === 'number'
        ? item.total_provider_cost
        : null,
    user_type: item.user_type ?? null,
    is_paying: Boolean(item.is_paying),
    feedback_id: item.feedback_id ?? null,
  };
}

function normalizeStep(step: any): AdminGenerationStep {
  return {
    tool_name: step.tool_name ?? step.tool ?? 'Unknown tool',
    took_ms: typeof step.took_ms === 'number' ? step.took_ms : null,
    at: step.at ?? step.created_at ?? null,
    input: step.input ?? step.input_data ?? null,
    output: step.output ?? step.output_data ?? null,
  };
}

function normalizeFeedback(feedback: any): AdminGenerationFeedback | null {
  if (!feedback) return null;
  return {
    id: feedback.id ?? feedback.feedback_id ?? '',
    complaint: feedback.complaint ?? '',
    category: feedback.category ?? 'other',
    reporter_email: feedback.reporter_email ?? feedback.user_email ?? '',
    created_at: feedback.created_at ?? '',
    input_image_urls: Array.isArray(feedback.input_image_urls) ? feedback.input_image_urls : null,
    output_image_url: feedback.output_image_url ?? null,
  };
}

async function adminGenerationsFetch(path: string): Promise<Response> {
  const response = await authenticatedFetch(path);

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const body = await response.json();
      if (typeof body?.detail === 'string') message = body.detail;
      else if (typeof body?.message === 'string') message = body.message;
    } catch {
      const text = await response.text().catch(() => '');
      if (text) message = text;
    }
    throw new AdminGenerationsApiError(response.status, message);
  }

  return response;
}

export async function listAdminGenerations(
  params: AdminGenerationsListParams = {},
): Promise<AdminGenerationsListResponse> {
  const q = new URLSearchParams();
  if (params.limit !== undefined) q.set('limit', String(params.limit));
  if (params.offset !== undefined) q.set('offset', String(params.offset));
  if (params.status) q.set('status', params.status);
  if (params.workflow_name) q.set('workflow_name', params.workflow_name);
  if (params.user_email) q.set('user_email', params.user_email);
  if (params.has_feedback !== undefined) q.set('has_feedback', String(params.has_feedback));
  if (params.user_type) q.set('user_type', params.user_type);
  if (params.is_paying !== undefined) q.set('is_paying', String(params.is_paying));

  const response = await adminGenerationsFetch(
    `${ADMIN_GENERATIONS_BASE}${q.toString() ? `?${q.toString()}` : ''}`,
  );
  const data = await response.json();
  const rawItems = Array.isArray(data)
    ? data
    : Array.isArray(data.items)
      ? data.items
      : Array.isArray(data.generations)
        ? data.generations
        : [];

  return {
    items: rawItems.map(normalizeListItem),
    total: typeof data.total === 'number' ? data.total : rawItems.length,
    limit: typeof data.limit === 'number' ? data.limit : params.limit ?? rawItems.length,
    offset: typeof data.offset === 'number' ? data.offset : params.offset ?? 0,
  };
}

export async function getAdminGenerationDetail(workflowId: string): Promise<AdminGenerationDetail> {
  const response = await adminGenerationsFetch(`${ADMIN_GENERATIONS_BASE}/${encodeURIComponent(workflowId)}`);
  const data = await response.json();
  const payload = data.data ?? data;

  return {
    workflow_id: payload.workflow_id ?? payload.id ?? workflowId,
    workflow_name: payload.workflow_name ?? payload.name ?? '',
    source_type: typeof payload.source_type === 'string' ? payload.source_type : undefined,
    status: payload.status ?? 'unknown',
    user_email: payload.user_email ?? payload.email ?? '',
    user_type: payload.user_type ?? null,
    is_paying: Boolean(payload.is_paying),
    created_at: payload.created_at ?? '',
    finished_at: payload.finished_at ?? null,
    actual_cost: typeof payload.actual_cost === 'number' ? payload.actual_cost : null,
    total_provider_cost: typeof payload.total_provider_cost === 'number'
      ? payload.total_provider_cost
      : typeof payload.provider_cost === 'number'
        ? payload.provider_cost
        : null,
    input_payload: unwrapPayload(payload.input_payload ?? payload.input ?? payload.payload ?? {}),
    steps: Array.isArray(payload.steps) ? payload.steps.map(normalizeStep) : [],
    feedback: normalizeFeedback(payload.feedback),
  };
}
