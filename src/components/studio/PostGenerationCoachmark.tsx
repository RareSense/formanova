import { type RefObject, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const COACHMARK_COUNT_KEY = 'formanova_post_generation_coachmark_count_v2';
const COACHMARK_SEEN_KEY = 'formanova_post_generation_coachmark_seen_v2';
const COACHMARK_DISMISSED_KEY = 'formanova_post_generation_coachmark_dismissed_v2';
const MAX_COACHMARK_SHOWS = 3;
const COACHMARK_DELAY_MS = 400;
const MAX_STORED_GENERATIONS = 30;

function readStringList(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writeStringList(key: string, values: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(values.slice(-MAX_STORED_GENERATIONS)));
  } catch {
    // Ignore storage failures so the coachmark never blocks the results screen.
  }
}

function readShowCount(): number {
  try {
    const value = Number(window.localStorage.getItem(COACHMARK_COUNT_KEY) ?? '0');
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function writeShowCount(value: number) {
  try {
    window.localStorage.setItem(COACHMARK_COUNT_KEY, String(value));
  } catch {
    // Ignore storage failures so the coachmark never blocks the results screen.
  }
}

function rememberGeneration(key: string, storageKey: string) {
  const values = readStringList(storageKey);
  if (values.includes(key)) return;
  writeStringList(storageKey, [...values, key]);
}

interface PostGenerationCoachmarkProps {
  enabled: boolean;
  generationKey: string;
  dismissSignal: number;
  targetRef: RefObject<HTMLElement>;
  anchorRef?: RefObject<HTMLElement>;
  onVisibilityChange?: (visible: boolean) => void;
}

interface CoachmarkLayout {
  cardLeft: number;
  cardTop: number;
  cardWidth: number;
  side: 'right' | 'bottom';
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function PostGenerationCoachmark({
  enabled,
  generationKey,
  dismissSignal,
  targetRef,
  anchorRef,
  onVisibilityChange,
}: PostGenerationCoachmarkProps) {
  const [visible, setVisible] = useState(false);
  const [layout, setLayout] = useState<CoachmarkLayout | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onVisibilityChange?.(visible);
  }, [onVisibilityChange, visible]);

  useEffect(() => {
    setVisible(false);

    if (!enabled || !generationKey) return;

    const dismissedGenerations = readStringList(COACHMARK_DISMISSED_KEY);
    if (dismissedGenerations.includes(generationKey)) return;

    const seenGenerations = readStringList(COACHMARK_SEEN_KEY);
    const showCount = readShowCount();
    if (showCount >= MAX_COACHMARK_SHOWS && !seenGenerations.includes(generationKey)) return;

    const timer = window.setTimeout(() => {
      setVisible(true);

      if (!seenGenerations.includes(generationKey)) {
        rememberGeneration(generationKey, COACHMARK_SEEN_KEY);
        writeShowCount(Math.min(showCount + 1, MAX_COACHMARK_SHOWS));
      }
    }, COACHMARK_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [enabled, generationKey]);

  useEffect(() => {
    if (!dismissSignal || !generationKey) return;
    rememberGeneration(generationKey, COACHMARK_DISMISSED_KEY);
    setVisible(false);
  }, [dismissSignal, generationKey]);

  const handleDismiss = () => {
    rememberGeneration(generationKey, COACHMARK_DISMISSED_KEY);
    setVisible(false);
  };

  useEffect(() => {
    if (!visible) {
      setLayout(null);
      return;
    }

    const updateLayout = () => {
      const target = targetRef.current;
      if (!target) return;

      const targetRect = target.getBoundingClientRect();
      const anchorRect = anchorRef?.current?.getBoundingClientRect() ?? targetRect;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const cardWidth = Math.min(218, viewportWidth - 32);
      const measuredHeight = cardRef.current?.offsetHeight ?? 66;
      const sideGap = 34;
      const canPlaceLeft = targetRect.left - cardWidth - sideGap >= 16;
      const cardLeft = canPlaceLeft
        ? targetRect.left - cardWidth - sideGap
        : clamp(anchorRect.left + anchorRect.width / 2 - cardWidth / 2, 16, viewportWidth - cardWidth - 16);
      const cardTop = canPlaceLeft
        ? clamp(targetRect.top + targetRect.height / 2 - measuredHeight / 2, 88, viewportHeight - measuredHeight - 16)
        : Math.max(88, anchorRect.top - measuredHeight - 10);

      setLayout({
        cardLeft,
        cardTop,
        cardWidth,
        side: canPlaceLeft ? 'right' : 'bottom',
      });
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);
    window.addEventListener('scroll', updateLayout, true);

    return () => {
      window.removeEventListener('resize', updateLayout);
      window.removeEventListener('scroll', updateLayout, true);
    };
  }, [anchorRef, targetRef, visible]);

  if (!visible || !layout || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Dismiss coachmark"
        onClick={handleDismiss}
        className="fixed inset-0 z-[60] appearance-none border-0 bg-black/45 p-0"
      />
      <div
        className="pointer-events-none fixed z-[80]"
        style={{
          left: layout.cardLeft,
          top: layout.cardTop,
          width: layout.cardWidth,
        }}
      >
        <div ref={cardRef} className="pointer-events-auto relative border border-[hsl(var(--formanova-hero-accent))]/35 bg-white px-3.5 pb-3 pt-7 text-black shadow-[0_14px_34px_hsl(0_0%_0%/0.16)]">
          {layout.side === 'right' && (
            <span className="pointer-events-none absolute -right-3 top-1/2 h-6 w-6 -translate-y-1/2 rotate-45 border-r border-t border-[hsl(var(--formanova-hero-accent))]/35 bg-white" />
          )}
          {layout.side === 'bottom' && (
            <span className="pointer-events-none absolute -bottom-3 left-8 h-6 w-6 rotate-45 border-b border-r border-[hsl(var(--formanova-hero-accent))]/35 bg-white" />
          )}
          <span className="pointer-events-none absolute bottom-0 left-0 h-1 w-full bg-[hsl(var(--formanova-hero-accent))]" />
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss coachmark"
            className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center text-black/55 transition-colors hover:text-black"
          >
            <X className="h-3.5 w-3.5" />
          </button>

          <div className="pr-1">
            <h3 className="font-body text-[12px] font-semibold leading-5 text-black">Not satisfied? Click this button</h3>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
