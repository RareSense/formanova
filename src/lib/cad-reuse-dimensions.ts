import { listMyWorkflows } from '@/lib/generation-history-api';
import type { CadLibraryEntry } from '@/hooks/useCadHistoryLibrary';

/**
 * The dimensions typed for the latest finished CAD from Image run that used
 * any of these "My Pieces" images, or null. Runs are matched on the image's
 * asset id or content hash, since the vault stores pictures only.
 */
export async function findReusedDimensions(entry: Pick<CadLibraryEntry, 'assetIds' | 'sha256s'>): Promise<string | null> {
  const keys = new Set([...entry.assetIds, ...(entry.sha256s ?? [])].filter(Boolean));
  if (keys.size === 0) return null;
  const runs = await listMyWorkflows(100, 0);
  const match = runs
    .filter((w) => w.source_type === 'image_to_cad' && (w.client_flow ?? 'image') === 'image' && w.status === 'completed' && w.prompt)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .find((w) => (w.reference_image_keys ?? []).some((k) => keys.has(k)));
  return match?.prompt ?? null;
}
