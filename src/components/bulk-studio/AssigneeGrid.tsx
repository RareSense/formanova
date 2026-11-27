/** Grid of model/scene cards for the assign drawer. Square-edged, gold when picked. */
import { useRef } from 'react';
import { Check, Diamond, Loader2 } from 'lucide-react';
import { useAuthenticatedImage } from '@/hooks/useAuthenticatedImage';
import { IMAGE_ACCEPT } from '@/lib/bulk-studio';
import type { ShotAssignee } from '@/lib/shot-list';

const MONO = 'font-mono text-[10px] uppercase tracking-wider';

function AssigneeCard({
  item, picked, multi, onPick,
}: { item: ShotAssignee; picked: boolean; multi: boolean; onPick: () => void }) {
  const src = useAuthenticatedImage(item.imageUrl);
  return (
    <button
      type="button"
      role={multi ? 'checkbox' : undefined}
      aria-checked={multi ? picked : undefined}
      aria-label={item.name}
      onClick={onPick}
      className={`relative flex min-w-0 flex-col border text-left transition-colors ${
        picked ? 'border-formanova-hero-accent' : 'border-border hover:border-foreground/40'
      }`}
    >
      <div className="aspect-[3/4] w-full bg-muted">
        {src ? <img src={src} alt="" draggable={false} className="h-full w-full object-cover" /> : <div className="h-full w-full animate-pulse" />}
      </div>
      {multi && (
        <span
          className={`absolute left-2 top-2 flex h-5 w-5 items-center justify-center border ${
            picked ? 'border-formanova-hero-accent bg-formanova-hero-accent text-primary-foreground' : 'border-border bg-background/85'
          }`}
        >
          {picked && <Check className="h-3.5 w-3.5" />}
        </span>
      )}
      <span className={`truncate px-2 py-1.5 ${MONO}`}>{item.name}</span>
    </button>
  );
}

function UploadCard({ label, uploading, onFile }: { label: string; uploading: boolean; onFile: (f: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        disabled={uploading}
        onClick={() => input.current?.click()}
        className="flex aspect-[3/4] w-full cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-border px-2 text-center hover:border-formanova-hero-accent disabled:cursor-default"
      >
        {uploading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : <Diamond className="h-9 w-9 text-primary" />}
        <span className={`${MONO} text-foreground/60`}>{uploading ? 'Uploading' : label}</span>
      </button>
      <input
        ref={input} type="file" accept={IMAGE_ACCEPT} className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }}
      />
    </>
  );
}

interface AssigneeGridProps {
  items: ShotAssignee[];
  pickedIds: Set<string>;
  multi: boolean;
  onPick: (item: ShotAssignee) => void;
  upload?: { label: string; uploading: boolean; onFile: (f: File) => void };
}

export function AssigneeGrid({ items, pickedIds, multi, onPick, upload }: AssigneeGridProps) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
      {upload && <UploadCard {...upload} />}
      {items.map((item) => (
        <AssigneeCard key={item.id} item={item} multi={multi} picked={pickedIds.has(item.id)} onPick={() => onPick(item)} />
      ))}
    </div>
  );
}
