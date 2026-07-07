// Microservices API Client
// Routes through Edge Functions to Azure, Image Manipulator, BiRefNet, and SAM3

import { authenticatedFetch } from './authenticated-fetch';

const AZURE_UPLOAD_URL = `${import.meta.env.VITE_PIPELINE_API_URL}/upload`;

// ========== Azure Upload ==========
export interface AzureUploadResponse {
  uri: string;  // azure:// format for microservices
  sas_url: string;  // Proxy URL: /api/artifacts/<sha256> — use this everywhere
  https_url: string;  // Direct blob URL (no auth, avoid using)
  asset_id?: string | null;  // set by backend registration; null if fail-open triggered
  name?: string | null;
  display_name?: string | null;
}

export async function uploadToAzure(
  base64: string,
  contentType: string = 'image/jpeg',
  assetType?: 'jewelry_photo' | 'model_photo' | 'inspiration_photo',
  metadata?: Record<string, string>,
): Promise<AzureUploadResponse> {
  console.log('[microservices] Uploading to Azure...');

  const response = await authenticatedFetch(AZURE_UPLOAD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base64,
      content_type: contentType,
      ...(assetType ? { asset_type: assetType } : {}),
      ...(metadata ? { metadata } : {}),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('[microservices] Azure upload failed:', error);
    throw new Error(`Azure upload failed: ${error}`);
  }

  const data = await response.json();
  console.log('[microservices] Azure upload success:', data.uri);
  return data;
}

// ========== Bulk Jewelry Upload (grouped multi-image) ==========
const BULK_UPLOAD_URL = `${import.meta.env.VITE_PIPELINE_API_URL}/upload/bulk`;

/** Max photos of the same piece in one grouped upload. Backend 422s on 4+. */
export const MAX_BULK_JEWELRY_FILES = 3;

export interface BulkJewelryItem {
  asset_id: string;
  uri: string;      // azure:// form; accepted directly as a jewelry_image_urls[] entry on the run call
  sha256: string;
}

export interface BulkJewelryUploadResponse {
  jewelry: BulkJewelryItem[];   // cover first, matches upload order
  model: BulkJewelryItem[];
  background: BulkJewelryItem[];
  input_group_id: string;       // server-minted UUID for the set; read-only, never sent on upload
}

/**
 * POST /upload/bulk - upload 1-3 photos of the SAME jewelry piece as one grouped
 * set (multipart). The server mints input_group_id and returns it; the first file
 * is the cover (used for thumbnails/history). Returns per-file {asset_id, uri,
 * sha256} in upload order. Enforce max-3 client-side (backend 422s on 4+).
 * Single-image uploads keep using uploadToAzure. See Multi-Image Jewelry Input
 * handoff (2026-06-27).
 *
 * Send group_jewelry=true and the files only. Do NOT send input_group_id on the
 * write path (the server mints it). The endpoint does not accept category /
 * intended_use, so grouped assets carry no jewelry metadata yet - flagged to
 * backend; the per-file uploadToAzure path is unaffected.
 */
export async function bulkUploadJewelry(files: File[]): Promise<BulkJewelryUploadResponse> {
  if (files.length < 1 || files.length > MAX_BULK_JEWELRY_FILES) {
    throw new Error(`bulkUploadJewelry accepts 1-${MAX_BULK_JEWELRY_FILES} files (cover first).`);
  }
  const form = new FormData();
  files.forEach((f) => form.append('jewelry_files', f));
  form.append('group_jewelry', 'true');

  // No explicit Content-Type: the browser sets the multipart boundary; authenticatedFetch
  // still attaches the Bearer token.
  const response = await authenticatedFetch(BULK_UPLOAD_URL, { method: 'POST', body: form });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Bulk jewelry upload failed: ${response.status} - ${error.substring(0, 200)}`);
  }
  return response.json();
}

// ========== Polling Utility ==========
export interface PollOptions {
  maxAttempts?: number;
  intervalMs?: number;
  onProgress?: (attempt: number, status: string) => void;
}

export async function pollJobUntilComplete<T extends { status: string }>(
  pollFn: () => Promise<T>,
  options: PollOptions = {}
): Promise<T> {
  const { 
    maxAttempts = 120, // 2 minutes at 1s intervals
    intervalMs = 1000,
    onProgress 
  } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await pollFn();
    
    onProgress?.(attempt, result.status);
    
    if (result.status === 'completed' || result.status === 'succeeded') {
      console.log(`[microservices] Job completed after ${attempt} attempts`);
      return result;
    }
    
    if (result.status === 'failed') {
      throw new Error(`Job failed: ${(result as any).error || 'Unknown error'}`);
    }
    
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  
  throw new Error(`Job timed out after ${maxAttempts} attempts`);
}

