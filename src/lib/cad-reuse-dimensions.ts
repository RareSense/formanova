import { listMyWorkflows, type WorkflowSummary } from '@/lib/generation-history-api';
import type { CadLibraryEntry } from '@/hooks/useCadHistoryLibrary';

/** A prompt typed for a past run, and when that run was started. */
export interface RunPrompt {
  text: string;
  createdAt: string;
}

/**
 * Every distinct prompt typed for a finished CAD from Image run that used any
 * of these "My Pieces" images, newest first. Runs are matched on the image's
 * asset id or content hash, since the vault stores pictures only.
 */
export function matchRunPrompts(
  entry: Pick<CadLibraryEntry, 'assetIds' | 'sha256s'>,
  runs: WorkflowSummary[],
): RunPrompt[] {
  const keys = new Set([...entry.assetIds, ...(entry.sha256s ?? [])].filter(Boolean));
  if (keys.size === 0) return [];
  const seen = new Set<string>();
  return runs
    .filter((w) => w.source_type === 'image_to_cad' && (w.client_flow ?? 'image') === 'image' && w.status === 'completed' && w.prompt)
    .filter((w) => (w.reference_image_keys ?? []).some((k) => keys.has(k)))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .flatMap((w) => {
      const text = w.prompt as string;
      if (seen.has(text)) return [];
      seen.add(text);
      return [{ text, createdAt: w.created_at }];
    });
}

/**
 * The dimensions typed for the latest finished CAD from Image run that used
 * any of these "My Pieces" images, or null.
 */
export async function findReusedDimensions(entry: Pick<CadLibraryEntry, 'assetIds' | 'sha256s'>): Promise<string | null> {
  const keys = [...entry.assetIds, ...(entry.sha256s ?? [])].filter(Boolean);
  if (keys.length === 0) return null;
  const runs = await listMyWorkflows(100, 0);
  return matchRunPrompts(entry, runs)[0]?.text ?? null;
}
