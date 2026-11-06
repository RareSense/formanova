import { useId, useState, type FocusEvent, type ReactNode } from "react";
import { previewPrompt } from "@/lib/prompt-preview";

interface PromptHoverPreviewProps {
  /** The prompt to preview; nothing is shown when null or blank. */
  prompt: string | null;
  /** How many other prompts exist besides this one, shown as "+N more". */
  moreCount?: number;
  /** Where the preview sits, relative to the wrapper (Tailwind position classes). */
  positionClassName: string;
  /** The card's control; given the id to describe itself by while the preview shows. */
  children: (describedBy: string | undefined) => ReactNode;
}

/**
 * A short "…" preview of a prompt while a card is hovered or keyboard
 * focused. Deliberately not the full text: the card stays compact, and the
 * complete prompt lands in the prompt box once the card is chosen.
 *
 * Rendered only while open, so the page holds no second copy of the text, and
 * pointer-events-none so it never covers the next card's click.
 */
export default function PromptHoverPreview({ prompt, moreCount = 0, positionClassName, children }: PromptHoverPreviewProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const preview = prompt?.trim() ? previewPrompt(prompt) : "";
  const showing = open && Boolean(preview);

  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
  };

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={onBlur}
      onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
    >
      {children(showing ? id : undefined)}
      {showing && (
        <div
          id={id}
          role="tooltip"
          className={`pointer-events-none absolute z-20 border border-border/40 bg-background/95 px-2 py-1.5 text-left shadow-md ${positionClassName}`}
        >
          <p className="line-clamp-2 break-words font-body text-[11px] leading-snug text-foreground">{preview}</p>
          {moreCount > 0 && (
            <p className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">+{moreCount} more</p>
          )}
        </div>
      )}
    </div>
  );
}
