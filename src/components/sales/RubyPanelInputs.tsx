import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Check, Diamond, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PURPOSE_LABELS, acceptsFiles, normalizeLink, type UploadOutcome } from '@/lib/ruby-call/client-uploads';

export type { UploadOutcome };
import type { UploadPurpose } from '@/lib/ruby-call/panels';
import { normalizeReach, reachField, type ReachChannel } from '@/lib/ruby-call/reach-contact';

interface UploadCardProps {
  purpose: UploadPurpose;
  note?: string;
  onUpload(files: File[]): Promise<UploadOutcome[]>;
  onLink(url: string): void;
  onLinkTyping(): void;
}

/**
 * Nova-style upload row: what to send on the left, one button on the right, one
 * status line under it; then a single field for any link. CAD and other large files
 * come as links only.
 */
interface UploadItem {
  key: string;
  name: string;
  preview: string | null;
  state: 'sending' | 'ok' | 'error';
  error?: string;
}

/** "3 images received", "1 of 2 images received", or what is still on its way. */
export function receivedSummary(items: UploadItem[]): string {
  const sending = items.filter((i) => i.state === 'sending').length;
  if (sending) return sending === 1 ? 'Sending your image…' : `Sending ${sending} images…`;
  const ok = items.filter((i) => i.state === 'ok').length;
  const noun = (k: number) => (k === 1 ? 'image' : 'images');
  if (ok === items.length) return `${ok} ${noun(ok)} received`;
  return ok === 0 ? "Nothing went through yet. Please try again." : `${ok} of ${items.length} ${noun(items.length)} received`;
}

export function UploadCard({ purpose, note, onUpload, onLink, onLinkTyping }: UploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [over, setOver] = useState(false);
  const files = acceptsFiles(purpose);
  const previews = useRef<string[]>([]);
  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const send = async (list: File[]) => {
    if (!list.length) return;
    const batch: UploadItem[] = list.map((f, i) => {
      let preview: string | null = null;
      try {
        preview = URL.createObjectURL(f);
        previews.current.push(preview);
      } catch {
        preview = null; // no preview (e.g. HEIC in some browsers): the name still shows
      }
      return { key: `${Date.now()}-${i}-${f.name}`, name: f.name, preview, state: 'sending' };
    });
    setItems((prev) => [...prev, ...batch]);
    const settle = (outcomes: UploadOutcome[] | null) =>
      setItems((prev) =>
        prev.map((item) => {
          const at = batch.findIndex((b) => b.key === item.key);
          if (at < 0) return item;
          const o = outcomes?.[at];
          return o?.ok ? { ...item, state: 'ok' } : { ...item, state: 'error', error: o?.error ?? "Didn't go through. Please try again." };
        }),
      );
    try {
      settle(await onUpload(list));
    } catch {
      settle(null);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (files) void send(Array.from(e.dataTransfer.files ?? []));
  };

  return (
    <div className="space-y-4">
      {files && (
        <div
          data-testid="ruby-upload"
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          className={`flex min-w-0 flex-col gap-3 border-2 p-3 sm:flex-row sm:items-center sm:gap-4 ${
            over ? 'border-[hsl(var(--formanova-hero-accent))] bg-[hsl(var(--formanova-hero-accent)/0.08)]' : 'border-border'
          }`}
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Diamond className="h-9 w-9 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold">Send your {PURPOSE_LABELS[purpose]}</p>
              <p className="mt-0.5 break-words text-xs text-muted-foreground">
                {note || 'JPG, PNG, WebP or HEIC, up to 20 MB each. Drop them here or choose.'}
              </p>
            </div>
          </div>
          <Button type="button" className="h-11 shrink-0 px-5" onClick={() => inputRef.current?.click()}>
            {items.length ? 'Add more images' : 'Choose images'}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            multiple
            className="sr-only"
            aria-label="Choose images to upload"
            onChange={(e) => {
              const list = Array.from(e.target.files ?? []);
              // Cleared first, so picking the same file again still works.
              e.target.value = '';
              void send(list);
            }}
          />
        </div>
      )}
      {files && items.length > 0 && (
        <div className="space-y-2">
          <p data-testid="upload-note" aria-live="polite" className="flex items-center gap-1.5 text-sm font-semibold">
            {items.every((i) => i.state === 'ok') && (
              <Check className="h-4 w-4 shrink-0 text-[hsl(var(--formanova-hero-accent))]" aria-hidden="true" />
            )}
            {receivedSummary(items)}
          </p>
          <ul aria-label="Your uploads" className="grid gap-2 sm:grid-cols-2">
            {items.map((item) => (
              <li key={item.key} className="flex min-w-0 items-center gap-2 border border-border p-1.5">
                {item.preview ? (
                  <img src={item.preview} alt="" className="h-10 w-10 shrink-0 object-cover" />
                ) : (
                  <Diamond className="h-10 w-10 shrink-0 p-2 text-muted-foreground" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{item.name}</p>
                  {item.state === 'sending' && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Sending…
                    </p>
                  )}
                  {item.state === 'ok' && (
                    <p className="flex items-center gap-1 text-xs">
                      <Check className="h-3 w-3 text-[hsl(var(--formanova-hero-accent))]" aria-hidden="true" /> Received
                    </p>
                  )}
                  {item.state === 'error' && (
                    <p className="flex items-start gap-1 break-words text-xs text-destructive">
                      <X className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" /> {item.error}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!files && note && <p className="break-words text-sm text-muted-foreground">{note}</p>}
      <LinkField onLink={onLink} onTyping={onLinkTyping} />
    </div>
  );
}

interface LinkFieldProps {
  onLink(url: string): void;
  onTyping(): void;
}

/** One field for any link: Drive, Dropbox, WeTransfer or the store. */
export function LinkField({ onLink, onTyping }: LinkFieldProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const typed = useRef(false);

  const submit = () => {
    const url = normalizeLink(value);
    if (!url) {
      setError('Please paste a web link, like drive.google.com/…');
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
      <label htmlFor="ruby-link" className="block text-xs text-muted-foreground">
        Paste any link (Drive, Dropbox, WeTransfer, your store URL)
      </label>
      <div className="flex min-w-0 gap-2">
        <Input
          id="ruby-link"
          value={value}
          inputMode="url"
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
          Send
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
          <span className="min-w-0 break-all">Link received: {sent}</span>
        </p>
      )}
    </form>
  );
}

interface ContactFieldProps {
  channel: ReachChannel;
  onReach(channel: ReachChannel, value: string): void;
}

/** Where the creative team may text the client: the field matches the channel they chose. */
export function ContactField({ channel, onReach }: ContactFieldProps) {
  const spec = reachField(channel);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const submit = () => {
    const clean = normalizeReach(channel, value);
    if (!clean) {
      setError(spec.inputMode === 'tel' ? 'Please add the country code, like +44 7700 900123.' : `Please check your ${spec.name.toLowerCase()}.`);
      return;
    }
    setError(null);
    setSent(clean);
    setValue('');
    onReach(channel, clean);
  };

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor="ruby-reach" className="block text-xs text-muted-foreground">
        {spec.label}
      </label>
      <div className="flex min-w-0 gap-2">
        <Input
          id="ruby-reach"
          value={value}
          inputMode={spec.inputMode}
          autoComplete={spec.inputMode === 'tel' ? 'tel' : spec.inputMode === 'email' ? 'email' : 'off'}
          placeholder={spec.placeholder}
          className="h-11 min-w-0 flex-1"
          onChange={(e) => setValue(e.target.value)}
        />
        <Button type="submit" className="h-11 shrink-0 px-5">
          Send
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
          <span className="min-w-0 break-all">Saved: {sent}</span>
        </p>
      )}
    </form>
  );
}
