// Persists a pending upscale selection across a credits-purchase round-trip.
//
// When an upscale is blocked by insufficient credits, the user is sent to
// /pricing and (via Stripe) out of the SPA entirely. sessionStorage survives
// that round-trip within the same tab, so we stash the exact selection (image +
// factor + source tier) and re-arm it on return instead of making the user
// start over. Session-scoped and TTL-bounded so a stale intent never silently
// re-arms a much later visit.

import type { Resolution } from '@/components/studio/OutputSettingsPills';

const KEY = 'formanova_pending_upscale_v1';
const TTL_MS = 60 * 60 * 1000; // 1 hour - long enough for a checkout, short enough to expire

export interface UpscaleIntent {
  /** The image the user wanted to enlarge (SAS https URL or azure:// URI). */
  imageUri: string;
  /** Source tier - drives billing and the priced factor set. */
  resolution: Resolution;
  /** Integer multiplier the user had selected. */
  factor: number;
  isProductShot: boolean;
  jewelryType: string;
  /** Epoch ms when persisted; used for TTL expiry. */
  savedAt: number;
}

export function saveUpscaleIntent(intent: Omit<UpscaleIntent, 'savedAt'>): void {
  try {
    const payload: UpscaleIntent = { ...intent, savedAt: Date.now() };
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // quota exceeded or storage unavailable - resume is best-effort, never fatal
  }
}

export function loadUpscaleIntent(): UpscaleIntent | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UpscaleIntent>;
    if (
      !parsed ||
      typeof parsed.imageUri !== 'string' ||
      typeof parsed.factor !== 'number' ||
      typeof parsed.savedAt !== 'number'
    ) {
      clearUpscaleIntent();
      return null;
    }
    if (Date.now() - parsed.savedAt > TTL_MS) {
      clearUpscaleIntent();
      return null;
    }
    return parsed as UpscaleIntent;
  } catch {
    // Malformed JSON or storage access error - treat as no pending intent.
    return null;
  }
}

export function clearUpscaleIntent(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // non-fatal
  }
}
