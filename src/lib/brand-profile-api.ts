import { authenticatedFetch } from '@/lib/authenticated-fetch';

export interface BrandProfile {
  brand_name: string;
  website_url: string;
  store_url: string;
  social_links: string[];
  based_in: string;
  target_markets: string[];
  brand_book_asset_id: string | null;
}

export interface BrandBookInfo {
  filename: string;
  url: string;
}

export const EMPTY_BRAND_PROFILE: BrandProfile = {
  brand_name: '',
  website_url: '',
  store_url: '',
  social_links: [],
  based_in: '',
  target_markets: [],
  brand_book_asset_id: null,
};

export const GENERIC_ERROR = 'Something went wrong. Please try again.';

/** Users often type "mybrand.com" — the backend rejects anything that isn't http(s). */
export function normalizeUrl(value: string): string {
  const v = value.trim();
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

export async function fetchBrandProfile(): Promise<BrandProfile> {
  const res = await authenticatedFetch('/api/user/profile');
  const data = await res.json();
  return {
    brand_name: data.brand_name ?? '',
    website_url: data.website_url ?? '',
    store_url: data.store_url ?? '',
    social_links: data.social_links ?? [],
    based_in: data.based_in ?? '',
    target_markets: data.target_markets ?? [],
    brand_book_asset_id: data.brand_book_asset_id ?? null,
  };
}

/**
 * PATCH one or more profile fields; returns a user-facing error message or
 * null on success. 422 responses carry field-level detail per the API spec.
 */
export async function patchBrandProfile(body: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await authenticatedFetch('/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return null;
    if (res.status === 422) {
      const data = await res.json().catch(() => null);
      const detail = data?.detail;
      if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
        return Object.entries(detail)
          .map(([field, msg]) => `${field.replace(/_/g, ' ')}: ${msg}`)
          .join('. ');
      }
    }
    return GENERIC_ERROR;
  } catch {
    return GENERIC_ERROR;
  }
}

export async function fetchBrandBook(): Promise<BrandBookInfo | null> {
  const res = await authenticatedFetch('/api/user/brand-book');
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.url) return null;
  return { filename: data.filename ?? 'Brand book', url: data.url };
}

export interface BrandBookUploadResult {
  ok: boolean;
  error?: string;
  assetId?: string;
  filename?: string;
  url?: string;
}

export const BRAND_BOOK_MAX_BYTES = 20 * 1024 * 1024;

export async function uploadBrandBook(file: File): Promise<BrandBookUploadResult> {
  if (file.size > BRAND_BOOK_MAX_BYTES) {
    return { ok: false, error: 'File is too large. Maximum size is 20 MB.' };
  }
  try {
    const form = new FormData();
    form.append('file', file);
    const res = await authenticatedFetch('/api/user/brand-book', { method: 'POST', body: form });
    if (res.status === 413) return { ok: false, error: 'File is too large. Maximum size is 20 MB.' };
    if (res.status === 400) return { ok: false, error: 'Unsupported file type. Use a PDF, PNG, JPG, or WEBP.' };
    if (!res.ok) return { ok: false, error: 'Upload failed. Please try again.' };
    const data = await res.json();
    return {
      ok: true,
      assetId: data.asset_id,
      filename: data.filename ?? file.name,
      url: data.url ?? '',
    };
  } catch {
    return { ok: false, error: 'Upload failed. Please try again.' };
  }
}

export async function deleteBrandBook(): Promise<string | null> {
  try {
    const res = await authenticatedFetch('/api/user/brand-book', { method: 'DELETE' });
    if (!res.ok) return 'Could not remove the file. Please try again.';
    return null;
  } catch {
    return 'Could not remove the file. Please try again.';
  }
}
