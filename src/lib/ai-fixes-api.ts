import { authenticatedFetch } from '@/lib/authenticated-fetch';

export type AIFixStatus = 'running' | 'completed' | 'failed' | 'cancelled';
export type AIFixShotType = 'model_shot' | 'product_shot';

export interface AIFixListItem {
  workflow_id: string;
  workflow_name: string;
  /** Backend source_type enum (e.g. 'model_fix' | 'product_fix'), when provided.
   * Preferred over parsing workflow_name; falls back to the name when absent (Step 6). */
  source_type?: string;
  status: AIFixStatus;
  created_at: string;
  finished_at: string | null;
  user_email: string;
  category: string | null;
  prompt: string | null;
}

export interface AIFixDetail extends AIFixListItem {
  input_image_urls: string[];
  output_image_url: string | null;
}

export interface AIFixListParams {
  limit?: number;
  offset?: number;
  category?: string;
  workflow_name?: string;
  shot_type?: AIFixShotType;
  status?: AIFixStatus;
  created_after?: string;
  created_before?: string;
}

export interface AIFixListResponse {
  items: AIFixListItem[];
  total: number;
  limit: number;
  offset: number;
}

export async function listAIFixes(params: AIFixListParams = {}): Promise<AIFixListResponse> {
  const q = new URLSearchParams();
  if (params.limit !== undefined)    q.set('limit',          String(params.limit));
  if (params.offset !== undefined)   q.set('offset',         String(params.offset));
  if (params.category)               q.set('category',       params.category);
  if (params.workflow_name)          q.set('workflow_name',  params.workflow_name);
  if (params.shot_type)              q.set('shot_type',      params.shot_type);
  if (params.status)                 q.set('status',         params.status);
  if (params.created_after)          q.set('created_after',  params.created_after);
  if (params.created_before)         q.set('created_before', params.created_before);
  const res = await authenticatedFetch(`/api/admin/ai-fixes?${q.toString()}`);
  if (!res.ok) throw new Error(`Failed to fetch AI fixes: ${res.status}`);
  return res.json();
}

export async function getAIFixById(workflowId: string): Promise<AIFixDetail> {
  const res = await authenticatedFetch(`/api/admin/ai-fixes/${workflowId}`);
  if (!res.ok) throw new Error(`Failed to fetch AI fix detail: ${res.status}`);
  return res.json();
}
