/**
 * The phone's bottom sheet: a tab bar that peeks under the 3D view and drags
 * (or taps) up to half or nearly full height.
 *
 * Non-modal on purpose: the ring above stays live, so a material can be tried
 * and the result turned over without closing anything. Built in-tree rather
 * than on vaul so it is not portalled (it lives inside the workspace, which is
 * what the rest of the layout measures against) and so its heights are plain
 * CSS percentages of the workspace, which follow rotation and Safari's
 * collapsing address bar without any window maths.
 */
import { useEffect, useRef, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { sheetAfterDrag, sheetAfterTabPress, type CadSheetHeights, type CadSheetSnap } from './cad-sheet-snap';

/** A drag shorter than this is a tap, not a drag. */
const TAP_SLOP_PX = 6;

/** Height of the peeking tab bar (grip + tabs): 0.75rem + 2.75rem. The layout's spacer under the view matches it (h-14). */
const CAD_SHEET_PEEK = '3.5rem';

const SNAP_HEIGHT: Record<CadSheetSnap, string> = {
  peek: CAD_SHEET_PEEK,
  // Percentages of the area above the action dock (see `bottom` below).
  half: `calc((100% - var(--cad-dock, 0px)) * 0.5)`,
  full: `calc(100% - var(--cad-dock, 0px) - ${CAD_SHEET_PEEK})`,
};

export interface CadPhoneSheetProps {
  tabs: { id: string; label: string }[];
  activeTab: string;
  snap: CadSheetSnap;
  onChange: (next: { snap: CadSheetSnap; tab: string }) => void;
  children: ReactNode;
}

export function CadPhoneSheet({ tabs, activeTab, snap, onChange, children }: CadPhoneSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; startHeight: number; moved: boolean; pointerId: number } | null>(null);
  const suppressClick = useRef(false);
  const latest = useRef({ snap, activeTab, onChange });
  latest.current = { snap, activeTab, onChange };

  // Esc lowers an open sheet back to its tab bar.
  useEffect(() => {
    if (snap === 'peek') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      latest.current.onChange({ snap: 'peek', tab: latest.current.activeTab });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [snap]);

  const measure = (): CadSheetHeights | null => {
    const el = sheetRef.current;
    const area = el?.offsetParent as HTMLElement | null;
    if (!el || !area) return null;
    const dock = parseFloat(getComputedStyle(el).bottom) || 0;
    const available = area.clientHeight - dock;
    const peek = el.querySelector<HTMLElement>('[data-sheet-header]')?.offsetHeight ?? 56;
    return { peek, half: available * 0.5, full: available - peek };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = sheetRef.current;
    if (!el) return;
    drag.current = { startY: e.clientY, startHeight: el.offsetHeight, moved: false, pointerId: e.pointerId };

    const onMove = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d || ev.pointerId !== d.pointerId) return;
      const dy = ev.clientY - d.startY;
      if (!d.moved && Math.abs(dy) < TAP_SLOP_PX) return;
      d.moved = true;
      const h = measure();
      const max = h ? h.full : d.startHeight;
      const min = h ? h.peek : 0;
      el.style.transition = 'none';
      el.style.height = `${Math.max(min, Math.min(max, d.startHeight - dy))}px`;
    };
    const onUp = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d || ev.pointerId !== d.pointerId) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      drag.current = null;
      if (!d.moved) return;
      suppressClick.current = true;
      const h = measure();
      const { snap: from, activeTab: tab, onChange: emit } = latest.current;
      const next = h ? sheetAfterDrag(from, el.offsetHeight, h) : from;
      el.style.transition = '';
      // Written here as well as by React: when the sheet settles back where it
      // started React sees no change and would leave the dragged height behind.
      el.style.height = SNAP_HEIGHT[next];
      emit({ snap: next, tab });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  // A drag that started on a tab must not also count as pressing it.
  const onClickCapture = (e: React.MouseEvent) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    e.stopPropagation();
    e.preventDefault();
  };

  const open = snap !== 'peek';

  return (
    <div
      ref={sheetRef}
      data-cad-phone-sheet={snap}
      className="absolute inset-x-0 z-[70] flex flex-col overflow-hidden rounded-t-xl border-t border-border bg-card shadow-[0_-8px_30px_-12px_rgba(0,0,0,0.6)] transition-[height] duration-200 ease-out"
      style={{ bottom: 'var(--cad-dock, 0px)', height: SNAP_HEIGHT[snap] }}
    >
      <div
        data-sheet-header
        className="flex-shrink-0 select-none touch-none"
        onPointerDown={onPointerDown}
        onClickCapture={onClickCapture}
      >
        <button
          type="button"
          aria-label={open ? 'Collapse panel' : 'Expand panel'}
          onClick={() => onChange({ snap: open ? 'peek' : 'half', tab: activeTab })}
          className="flex h-3 w-full items-center justify-center"
        >
          <span aria-hidden="true" className="h-1 w-10 rounded-full bg-muted-foreground/40" />
        </button>
        <div role="tablist" aria-label="Workspace panels" className="flex h-11 border-b border-border">
          {tabs.map((t) => {
            const selected = t.id === activeTab;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onChange(sheetAfterTabPress(snap, activeTab, t.id))}
                className={cn(
                  'flex-1 px-4 font-display text-sm uppercase tracking-[0.15em] transition-colors duration-150 border-b-2',
                  selected && open ? 'border-primary text-foreground' : selected ? 'border-transparent text-foreground' : 'border-transparent text-muted-foreground',
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      {/* Stays mounted while peeking so the panels keep their search, scroll and open families. */}
      <div role="tabpanel" hidden={!open} className={cn('min-h-0 flex-1 flex-col', open ? 'flex' : 'hidden')}>
        {children}
      </div>
    </div>
  );
}

export default CadPhoneSheet;
