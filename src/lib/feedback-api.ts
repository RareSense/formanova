import { authenticatedFetch } from '@/lib/authenticated-fetch';

export async function checkHasSubmittedFeedback(): Promise<boolean> {
  try {
    const res = await authenticatedFetch('/api/my-feedback/exists');
    if (!res.ok) return false;
    const data = await res.json();
    return data.has_submitted === true;
  } catch {
    return false;
  }
}

export type GenerationType =
  | 'photoshoot'
  | 'text_to_cad';

export type FeedbackCategory =
  | 'necklace'
  | 'ring'
  | 'bracelet'
  | 'earring'
  | 'watch'
  | 'other';

export type FeedbackRequest = {
  workflow_id: string;
  generation_type: GenerationType;
  input_image_urls: string[];
  output_image_url: string;
  complaint: string;
  category: FeedbackCategory;
};

export type FeedbackResponse = {
  success: boolean;
  feedback_id: string;
  fix_workflow_id?: string;
};

/**
 * POST /api/feedback — submits a generation complaint.
 *   Auth: Bearer <jwt>
 *   Body: FeedbackRequest
 *   Response 200: { "success": true, "feedback_id": "..." }
 */
export async function submitFeedback(payload: FeedbackRequest): Promise<FeedbackResponse> {
  const res = await authenticatedFetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to submit feedback: ${res.status}`);
  return res.json();
}

export type EmailStatus = 'sent' | 'failed' | 'pending';

/** Item returned by GET /feedback (list) and GET /feedback/{id} (detail). */
export interface FeedbackItem {
  id: string;
  workflow_id: string;
  generation_type: string;
  category: string;
  complaint: string;
  input_image_urls: string[];
  output_image_url: string;
  reporter_email: string;
  created_at: string;
  email_sent_at: string | null;
  email_error: string | null;
}

export interface FeedbackListParams {
  limit?: number;           // 1–100, default 20
  offset?: number;          // ≥0
  category?: string;
  generation_type?: string;
  email_status?: EmailStatus;
  created_after?: string;   // ISO 8601
  created_before?: string;  // ISO 8601
  reporter_email?: string;  // case-insensitive substring match, server-side
}

export interface FeedbackListResponse {
  items: FeedbackItem[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * GET /api/feedback — paginated, filterable list for admins.
 * Results always most-recent-first. Auth: Bearer JWT (admin only).
 */
export async function listFeedback(params: FeedbackListParams = {}): Promise<FeedbackListResponse> {
  const q = new URLSearchParams();
  if (params.limit !== undefined)    q.set('limit',          String(params.limit));
  if (params.offset !== undefined)   q.set('offset',         String(params.offset));
  if (params.category)               q.set('category',       params.category);
  if (params.generation_type)        q.set('generation_type', params.generation_type);
  if (params.email_status)           q.set('email_status',   params.email_status);
  if (params.created_after)          q.set('created_after',  params.created_after);
  if (params.created_before)         q.set('created_before', params.created_before);
  if (params.reporter_email)         q.set('reporter_email', params.reporter_email);
  const res = await authenticatedFetch(`/api/feedback?${q.toString()}`);
  if (!res.ok) throw new Error(`Failed to fetch feedback: ${res.status}`);
  return res.json();
}

export async function getAdminFeedbackById(id: string): Promise<FeedbackItem> {
  const res = await authenticatedFetch(`/api/feedback/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch feedback: ${res.status}`);
  return res.json();
}
