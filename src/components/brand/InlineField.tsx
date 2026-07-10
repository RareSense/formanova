import { useState, useEffect, useRef } from 'react';
import { X, Check, Pencil, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export const FIELD_BOX_CLASS =
  'flex w-full items-center gap-2 border border-border bg-background px-4 py-3';

export const FIELD_INPUT_CLASS =
  'min-w-0 flex-1 border border-foreground bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none';

export const FIELD_ICON_BUTTON_CLASS =
  'flex h-11 w-11 shrink-0 items-center justify-center border border-border transition-colors';

interface InlineFieldProps {
  label: string;
  value: string;
  /** Optional read-mode rendering of the value (e.g. "US · UAE" while editing "US, UAE"). */
  displayValue?: string;
  placeholder: string;
  required?: boolean;
  /** Optional leading icon shown in the read-mode box (e.g. MapPin for location). */
  icon?: React.ComponentType<{ className?: string }>;
  onSave: (value: string) => Promise<string | null>;
}

/**
 * Read-only value box with a pencil that flips it into an input with explicit
 * save/cancel (Enter/Escape) and a brief saved confirmation.
 */
export function InlineField({ label, value, displayValue, placeholder, required, icon: Icon, onSave }: InlineFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);

  const startEdit = () => {
    setDraft(value);
    setError(null);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  const save = async () => {
    if (required && !draft.trim()) {
      setError(`${label} is required.`);
      return;
    }
    setSaving(true);
    setError(null);
    const message = await onSave(draft);
    setSaving(false);
    if (message) {
      setError(message);
      return;
    }
    setEditing(false);
    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="space-y-1.5">
      <p className="text-sm text-foreground/90">{label}</p>
      {editing ? (
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setError(null); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save();
              if (e.key === 'Escape') cancel();
            }}
            placeholder={placeholder}
            className={FIELD_INPUT_CLASS}
          />
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className={cn(FIELD_ICON_BUTTON_CLASS, 'text-foreground hover:border-foreground')}
            aria-label="Save"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={saving}
            className={cn(FIELD_ICON_BUTTON_CLASS, 'text-muted-foreground hover:text-foreground')}
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className={FIELD_BOX_CLASS}>
          {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <span className={cn('min-w-0 flex-1 truncate text-sm', value ? 'text-foreground' : 'text-muted-foreground/60')}>
            {(value && (displayValue ?? value)) || placeholder}
          </span>
          {saved && (
            <span className="flex shrink-0 items-center gap-1 text-xs text-formanova-success">
              <Check className="h-3.5 w-3.5" />
              Saved
            </span>
          )}
          <button
            type="button"
            onClick={startEdit}
            className="shrink-0 p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label={`Edit ${label}`}
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
