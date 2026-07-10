import { useState, useRef } from 'react';
import { X, Check, Pencil, ExternalLink, Loader2, Trash2, Instagram, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FIELD_BOX_CLASS, FIELD_INPUT_CLASS, FIELD_ICON_BUTTON_CLASS } from '@/components/brand/InlineField';

function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

function socialIcon(url: string) {
  try {
    const host = new URL(url).hostname;
    if (host.includes('instagram.com')) return Instagram;
  } catch { /* fall through */ }
  return Link2;
}

interface SocialRowProps {
  url: string;
  /** Pass the edited URL to update, or null to remove this profile. */
  onSave: (value: string | null) => Promise<string | null>;
}

/** One social profile chip: icon + link + external open + pencil; editable with save/cancel/remove. */
export function SocialRow({ url, onSave }: SocialRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(url);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const Icon = socialIcon(url);

  const startEdit = () => {
    setDraft(url);
    setError(null);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const act = async (value: string | null) => {
    setSaving(true);
    setError(null);
    const message = await onSave(value);
    setSaving(false);
    if (message) {
      setError(message);
      return;
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="space-y-1.5 col-span-full">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="url"
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setError(null); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void act(draft);
              if (e.key === 'Escape') setEditing(false);
            }}
            placeholder="instagram.com/yourbrand"
            className={FIELD_INPUT_CLASS}
          />
          <button
            type="button"
            onClick={() => void act(draft)}
            disabled={saving}
            className={cn(FIELD_ICON_BUTTON_CLASS, 'text-foreground hover:border-foreground')}
            aria-label="Save"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={saving}
            className={cn(FIELD_ICON_BUTTON_CLASS, 'text-muted-foreground hover:text-foreground')}
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void act(null)}
            disabled={saving}
            className={cn(FIELD_ICON_BUTTON_CLASS, 'text-muted-foreground hover:border-destructive hover:text-destructive')}
            aria-label="Remove"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className={FIELD_BOX_CLASS}>
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{displayUrl(url)}</span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        aria-label="Open link"
      >
        <ExternalLink className="h-4 w-4" />
      </a>
      <button
        type="button"
        onClick={startEdit}
        className="shrink-0 p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        aria-label="Edit link"
      >
        <Pencil className="h-4 w-4" />
      </button>
    </div>
  );
}
