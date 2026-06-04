import { type RefObject, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const COACHMARK_COUNT_KEY = 'formanova_post_generation_coachmark_count_v3';
const COACHMARK_SEEN_KEY = 'formanova_post_generation_coachmark_seen_v3';
const COACHMARK_DISMISSED_KEY = 'formanova_post_generation_coachmark_dismissed_v3';
const MAX_COACHMARK_SHOWS = 3;
const COACHMARK_DELAY_MS = 600;
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
  } catch {}
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
  } catch {}
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
  targetRef: RefObject<HTMLElement | HTMLButtonElement>;
  anchorRef?: RefObject<HTMLElement>;
  observeRef?: RefObject<HTMLElement>;
  onVisibilityChange?: (visible: boolean) => void;
}

interface CoachmarkLayout {
  cardLeft: number;
  cardTop: number;
  cardWidth: number;
  side: 'right' | 'bottom';
}

// hidden → measuring (card in DOM, invisible) → visible
type Phase = 'hidden' | 'measuring' | 'visible';

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function computeLayout(
  targetRef: RefObject<HTMLElement>,
  anchorRef: RefObject<HTMLElement> | undefined,
  cardEl: HTMLDivElement,
): CoachmarkLayout {
  const target = targetRef.current!;
  const targetRect = target.getBoundingClientRect();
  const anchorRect = anchorRef?.current?.getBoundingClientRect() ?? targetRect;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const cardWidth = Math.min(218, viewportWidth - 32);
  const cardHeight = cardEl.offsetHeight;
  const sideGap = 34;
  const canPlaceLeft = targetRect.left - cardWidth - sideGap >= 16;
  const cardLeft = canPlaceLeft
    ? targetRect.left - cardWidth - sideGap
    : clamp(anchorRect.left + anchorRect.width / 2 - cardWidth / 2, 16, viewportWidth - cardWidth - 16);
  const cardTop = canPlaceLeft
    ? clamp(targetRect.top + targetRect.height / 2 - cardHeight / 2, 88, viewportHeight - cardHeight - 16)
    : Math.max(88, anchorRect.top - cardHeight - 10);
  return { cardLeft, cardTop, cardWidth, side: canPlaceLeft ? 'right' : 'bottom' };
}

export function PostGenerationCoachmark({
  enabled,
  generationKey,
  dismissSignal,
  targetRef,
  anchorRef,
  observeRef,
  onVisibilityChange,
}: PostGenerationCoachmarkProps) {
  const [phase, setPhase] = useState<Phase>('hidden');
  const [layout, setLayout] = useState<CoachmarkLayout | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onVisibilityChange?.(phase === 'visible');
  }, [onVisibilityChange, phase]);

  useEffect(() => {
    setPhase('hidden');
    setLayout(null);

    if (!enabled || !generationKey) return;

    const dismissedGenerations = readStringList(COACHMARK_DISMISSED_KEY);
    if (dismissedGenerations.includes(generationKey)) return;

    const timer = window.setTimeout(() => {
      setPhase('measuring');
    }, COACHMARK_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [enabled, generationKey]);

  useEffect(() => {
    if (!dismissSignal || !generationKey) return;
    rememberGeneration(generationKey, COACHMARK_DISMISSED_KEY);
    setPhase('hidden');
    setLayout(null);
  }, [dismissSignal, generationKey]);

  const handleDismiss = () => {
    rememberGeneration(generationKey, COACHMARK_DISMISSED_KEY);
    setPhase('hidden');
    setLayout(null);
  };

  // Measuring phase: card is in the DOM (invisible at -9999). One RAF fires after
  // the browser has painted — animation is done, refs are valid, height is real.
  useEffect(() => {
    if (phase !== 'measuring') return;

    const rafId = window.requestAnimationFrame(() => {
      if (!targetRef.current || !cardRef.current) return;
      setLayout(computeLayout(targetRef, anchorRef, cardRef.current));
      setPhase('visible');
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [phase, targetRef, anchorRef]);

  // Reposition on resize/scroll while visible.
  // ResizeObserver on observeRef re-measures whenever result images load and expand layout.
  useEffect(() => {
    if (phase !== 'visible') return;

    const reposition = () => {
      if (!targetRef.current || !cardRef.current) return;
      setLayout(computeLayout(targetRef, anchorRef, cardRef.current));
    };

    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleDismiss(); };
    window.addEventListener('keydown', onKey);

    let ro: ResizeObserver | null = null;
    if (observeRef?.current) {
      let rafId = 0;
      ro = new ResizeObserver(() => {
        window.cancelAnimationFrame(rafId);
        rafId = window.requestAnimationFrame(reposition);
      });
      ro.observe(observeRef.current);
    }

    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('keydown', onKey);
      ro?.disconnect();
    };
  }, [phase, targetRef, anchorRef, observeRef]);

  if (phase === 'hidden' || typeof document === 'undefined') return null;

  return createPortal(
    <>
      {phase === 'visible' && (
        <button
          type="button"
          aria-label="Dismiss coachmark"
          onClick={handleDismiss}
          className="fixed inset-0 z-[60] appearance-none border-0 bg-[hsl(var(--foreground))]/20 backdrop-brightness-75 p-0"
        />
      )}
      <div
        className="pointer-events-none fixed z-[80]"
        style={{
          left: layout ? layout.cardLeft : -9999,
          top: layout ? layout.cardTop : -9999,
          width: layout ? layout.cardWidth : 218,
          opacity: phase === 'visible' ? 1 : 0,
        }}
      >
        <div ref={cardRef} className="pointer-events-auto relative border border-[hsl(var(--formanova-hero-accent))]/35 bg-card px-3.5 pb-3 pt-7 text-card-foreground shadow-[0_14px_34px_hsl(0_0%_0%/0.16)]">
          {layout?.side === 'right' && (
            <span className="pointer-events-none absolute -right-3 top-1/2 h-6 w-6 -translate-y-1/2 rotate-45 border-r border-t border-[hsl(var(--formanova-hero-accent))]/35 bg-card" />
          )}
          {layout?.side === 'bottom' && (
            <span className="pointer-events-none absolute -bottom-3 left-8 h-6 w-6 rotate-45 border-b border-r border-[hsl(var(--formanova-hero-accent))]/35 bg-card" />
          )}
          <span className="pointer-events-none absolute bottom-0 left-0 h-1 w-full bg-[hsl(var(--formanova-hero-accent))]" />
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss coachmark"
            className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <div className="text-center">
            <h3 className="font-body text-[12px] font-semibold leading-5 text-foreground">Not satisfied? Click this button</h3>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
