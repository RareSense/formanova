/**
 * The CAD queue as one table: every run with all its columns, grouped by what it needs next
 * (To start, To review, Running, Done) with a header row per group, so a short queue reads at a
 * glance without switching views. Clicking a row opens the run.
 */
import { ExternalLink, Play } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { QUEUE_GROUPS, STARTABLE, ago } from '@/lib/cad-queue-view';
import {
  supervisedRunTypeLabel,
  supervisedStatusLabel,
  type SupervisedPhase,
  type SupervisedRunListItem,
} from '@/lib/supervised-runs-api';

// On phones only Waiting, User and Status show; the whole row opens the run (Start is there and in Start all).
const WIDE = 'hidden md:table-cell';
const COLUMNS: Array<{ name: string; wideOnly?: boolean }> = [
  { name: 'Waiting' }, { name: 'User' }, { name: 'Type', wideOnly: true }, { name: 'Status' },
  { name: 'Tries', wideOnly: true }, { name: 'Updated', wideOnly: true }, { name: 'Notes', wideOnly: true },
];

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function firstLine(text: string): string {
  return text.split(/\r?\n/, 1)[0];
}

function StatusBadge({ phase, attempt }: { phase: SupervisedPhase; attempt: number }) {
  const variant =
    phase === 'delivered' ? 'default'
      : phase === 'errored' || phase === 'failed' ? 'destructive'
        : 'secondary';
  return (
    <Badge variant={variant} className="md:whitespace-nowrap">
      {supervisedStatusLabel(phase, attempt)}
    </Badge>
  );
}

export default function CadQueueTable({ items, grouped, now, rowResults, starting, onStart, onOpen }: {
  items: SupervisedRunListItem[];
  /** Show a header row per group (the All open view). */
  grouped: boolean;
  now: number;
  rowResults: Map<string, string>;
  starting: boolean;
  onStart: (item: SupervisedRunListItem) => void;
  onOpen: (item: SupervisedRunListItem) => void;
}) {
  const sections = grouped
    ? QUEUE_GROUPS
      .map((group) => ({ group, rows: items.filter((item) => group.phases.includes(item.phase)) }))
      .filter((section) => section.rows.length > 0)
    : [{ group: null, rows: items }];

  return (
    <div className="overflow-x-auto border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map(({ name, wideOnly }) => (
              <TableHead key={name} className={`whitespace-nowrap font-mono text-[10px] uppercase tracking-widest ${wideOnly ? WIDE : ''}`}>{name}</TableHead>
            ))}
            <TableHead className={`text-right ${WIDE}`}><span className="sr-only">Action</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sections.map(({ group, rows }) => [
            group && (
              <TableRow key={`group-${group.key}`} className="bg-muted/40 hover:bg-muted/40">
                <TableCell colSpan={COLUMNS.length + 1} className="py-2">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]">{group.label}</span>
                  <span className="ml-2 font-mono text-[10px] text-muted-foreground tabular-nums">{rows.length}</span>
                </TableCell>
              </TableRow>
            ),
            ...rows.map((item) => {
              const startable = STARTABLE.includes(item.phase);
              const result = rowResults.get(item.workflow_id);
              return (
                <TableRow key={item.workflow_id} className="cursor-pointer" onClick={() => onOpen(item)}>
                  <TableCell className="whitespace-nowrap" title={formatDateTime(item.created_at)}>
                    <span className="block text-sm tabular-nums">{ago(item.created_at, now)}</span>
                    <span className="hidden font-mono text-[10px] text-muted-foreground md:block">{formatDateTime(item.created_at)}</span>
                  </TableCell>
                  <TableCell className="max-w-[160px] sm:max-w-[240px]">
                    <span className="block truncate text-sm" title={item.user_email || undefined}>{item.user_email || '-'}</span>
                    {item.is_paying && (
                      <Badge variant="outline" className="mt-1 px-1.5 py-0 font-mono text-[9px] uppercase tracking-wider">Paying</Badge>
                    )}
                  </TableCell>
                  <TableCell className={`whitespace-nowrap text-sm ${WIDE}`}>{supervisedRunTypeLabel(item.workflow_name)}</TableCell>
                  <TableCell className="max-w-[120px] md:max-w-[280px]">
                    <StatusBadge phase={item.phase} attempt={item.attempt} />
                    {item.phase === 'errored' && item.last_error && (
                      <span className="mt-1 block truncate text-xs text-muted-foreground" title={item.last_error}>
                        {firstLine(item.last_error)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className={`text-sm tabular-nums ${WIDE}`}>{item.attempt}</TableCell>
                  <TableCell className={`whitespace-nowrap text-sm tabular-nums ${WIDE}`} title={formatDateTime(item.updated_at)}>
                    {ago(item.updated_at, now)}
                  </TableCell>
                  <TableCell className={`text-sm tabular-nums ${WIDE}`}>{item.note_count || '-'}</TableCell>
                  <TableCell className={`text-right ${WIDE}`} onClick={(event) => event.stopPropagation()}>
                    <div className="flex flex-col items-end gap-1">
                      {startable ? (
                        <Button size="sm" className="h-8 w-24 gap-1.5 px-4" disabled={starting} onClick={() => onStart(item)}>
                          <Play className="h-3.5 w-3.5" />
                          Start
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="h-8 w-24 gap-1.5 px-4" onClick={() => onOpen(item)}>
                          Open
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {result && (
                        <span className={`max-w-[160px] break-all text-xs ${result === 'Started.' ? 'text-muted-foreground' : 'font-mono text-destructive'}`}>
                          {result}
                        </span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            }),
          ])}
        </TableBody>
      </Table>
    </div>
  );
}
