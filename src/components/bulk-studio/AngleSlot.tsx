/**
 * One reference angle thumbnail, or an empty slot to add one.
 * All angles are equal — no cover/hero styling.
 */
import { useRef } from 'react';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import type { ShotAngle } from '@/lib/shot-list';
import { IMAGE_ACCEPT } from '@/lib/bulk-studio';
import { useAuthenticatedImage } from '@/hooks/useAuthenticatedImage';


interface FilledProps {
  angle: ShotAngle;
  index: number;
  total: number;
  onRemove: () => void;
  onMove: (to: number) => void;
}

export function AngleThumb({ angle, index, total, onRemove, onMove }: FilledProps) {
  // Past Jewelry previews are artifact proxy URLs and need the auth header; blob: passes through.
  const src = useAuthenticatedImage(angle.previewUrl);
  return (
    <figure className="group/angle relative h-20 w-20 shrink-0 border border-border bg-muted">
      {src ? <img src={src} alt={`Angle ${index + 1}`} draggable={false} className="h-full w-full object-cover" /> : <div className="h-full w-full animate-pulse bg-muted" />}
      <figcaption className="absolute left-0 bottom-0 bg-background/85 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider">
        Angle {index + 1}
      </figcaption>
      <button
        type="button"
        aria-label={`Remove angle ${index + 1}`}
        onClick={onRemove}
        className="absolute right-0 top-0 flex h-6 w-6 items-center justify-center bg-background/85 text-foreground/70 hover:text-foreground [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/angle:opacity-100 focus-visible:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {total > 1 && (
        <div className="absolute right-0 bottom-0 flex [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/angle:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            aria-label={`Move angle ${index + 1} left`}
            disabled={index === 0}
            onClick={() => onMove(index - 1)}
            className="flex h-6 w-6 items-center justify-center bg-background/85 disabled:opacity-30"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label={`Move angle ${index + 1} right`}
            disabled={index === total - 1}
            onClick={() => onMove(index + 1)}
            className="flex h-6 w-6 items-center justify-center bg-background/85 disabled:opacity-30"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </figure>
  );
}

interface EmptyProps {
  label: string;
  /** compact = small "+ Angle" trigger shown on row hover (Single Angle view). */
  compact?: boolean;
  maxFiles: number;
  onFiles: (files: File[]) => void;
}

export function EmptyAngleSlot({ label, compact, maxFiles, onFiles }: EmptyProps) {
  const input = useRef<HTMLInputElement>(null);
  const pick = (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith('image/')).slice(0, maxFiles);
    if (files.length) onFiles(files);
  };
  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); pick(e.dataTransfer.files); }}
        className={
          compact
            ? 'flex h-20 shrink-0 items-center gap-1 px-3 border border-dashed border-border font-mono text-[10px] uppercase tracking-wider text-foreground/60 hover:text-foreground hover:border-formanova-hero-accent [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/row:opacity-100 focus-visible:opacity-100'
            : 'flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 border border-dashed border-border font-mono text-[9px] uppercase tracking-wider text-foreground/50 hover:text-foreground hover:border-formanova-hero-accent'
        }
      >
        <Plus className="h-4 w-4" />
        {label}
      </button>
      <input
        ref={input}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple={maxFiles > 1}
        className="hidden"
        onChange={(e) => { pick(e.target.files); e.target.value = ''; }}
      />
    </>
  );
}
