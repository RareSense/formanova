/**
 * admin-rhino-users-api.ts
 *
 * GET /admin/rhino-users (temporal-agentic-pipeline #145): Rhino totals plus one row per user
 * with a Rhino run, newest last run first. Only runs tagged client='rhino' count, which Rhino
 * plugin 0.6.0+ sends. `total` is the user count, used for paging. `created_after` is inclusive
 * and `created_before` exclusive, both on run start; naive values are read as UTC.
 */
import { adminGenerationsFetch } from '@/lib/admin-generations-api';

const ADMIN_RHINO_USERS_PATH = '/api/admin/rhino-users';

export interface AdminRhinoTotals {
  users: number;
  runs: number;
  credits: number;
}

export interface AdminRhinoUser {
  user_id: string;
  user_email: string;
  first_run_at: string;
  last_run_at: string;
  runs: number;
  /** Settled charge (actual_cost) summed over the user's Rhino runs. */
  credits: number;
}

export interface AdminRhinoUsersResponse {
  totals: AdminRhinoTotals;
  items: AdminRhinoUser[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminRhinoUsersParams {
  limit?: number;
  offset?: number;
  created_after?: string;
  created_before?: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function isDay(value: string): boolean {
  if (!DAY.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * Inclusive from/to days (YYYY-MM-DD, as a date input gives them) to the backend range.
 * `created_before` is exclusive, so an inclusive "to" day becomes the start of the next day.
 * Days are UTC, like the other admin date filters.
 */
export function rhinoDateRange(from: string, to: string): Pick<AdminRhinoUsersParams, 'created_after' | 'created_before'> {
  const range: Pick<AdminRhinoUsersParams, 'created_after' | 'created_before'> = {};
  if (isDay(from)) range.created_after = `${from}T00:00:00`;
  if (isDay(to)) {
    const next = new Date(`${to}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    range.created_before = `${next.toISOString().slice(0, 10)}T00:00:00`;
  }
  return range;
}

export async function listAdminRhinoUsers(params: AdminRhinoUsersParams = {}): Promise<AdminRhinoUsersResponse> {
  const q = new URLSearchParams();
  if (params.limit !== undefined) q.set('limit', String(params.limit));
  if (params.offset !== undefined) q.set('offset', String(params.offset));
  if (params.created_after) q.set('created_after', params.created_after);
  if (params.created_before) q.set('created_before', params.created_before);

  const response = await adminGenerationsFetch(`${ADMIN_RHINO_USERS_PATH}${q.toString() ? `?${q.toString()}` : ''}`);
  const data = await response.json();
  const items: AdminRhinoUser[] = Array.isArray(data?.items) ? data.items : [];
  const totals = data?.totals ?? {};

  return {
    totals: {
      users: Number(totals.users) || 0,
      runs: Number(totals.runs) || 0,
      credits: Number(totals.credits) || 0,
    },
    items,
    total: typeof data?.total === 'number' ? data.total : items.length,
    limit: typeof data?.limit === 'number' ? data.limit : params.limit ?? items.length,
    offset: typeof data?.offset === 'number' ? data.offset : params.offset ?? 0,
  };
}
