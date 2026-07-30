import { authenticatedFetch } from '@/lib/authenticated-fetch';

const ADMIN_BRANDS_BASE = '/api/admin/users/brands';

export class AdminBrandsApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'AdminBrandsApiError';
    this.status = status;
  }
}

/** All 9 backend-detectable platforms plus unknown. Keep in sync with the backend probe. */
export const STORE_PLATFORMS = [
  'shopify',
  'etsy',
  'woocommerce',
  'bigcommerce',
  'wix',
  'squarespace',
  'magento',
  'webflow',
  'unknown',
] as const;

export type StorePlatform = (typeof STORE_PLATFORMS)[number];

export interface AdminBrandsListParams {
  limit?: number;
  offset?: number;
  search?: string;
  platform?: string;
  location?: string;
  has_brand?: boolean;
  has_store?: boolean;
  has_brand_book?: boolean;
  sort?: 'brand_updated_at' | 'brand_name' | 'email';
  order?: 'asc' | 'desc';
}

export interface AdminBrandListItem {
  user_id: string;
  email: string;
  user_type: string | null;
  brand_name: string | null;
  website_url: string | null;
  storefront_url: string | null;
  physical_location: string | null;
  store_platform: string | null;
  social_links: string[];
  based_in: string | null;
  target_markets: string[];
  brand_book_asset_id: string | null;
  brand_updated_at: string | null;
}

export interface AdminBrandsListResponse {
  items: AdminBrandListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminBrandDetail extends AdminBrandListItem {
  brand_book_url: string | null;
}

function normalizeItem(raw: unknown): AdminBrandListItem {
  const item = (raw ?? {}) as Partial<AdminBrandListItem> & { id?: string };
  return {
    user_id: item.user_id ?? item.id ?? '',
    email: item.email ?? '',
    user_type: item.user_type ?? null,
    brand_name: item.brand_name ?? null,
    website_url: item.website_url ?? null,
    storefront_url: item.storefront_url ?? null,
    physical_location: item.physical_location ?? null,
    store_platform: item.store_platform ?? null,
    social_links: Array.isArray(item.social_links) ? item.social_links : [],
    based_in: item.based_in ?? null,
    target_markets: Array.isArray(item.target_markets) ? item.target_markets : [],
    brand_book_asset_id: item.brand_book_asset_id ?? null,
    brand_updated_at: item.brand_updated_at ?? null,
  };
}

async function adminBrandsFetch(path: string): Promise<Response> {
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
    throw new AdminBrandsApiError(response.status, message);
  }
  return response;
}

export async function listAdminBrands(
  params: AdminBrandsListParams = {},
): Promise<AdminBrandsListResponse> {
  const q = new URLSearchParams();
  if (params.limit !== undefined) q.set('limit', String(params.limit));
  if (params.offset !== undefined) q.set('offset', String(params.offset));
  if (params.search) q.set('search', params.search);
  if (params.platform) q.set('platform', params.platform);
  if (params.location) q.set('location', params.location);
  if (params.has_brand !== undefined) q.set('has_brand', String(params.has_brand));
  if (params.has_store !== undefined) q.set('has_store', String(params.has_store));
  if (params.has_brand_book !== undefined) q.set('has_brand_book', String(params.has_brand_book));
  if (params.sort) q.set('sort', params.sort);
  if (params.order) q.set('order', params.order);

  const response = await adminBrandsFetch(
    `${ADMIN_BRANDS_BASE}${q.toString() ? `?${q.toString()}` : ''}`,
  );
  const data = await response.json();
  const rawItems = Array.isArray(data.items) ? data.items : [];

  return {
    items: rawItems.map(normalizeItem),
    total: typeof data.total === 'number' ? data.total : rawItems.length,
    limit: typeof data.limit === 'number' ? data.limit : params.limit ?? rawItems.length,
    offset: typeof data.offset === 'number' ? data.offset : params.offset ?? 0,
  };
}

export async function getAdminBrandDetail(userId: string): Promise<AdminBrandDetail> {
  const response = await adminBrandsFetch(
    `/api/admin/users/${encodeURIComponent(userId)}/brand`,
  );
  const data = await response.json();
  return { ...normalizeItem(data), brand_book_url: data.brand_book_url ?? null };
}
