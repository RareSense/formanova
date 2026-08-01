import { authenticatedFetch } from '@/lib/authenticated-fetch';

export type UserType =
  | 'jewelry_brand'
  | 'freelancer'
  | 'researcher_student'
  | 'content_creator'
  | 'other';

export type UserProfile = {
  id: string;
  email: string;
  external_user_id: string;
  user_type: UserType | null;
};

const KEY_PREFIX = 'formanova_onboarding_';
const TOS_KEY_PREFIX = 'formanova_upload_guide_v2_';

export function isOnboardingComplete(userId: string): boolean {
  return localStorage.getItem(KEY_PREFIX + userId) === 'true';
}

export function markOnboardingComplete(userId: string): void {
  localStorage.setItem(KEY_PREFIX + userId, 'true');
}

export function isTosAgreed(userId: string): boolean {
  return localStorage.getItem(TOS_KEY_PREFIX + userId) === 'true';
}

export function markTosAgreed(userId: string): void {
  localStorage.setItem(TOS_KEY_PREFIX + userId, 'true');
}

/**
 * GET /api/user/profile — returns the current user's profile.
 * user_type is null if onboarding has not been completed.
 */
export async function getUserProfile(): Promise<UserProfile> {
  const res = await authenticatedFetch('/api/user/profile');
  if (!res.ok) throw new Error(`Failed to fetch profile: ${res.status}`);
  return res.json();
}

const USER_TYPE_CACHE_PREFIX = 'formanova_user_type_';

/** Seed the per-user cache (called wherever the profile is already known). */
export function setCachedUserType(userId: string, userType: UserType | null): void {
  if (userType) sessionStorage.setItem(USER_TYPE_CACHE_PREFIX + userId, userType);
}

/**
 * user_type for UI gating (e.g. the Brand Details menu entry), cached per
 * session so the header does not refetch the profile on every mount.
 */
export async function getCachedUserType(userId: string): Promise<UserType | null> {
  const cached = sessionStorage.getItem(USER_TYPE_CACHE_PREFIX + userId);
  if (cached) return cached as UserType;
  try {
    const profile = await getUserProfile();
    setCachedUserType(userId, profile.user_type);
    return profile.user_type;
  } catch {
    return null;
  }
}

/**
 * PATCH /api/user/profile — saves user_type against the authenticated user.
 * Required backend endpoint:
 *   PATCH /api/user/profile
 *   Auth: Bearer <token>
 *   Body: { "user_type": "jewelry_brand" | "freelancer" | "researcher_student" | "content_creator" | "other" }
 *   Response 200: { "success": true }
 */
export interface BrandDetails {
  brand_name: string;
  website_url?: string;
  storefront_url?: string;
  physical_location?: string;
  social_links?: string[];
  based_in?: string;
  target_markets?: string[];
}

export async function saveUserType(userType: UserType, brandDetails?: BrandDetails | null): Promise<void> {
  const body: Record<string, unknown> = { user_type: userType };
  if (brandDetails) {
    body.brand_name = brandDetails.brand_name;
    if (brandDetails.website_url) body.website_url = brandDetails.website_url;
    if (brandDetails.storefront_url) body.storefront_url = brandDetails.storefront_url;
    if (brandDetails.physical_location) body.physical_location = brandDetails.physical_location;
    if (brandDetails.social_links?.length) body.social_links = brandDetails.social_links;
    if (brandDetails.based_in) body.based_in = brandDetails.based_in;
    if (brandDetails.target_markets?.length) body.target_markets = brandDetails.target_markets;
  }
  const res = await authenticatedFetch('/api/user/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Failed to save user type: ${res.status}`);
  }
}

/**
 * GET /api/user/acknowledgements — returns all acknowledgements for the user.
 * Returns true if tos v1.0 is already acknowledged.
 *
 *   Response 200: { "acknowledgements": [{ "acknowledgement_type": "tos", "version": "1.0", "signed_at": "..." }] }
 */
export async function checkTosAgreement(): Promise<boolean> {
  const res = await authenticatedFetch('/api/user/acknowledgements');
  if (!res.ok) throw new Error(`Failed to fetch acknowledgements: ${res.status}`);
  const data = await res.json();
  return (data.acknowledgements as { acknowledgement_type: string; version: string }[]).some(
    (a) => a.acknowledgement_type === 'tos' && a.version === '1.0',
  );
}

/**
 * POST /api/user/acknowledgements — records that the user has acknowledged tos v1.0.
 *
 *   Body: { "acknowledgement_type": "tos", "version": "1.0" }
 *   Response 201: { "acknowledgement_type": "tos", "version": "1.0", "signed_at": "..." }
 *   Response 200: same (idempotent — safe to call multiple times)
 */
export async function signTosAgreement(): Promise<void> {
  const res = await authenticatedFetch('/api/user/acknowledgements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acknowledgement_type: 'tos', version: '1.0' }),
  });
  if (!res.ok) throw new Error(`Failed to sign acknowledgement: ${res.status}`);
}

/**
 * GET /api/user/acknowledgements — returns true if the user has already seen the upload instructions.
 */
export async function checkUploadInstructionsSeen(): Promise<boolean> {
  const res = await authenticatedFetch('/api/user/acknowledgements');
  if (!res.ok) throw new Error(`Failed to fetch acknowledgements: ${res.status}`);
  const data = await res.json();
  return (data.acknowledgements as { acknowledgement_type: string; version: string }[]).some(
    (a) => a.acknowledgement_type === 'photoshoot_upload_instructions' && a.version === '1.0',
  );
}

/**
 * POST /api/user/acknowledgements — marks that the user has seen the upload instructions.
 *
 *   Body: { "acknowledgement_type": "photoshoot_upload_instructions", "version": "1.0" }
 *   Response 201/200: idempotent
 */
export async function markUploadInstructionsSeen(): Promise<void> {
  const res = await authenticatedFetch('/api/user/acknowledgements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acknowledgement_type: 'photoshoot_upload_instructions', version: '1.0' }),
  });
  if (!res.ok) throw new Error(`Failed to mark upload instructions seen: ${res.status}`);
}

// ─── Product Shot Guide ───────────────────────────────────────────────────────

const PRODUCT_SHOT_GUIDE_KEY_PREFIX = 'formanova_product_shot_guide_v1_';

export function isProductShotGuideSeen(userId: string): boolean {
  return localStorage.getItem(PRODUCT_SHOT_GUIDE_KEY_PREFIX + userId) === 'true';
}

export function markProductShotGuideSeenLocal(userId: string): void {
  localStorage.setItem(PRODUCT_SHOT_GUIDE_KEY_PREFIX + userId, 'true');
}

/**
 * GET /api/user/acknowledgements — returns true if the user has already seen the product shot guide.
 */
export async function checkProductShotGuideSeen(): Promise<boolean> {
  const res = await authenticatedFetch('/api/user/acknowledgements');
  if (!res.ok) throw new Error(`Failed to fetch acknowledgements: ${res.status}`);
  const data = await res.json();
  return (data.acknowledgements as { acknowledgement_type: string; version: string }[]).some(
    (a) => a.acknowledgement_type === 'product_shot_upload_instructions' && a.version === '1.0',
  );
}

/**
 * POST /api/user/acknowledgements — marks that the user has seen the product shot guide.
 *
 *   Body: { "acknowledgement_type": "product_shot_upload_instructions", "version": "1.0" }
 *   Response 201/200: idempotent
 */
export async function markProductShotGuideSeen(): Promise<void> {
  const res = await authenticatedFetch('/api/user/acknowledgements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acknowledgement_type: 'product_shot_upload_instructions', version: '1.0' }),
  });
  if (!res.ok) throw new Error(`Failed to mark product shot guide seen: ${res.status}`);
}

