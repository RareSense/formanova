import { azureUriToUrl } from '@/lib/azure-utils';
import type { PhotoshootResultResponse, PhotoshootStatusResponse } from '@/lib/photoshoot-api';

export type PhotoshootWorkflowState =
  | 'running'
  | 'completed'
  | 'failed'
  | 'budget_exhausted'
  | 'unknown';

export function resolvePhotoshootWorkflowState(
  status: PhotoshootStatusResponse,
): PhotoshootWorkflowState {
  return status.runtime?.state || status.progress?.state || status.state || 'unknown';
}

export function derivePhotoshootProgress(status: PhotoshootStatusResponse): {
  progress: number;
  step: string;
} {
  const total = Math.max(status.progress?.total_nodes ?? 1, 1);
  const done = Math.max(status.progress?.completed_nodes ?? 0, 0);
  const progress = Math.min(35 + Math.round((done / total) * 60), 95);
  const visited = status.progress?.visited ?? [];
  const step = visited.length > 0
    ? visited[visited.length - 1].replace(/_/g, ' ')
    : 'Generating photoshoot...';

  return { progress, step };
}

function normalizeOutputUrl(value: string): string | null {
  if (value.startsWith('azure://')) return azureUriToUrl(value);
  if (value.startsWith('http') || value.startsWith('data:')) return value;
  return null;
}

export function extractPhotoshootResultImages(
  result: PhotoshootResultResponse,
): string[] {
  const images: string[] = [];
  for (const key of Object.keys(result)) {
    const items = result[key];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      for (const candidate of ['output_url', 'image_url', 'result_url', 'url', 'image_b64', 'output_image']) {
        const value = obj[candidate];
        if (typeof value !== 'string' || value.length === 0) continue;
        const normalized = normalizeOutputUrl(value);
        if (normalized) images.push(normalized);
      }
    }
  }
  return images;
}
