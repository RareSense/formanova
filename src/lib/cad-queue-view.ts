/**
 * cad-queue-view.ts
 *
 * How the admin CAD queue groups and words its runs: the groups in the order an admin works
 * through them, which phases can be started, and "how long ago" in plain units.
 */
import type { SupervisedPhase } from '@/lib/supervised-runs-api';
import { parseServerTime } from './server-time';

export const STARTABLE: SupervisedPhase[] = ['queued', 'errored'];

/** The groups, in the order an admin works through them. */
export const QUEUE_GROUPS: Array<{ key: string; label: string; phases: SupervisedPhase[] }> = [
  { key: 'start', label: 'To start', phases: ['queued', 'errored'] },
  { key: 'review', label: 'To review', phases: ['awaiting_review', 'rejected'] },
  { key: 'running', label: 'Running', phases: ['running', 'finalizing'] },
  { key: 'done', label: 'Done', phases: ['delivered', 'failed'] },
];

/** How long ago, in the largest whole unit: "just now", "12 min", "3 h", "2 d". */
export function ago(value: string | null, now: number): string {
  if (!value) return '-';
  const then = parseServerTime(value).getTime();
  if (Number.isNaN(then)) return '-';
  const minutes = Math.max(0, Math.floor((now - then) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}
