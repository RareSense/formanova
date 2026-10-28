/**
 * The note an admin leaves for the user with a supervised CAD run: the box shown while the run can
 * still be sent or failed, and the saved note shown once the decision is made.
 *
 * The note goes with Send, Send replacement or Fail and is saved only when that press is accepted;
 * a refused press keeps the draft here so the admin can fix the problem and press again. Once
 * saved it is final. With no note, the view says so, so the card can still sit beside My notes.
 *
 * Length is counted in characters the way the backend counts them ([...text]), never with
 * .length or a maxLength attribute: both count UTF-16 units and can cut an emoji in half. A change
 * that would go over the limit is refused, not shortened.
 */
import { Lightbulb } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { USER_NOTE_MAX_CHARS, userNoteLength } from '@/lib/supervised-runs-api';
import { parseServerTime } from '@/lib/server-time';

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const date = parseServerTime(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

export function UserNoteField({ value, onChange, disabled = false, className }: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const used = userNoteLength(value);
  const atLimit = used >= USER_NOTE_MAX_CHARS;

  function change(next: string) {
    // Refuse a change that goes over the limit (typing or a long paste), but always allow removing.
    if (userNoteLength(next) > USER_NOTE_MAX_CHARS && userNoteLength(next) >= used) return;
    onChange(next);
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-display text-2xl tracking-wide">
          <Lightbulb className="h-5 w-5 text-primary" aria-hidden="true" />
          Note to user
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Textarea
          aria-label="Note to user"
          value={value}
          disabled={disabled}
          onChange={(event) => change(event.target.value)}
          placeholder="Optional. For example: Your photos were dark and from one side only. Next time send three sharp photos (front, side, top) in daylight."
          className="min-h-24"
        />
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <p className="min-w-0 flex-1">
            The user reads this with their result. It goes with Send, Send replacement or Fail, and can't be changed after that. Leave it empty when there's nothing to say.
          </p>
          <span className={`shrink-0 tabular-nums ${atLimit ? 'text-destructive' : ''}`} aria-live="polite">
            {`${used} / ${USER_NOTE_MAX_CHARS}`}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export function UserNoteView({ note, by, at, className }: { note: string | null; by: string | null; at: string | null; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-display text-2xl tracking-wide">
          <Lightbulb className="h-5 w-5 text-primary" aria-hidden="true" />
          Note to user
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {note ? (
          <>
            <p className="flex flex-wrap gap-x-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {by && <span className="break-all normal-case">{by}</span>}
              <span>{formatDateTime(at)}</span>
            </p>
            <p className="whitespace-pre-wrap break-words border border-border bg-muted/40 p-3 text-sm leading-relaxed [overflow-wrap:anywhere]">
              {note}
            </p>
          </>
        ) : (
          // No note was sent, or the run is in a phase where none can be written yet.
          <p className="text-sm text-muted-foreground">No note to user.</p>
        )}
      </CardContent>
    </Card>
  );
}
