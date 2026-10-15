/**
 * Step 1 of Text to CAD and Image to CAD: which piece is being made.
 *
 * Square picture cards rather than a dropdown, the way shop and design tools
 * ask "what are you making?" before anything else. It is a radio group, so
 * nothing is chosen at first (the person has to pick), arrow keys move the
 * choice, and only the chosen card sits in the tab order (the first card while
 * nothing is chosen). `error` is shown under the cards when Generate was tried
 * without a choice.
 */

import { useId, useRef, type KeyboardEvent } from 'react';
import { Check } from 'lucide-react';

import { CAD_JEWELRY_TYPES, type CadJewelryType } from '@/lib/ring-cad-nurbs-api';
import { cn } from '@/lib/utils';
import ringImage from '@/assets/cad-jewelry-types/ring.webp';
import necklaceImage from '@/assets/cad-jewelry-types/necklace.webp';
import braceletImage from '@/assets/cad-jewelry-types/bracelet.webp';
import earringImage from '@/assets/cad-jewelry-types/earring.webp';
import otherImage from '@/assets/cad-jewelry-types/other.webp';

const CARD_IMAGES: Partial<Record<CadJewelryType, string>> = {
  ring: ringImage,
  necklace: necklaceImage,
  bracelet: braceletImage,
  earring: earringImage,
};

interface CadJewelryTypeCardsProps {
  value: CadJewelryType | null;
  onChange: (value: CadJewelryType) => void;
  disabled?: boolean;
  error?: string | null;
}

export default function CadJewelryTypeCards({ value, onChange, disabled, error }: CadJewelryTypeCardsProps) {
  const otherHintId = useId();
  const errorId = useId();
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (disabled) return;
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1
      : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = (index + step + CAD_JEWELRY_TYPES.length) % CAD_JEWELRY_TYPES.length;
    onChange(CAD_JEWELRY_TYPES[next].value);
    cardRefs.current[next]?.focus();
  };

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Jewelry type"
        aria-required="true"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="grid grid-cols-3 gap-3 sm:grid-cols-5"
      >
        {CAD_JEWELRY_TYPES.map((type, index) => {
          const selected = type.value === value;
          const image = CARD_IMAGES[type.value];
          return (
            <button
              key={type.value}
              ref={(el) => { cardRefs.current[index] = el; }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={type.label}
              aria-describedby={type.value === 'other' ? otherHintId : undefined}
              tabIndex={selected || (value === null && index === 0) ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(type.value)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cn(
                'relative flex flex-col overflow-hidden border bg-background text-left transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
                selected
                  ? 'border-formanova-hero-accent ring-1 ring-formanova-hero-accent'
                  : error
                    ? 'border-destructive hover:border-foreground/40'
                    : 'border-border hover:border-foreground/40',
              )}
            >
              {/* The renders share one grey backdrop; Other uses the same grey so
                  all five squares read as one set. */}
              <div className="relative aspect-square w-full overflow-hidden bg-muted/30">
                {image ? (
                  <img src={image} alt="" draggable={false} className="h-full w-full object-cover" />
                ) : (
                  // Other: a faint tiara behind the words, so it reads as one of the set.
                  <>
                    <img src={otherImage} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover opacity-30" />
                    <div className="relative flex h-full items-center justify-center px-3 text-center">
                      <span id={otherHintId} className="text-xs font-medium leading-snug text-foreground">Brooches, tiaras, watches &amp; more</span>
                    </div>
                  </>
                )}
                {selected && (
                  <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center bg-formanova-hero-accent">
                    <Check aria-hidden="true" strokeWidth={3} className="h-3 w-3 text-background" />
                  </span>
                )}
              </div>
              <span className="flex h-9 items-center justify-center font-mono text-[11px] uppercase tracking-[0.15em] text-foreground">
                {type.label}
              </span>
            </button>
          );
        })}
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-2 font-mono text-[11px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
