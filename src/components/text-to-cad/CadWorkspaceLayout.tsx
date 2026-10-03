/**
 * The CAD workspace frame shared by /text-to-cad and /image-to-cad: left panel
 * (brief, references, versions), the 3D view, right panel (Material / Parts).
 *
 * - desktop (>= 1280): the three resizable columns exactly as before.
 * - tablet: the 3D view takes the full width; the left panel slides in as a
 *   sheet, the right one as a drawer over the view (inside it, so it still
 *   works in fullscreen) that closes on Esc or a tap on the view.
 * - phone: the 3D view on top, a bottom sheet with Material / Parts / the left
 *   panel as tabs, and the result actions pinned underneath.
 *
 * The one rule everything here bends around: the 3D view keeps the same place
 * in the React tree in every mode. Side panels are added and removed around it
 * as `false` slots, never by wrapping it in something else, so rotating a
 * tablet or resizing a window never remounts the canvas (no lost WebGL
 * context, no lost edits or undo history).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PanelLeftClose, PanelRightClose, PanelLeft, PanelRight } from 'lucide-react';
import type { ImperativePanelHandle } from 'react-resizable-panels';

import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import type { CadBreakpoint } from '@/hooks/use-cad-breakpoint';
import { cn } from '@/lib/utils';

import { CadPhoneSheet, type CadSheetSnap } from './CadPhoneSheet';

export type CadPanelSection = 'material' | 'parts';

export interface CadWorkspaceLayoutProps {
  mode: CadBreakpoint;
  hasModel: boolean;
  isFullscreen: boolean;
  /** Rendered first, outside the panels (e.g. the status dialog). */
  before?: ReactNode;
  /** The left panel. */
  left: ReactNode;
  /** Its tab name in the phone sheet. */
  leftLabel: string;
  /** The right panel; `section` is set when the phone sheet shows one part of it. */
  right: (section?: CadPanelSection) => ReactNode;
  /** Everything drawn inside the 3D view: canvas and overlays. */
  viewport: ReactNode;
  /** Phone only: the dock under the sheet (Improve + Download). */
  phoneActions?: ReactNode;
  /** True while a sheet, drawer or the phone panel is open; keyboard shortcuts pause meanwhile. */
  onPanelsOpenChange?: (open: boolean) => void;
}

const TOGGLE = 'absolute top-2 z-[60] w-8 h-8 flex items-center justify-center bg-card/80 border border-border hover:bg-accent/60 transition-colors';
/** Phone dock height: a 48px button with 8px above and below, plus the home-indicator inset. */
const PHONE_DOCK = 'calc(4rem + env(safe-area-inset-bottom, 0px))';

export function CadWorkspaceLayout({
  mode, hasModel, isFullscreen, before, left, leftLabel, right, viewport, phoneActions, onPanelsOpenChange,
}: CadWorkspaceLayoutProps) {
  const isDesktop = mode === 'desktop';
  const isTablet = mode === 'tablet';
  const isPhone = mode === 'phone';

  // ── desktop: resizable columns ──
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(true);
  const leftPanelRef = useRef<ImperativePanelHandle>(null);
  const rightPanelRef = useRef<ImperativePanelHandle>(null);

  // Expand the right panel when a model arrives, collapse it when it goes.
  // Only on a change: the columns' starting sizes already follow hasModel, and
  // calling expand() in the same pass that mounts the panels (entering desktop
  // from a tablet) throws, because the group has not registered them yet.
  const prevHasModel = useRef(hasModel);
  useEffect(() => {
    if (prevHasModel.current === hasModel) return;
    prevHasModel.current = hasModel;
    if (!isDesktop) return;
    if (hasModel) rightPanelRef.current?.expand(22);
    else rightPanelRef.current?.collapse();
  }, [hasModel, isDesktop]);

  // ── tablet: slide-overs; phone: bottom sheet ──
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [snap, setSnap] = useState<CadSheetSnap>('peek');
  const [tab, setTab] = useState<string>(hasModel ? 'material' : 'left');

  // Crossing a breakpoint starts the new layout with everything closed, and
  // the desktop columns in step with the sizes they mount at.
  useEffect(() => {
    setLeftOpen(false);
    setRightOpen(false);
    setSnap('peek');
    if (isDesktop) {
      setLeftCollapsed(false);
      setRightCollapsed(!hasModel);
    }
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps -- runs on a breakpoint change only; hasModel is read for the sizes the columns mount at, and re-running on it would reopen panels the user closed

  // Material and Parts exist only with a model; a new model opens on Material.
  useEffect(() => {
    setTab(hasModel ? 'material' : 'left');
    if (!hasModel) setRightOpen(false);
  }, [hasModel]);

  const panelsOpen = isTablet ? leftOpen || rightOpen : isPhone ? snap !== 'peek' : false;
  const notify = useRef(onPanelsOpenChange);
  notify.current = onPanelsOpenChange;
  useEffect(() => { notify.current?.(panelsOpen); }, [panelsOpen]);

  // Tablet drawer: Esc closes it, and so does a tap on the 3D view. That tap
  // is swallowed, so closing the drawer never also selects or deselects a
  // part. Native listeners on the view element only: taps inside portalled
  // menus opened from the drawer (the metal / gem pickers) never reach it.
  const viewportRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const rightToggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!isTablet || !rightOpen) return;
    const view = viewportRef.current;
    if (!view) return;
    let swallowClick = false;
    const inside = (t: EventTarget | null) =>
      t instanceof Node && (drawerRef.current?.contains(t) || rightToggleRef.current?.contains(t));
    const onDown = (e: PointerEvent) => {
      if (inside(e.target)) return;
      e.stopPropagation();
      e.preventDefault();
      swallowClick = true;
      setRightOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.stopPropagation();
      e.preventDefault();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRightOpen(false);
    };
    view.addEventListener('pointerdown', onDown, true);
    view.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKey);
    return () => {
      view.removeEventListener('pointerdown', onDown, true);
      // Left in place for the click that follows the closing tap.
      setTimeout(() => view.removeEventListener('click', onClick, true), 0);
      window.removeEventListener('keydown', onKey);
    };
  }, [isTablet, rightOpen]);

  const toggleLeft = () => {
    if (isTablet) { setLeftOpen(true); return; }
    const panel = leftPanelRef.current;
    if (!panel) return;
    if (leftCollapsed) panel.expand(22);
    else panel.collapse();
  };
  const toggleRight = () => {
    if (isTablet) { setRightOpen((o) => !o); return; }
    const panel = rightPanelRef.current;
    if (!panel) return;
    if (rightCollapsed) panel.expand(22);
    else panel.collapse();
  };
  const leftShown = isTablet ? leftOpen : !leftCollapsed;
  const rightShown = isTablet ? rightOpen : !rightCollapsed;

  const phoneTabs = hasModel
    ? [{ id: 'material', label: 'Material' }, { id: 'parts', label: 'Parts' }, { id: 'left', label: leftLabel }]
    : [{ id: 'left', label: leftLabel }];
  const activeTab = phoneTabs.some((t) => t.id === tab) ? tab : phoneTabs[0].id;

  return (
    <div
      data-cad-layout={mode}
      className={isDesktop
        ? 'flex h-[calc(100vh-5rem)] overflow-hidden bg-background'
        // Header is h-16 below lg and h-20 from lg; dvh so Safari's collapsing
        // address bar can never push the dock off screen.
        : cn('relative flex h-[calc(100dvh-4rem)] lg:h-[calc(100dvh-5rem)] overflow-hidden bg-background', isPhone && 'flex-col')}
      style={isPhone && phoneActions ? ({ '--cad-dock': PHONE_DOCK } as React.CSSProperties) : undefined}
      tabIndex={-1}
    >
      {before}
      <ResizablePanelGroup direction="horizontal" className={isDesktop ? 'h-full' : 'flex-1 min-h-0 isolate'}>
        {/* Left panel — always mounted on desktop, use imperative collapse/expand */}
        {isDesktop && (
          <ResizablePanel
            ref={leftPanelRef}
            id="left-panel"
            order={1}
            defaultSize={22}
            minSize={15}
            maxSize={35}
            collapsible
            collapsedSize={0}
            onCollapse={() => setLeftCollapsed(true)}
            onExpand={() => setLeftCollapsed(false)}
            className="relative"
          >
            {!leftCollapsed && left}
          </ResizablePanel>
        )}
        {isDesktop && <ResizableHandle withHandle />}

        {/* Viewport */}
        <ResizablePanel id="viewport-panel" order={2} defaultSize={isDesktop ? (hasModel ? 56 : 78) : 100} minSize={30}>
          <div ref={viewportRef} data-cad-viewport className="relative h-full border-x-2 border-primary/20 shadow-[inset_0_0_30px_-10px_hsl(var(--primary)/0.15)]" style={{ background: "#000000" }}>
            {/* Panel toggles. Hidden in fullscreen, except the tablet's right
                drawer, which lives inside this element and so still works there. */}
            {!isPhone && (
              <>
                {!isFullscreen && (
                  <button
                    onClick={toggleLeft}
                    className={cn(TOGGLE, 'left-2')}
                    title={leftShown ? 'Hide left panel' : 'Show left panel'}
                  >
                    {leftShown ? <PanelLeftClose className="w-4 h-4 text-foreground/70" /> : <PanelLeft className="w-4 h-4 text-foreground/70" />}
                  </button>
                )}
                {hasModel && (!isFullscreen || isTablet) && (
                  <button
                    ref={rightToggleRef}
                    onClick={toggleRight}
                    className={cn(TOGGLE, 'right-2')}
                    title={rightShown ? 'Hide right panel' : 'Show right panel'}
                  >
                    {rightShown ? <PanelRightClose className="w-4 h-4 text-foreground/70" /> : <PanelRight className="w-4 h-4 text-foreground/70" />}
                  </button>
                )}
              </>
            )}

            {viewport}

            {isTablet && hasModel && rightOpen && (
              <div
                ref={drawerRef}
                data-cad-right-drawer
                // top-12 keeps the toggle above it visible, as the drawer's close.
                className="absolute top-12 right-0 bottom-0 z-[65] w-[min(360px,85%)] shadow-2xl animate-in slide-in-from-right duration-200"
              >
                {right()}
              </div>
            )}
          </div>
        </ResizablePanel>

        {/* No handle until there is a model: a divider against an empty
            panel reads as a region that failed to load. */}
        {isDesktop && hasModel && <ResizableHandle withHandle />}

        {/* Right panel — always mounted on desktop, use imperative collapse/expand */}
        {isDesktop && (
          <ResizablePanel
            ref={rightPanelRef}
            id="right-panel"
            order={3}
            // Starts collapsed while there is no model. With defaultSize 22 the
            // panel rendered empty on mount until the effect collapsed it, which
            // flashed a blank region during generation.
            defaultSize={hasModel ? 22 : 0}
            minSize={15}
            maxSize={35}
            collapsible
            collapsedSize={0}
            onCollapse={() => setRightCollapsed(true)}
            onExpand={() => setRightCollapsed(false)}
          >
            {hasModel && !rightCollapsed && right()}
          </ResizablePanel>
        )}
      </ResizablePanelGroup>

      {isPhone && (
        <>
          {/* Room for the peeking tab bar, so it never covers the 3D view's own bottom controls. */}
          <div aria-hidden="true" className="h-14 flex-shrink-0" />
          {phoneActions && (
            <div
              data-cad-dock
              className="flex flex-shrink-0 items-center border-t border-border bg-background px-4 pb-[env(safe-area-inset-bottom,0px)]"
              style={{ height: PHONE_DOCK }}
            >
              {phoneActions}
            </div>
          )}
          <CadPhoneSheet
            tabs={phoneTabs}
            activeTab={activeTab}
            snap={snap}
            onChange={(next) => { setSnap(next.snap); setTab(next.tab); }}
          >
            {activeTab === 'left' ? left : right(activeTab as CadPanelSection)}
          </CadPhoneSheet>
        </>
      )}

      {isTablet && (
        <Sheet open={leftOpen} onOpenChange={setLeftOpen}>
          <SheetContent side="left" aria-describedby={undefined} className="w-[min(380px,85vw)] max-w-none sm:max-w-none p-0 gap-0">
            <SheetTitle className="sr-only">{leftLabel}</SheetTitle>
            {left}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

export default CadWorkspaceLayout;
