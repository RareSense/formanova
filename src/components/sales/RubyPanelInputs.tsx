import { useRef, useState, type DragEvent } from 'react';
import { Check, Diamond, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { acceptsFiles, normalizeLink } from '@/lib/ruby-call/client-uploads';
import type { UploadPurpose } from '@/lib/ruby-call/panels';

export interface UploadOutcome {
  name: string;
  ok: boolean;
  error?: string;
}

type FileRow = { name: string; state: 'uploading' | 'done' | 'failed'; error?: string };

interface UploadCardProps {
  purpose: UploadPurpose;
  onUpload(files: File[]): Promise<UploadOutcome[]>;
  onLink(url: string): void;
  onLinkTyping(): void;
}

/** Drop zone for photos and references; CAD and other files are shared as links. */
export function UploadCard({ purpose, onUpload, onLink, onLinkTyping }: UploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<FileRow[]>([]);
  const [over, setOver] = useState(false);

  if (!acceptsFiles(purpose)) {
    return (
      <div className="space-y-3">
        <p className="text-justify text-sm text-muted-foreground">
          Files like these are too large to send here. Please share a link instead (Google Drive, Dropbox or WeTransfer).
        </p>
        <LinkField onLink={onLink} onTyping={onLinkTyping} />
      </div>
    );
  }

  const send = async (files: File[]) => {
    if (!files.length) return;
    setRows((r) => [...r, ...files.map((f) => ({ name: f.name, state: 'uploading' as const }))]);
    const outcomes = await onUpload(files);
    setRows((r) =>
      r.map((row) => {
        const out = outcomes.find((o) => o.name === row.name);
        if (!out || row.state !== 'uploading') return row;
        return { name: row.name, state: out.ok ? 'done' : 'failed', error: out.error };
      }),
    );
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void send(Array.from(e.dataTransfer.files ?? []));
  };

  return (
    <div className="space-y-3">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center gap-3 border-2 border-dashed px-4 py-6 text-center transition-colors ${
          over ? 'border-[hsl(var(--formanova-hero-accent))] bg-[hsl(var(--formanova-hero-accent)/0.08)]' : 'border-border'
        }`}
      >
        <Diamond className="h-9 w-9 text-primary" aria-hidden="true" />
        <span className="text-sm text-muted-foreground">Drop images here, or</span>
        <Button
          type="button"
          size="lg"
          className="h-12 px-6"
          onClick={(e) => {
            // The label would open the picker too; open it once.
            e.preventDefault();
            inputRef.current?.click();
          }}
        >
          Choose images
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          aria-label="Choose images to upload"
          onChange={(e) => {
            void send(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </label>
      {rows.length > 0 && (
        <ul className="space-y-1.5 text-sm" aria-live="polite">
          {rows.map((row, i) => (
            <li key={`${row.name}-${i}`} className="flex min-w-0 items-center gap-2">
              {row.state === 'uploading' && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
              {row.state === 'done' && <Check className="h-4 w-4 shrink-0 text-[hsl(var(--formanova-hero-accent))]" />}
              {row.state === 'failed' && <X className="h-4 w-4 shrink-0 text-destructive" />}
              <span className="truncate">{row.name}</span>
              {row.state === 'failed' && (
                <span className="ml-auto shrink-0 text-xs text-destructive">{row.error || 'Failed, try again'}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface LinkFieldProps {
  onLink(url: string): void;
  onTyping(): void;
}

export function LinkField({ onLink, onTyping }: LinkFieldProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const typed = useRef(false);

  const submit = () => {
    const url = normalizeLink(value);
    if (!url) {
      setError('Please paste a web link, like https://drive.google.com/…');
      return;
    }
    setError(null);
    setSent(url);
    setValue('');
    typed.current = false;
    onLink(url);
  };

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex gap-2">
        <Input
          value={value}
          inputMode="url"
          aria-label="Link"
          placeholder="https://"
          className="h-11 min-w-0 flex-1"
          onChange={(e) => {
            setValue(e.target.value);
            if (!typed.current && e.target.value) {
              typed.current = true;
              onTyping();
            }
          }}
        />
        <Button type="submit" className="h-11 shrink-0 px-5">
          Send link
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {sent && !error && (
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <Check className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--formanova-hero-accent))]" />
          <span className="truncate">Link received: {sent}</span>
        </p>
      )}
    </form>
  );
}
