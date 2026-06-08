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

// ─── Admin types ─────────────────────────────────────────────────────────────

export type FeedbackStatus = 'open' | 'looks_fine' | 'resolved';

export interface AdminFeedbackItem {
  id: string;
  workflow_id: string;
  user_id: string;
  user_email: string;
  username: string;
  category: string;
  generation_type: string;
  complaint: string;
  input_image_urls: string[];
  output_image_url: string;
  status: FeedbackStatus;
  admin_notes: string | null;
  contacted: boolean;
  revised_output_url: string | null;
  created_at: string;
}

export interface AdminFeedbackStats {
  total: number;
  open: number;
  looks_fine: number;
  resolved: number;
}

export interface AdminFeedbackListParams {
  status?: FeedbackStatus;
  category?: string;
  q?: string;
  from?: string;
  to?: string;
  sort_by?: 'created_at' | 'status' | 'category';
  sort_dir?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface AdminFeedbackListResponse {
  items: AdminFeedbackItem[];
  total: number;
  page: number;
  limit: number;
}

export interface UpdateFeedbackPayload {
  status?: FeedbackStatus;
  admin_notes?: string;
  contacted?: boolean;
}

// ─── Admin API functions ──────────────────────────────────────────────────────

export async function listAdminFeedback(params: AdminFeedbackListParams = {}): Promise<AdminFeedbackListResponse> {
  const q = new URLSearchParams();
  if (params.status)   q.set('status',   params.status);
  if (params.category) q.set('category', params.category);
  if (params.q)        q.set('q',        params.q);
  if (params.from)     q.set('from',     params.from);
  if (params.to)       q.set('to',       params.to);
  if (params.sort_by)  q.set('sort_by',  params.sort_by);
  if (params.sort_dir) q.set('sort_dir', params.sort_dir);
  if (params.page)     q.set('page',     String(params.page));
  if (params.limit)    q.set('limit',    String(params.limit));
  const res = await authenticatedFetch(`/api/feedback?${q.toString()}`);
  if (!res.ok) throw new Error(`Failed to fetch feedback: ${res.status}`);
  return res.json();
}

export async function getAdminFeedbackById(id: string): Promise<AdminFeedbackItem> {
  const res = await authenticatedFetch(`/api/feedback/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch feedback: ${res.status}`);
  const data = await res.json();
  // Backend returns reporter_email; map to user_email for the detail sheet
  if (data.reporter_email && !data.user_email) {
    data.user_email = data.reporter_email;
  }
  return data;
}

export async function updateAdminFeedback(id: string, payload: UpdateFeedbackPayload): Promise<AdminFeedbackItem> {
  const res = await authenticatedFetch(`/api/feedback/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to update feedback: ${res.status}`);
  return res.json();
}

/**
 * POST /api/feedback/{id}/revised-output
 * Payload format: { base64: string, content_type: string } — confirm with backend.
 */
// ─── New GET /feedback list endpoint ─────────────────────────────────────────
// Separate from the legacy admin-specific list above. Uses offset pagination,
// email_status filter, and returns reporter_email / email notification fields.

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
  const res = await authenticatedFetch(`/api/feedback?${q.toString()}`);
  if (!res.ok) throw new Error(`Failed to fetch feedback: ${res.status}`);
  return res.json();
}

export async function uploadRevisedOutput(id: string, file: File): Promise<{ revised_output_url: string }> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const res = await authenticatedFetch(`/api/feedback/${id}/revised-output`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64, content_type: file.type }),
  });
  if (!res.ok) throw new Error(`Failed to upload revised output: ${res.status}`);
  return res.json();
}
