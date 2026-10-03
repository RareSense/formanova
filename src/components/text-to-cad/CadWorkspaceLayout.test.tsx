import { useEffect } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CadWorkspaceLayout, type CadWorkspaceLayoutProps } from './CadWorkspaceLayout';
import type { CadBreakpoint } from '@/hooks/use-cad-breakpoint';

// The real panels render here, but their imperative expand()/collapse() need
// measured layouts jsdom cannot give. Wrap them so those calls report through
// the same onExpand/onCollapse callbacks a browser fires.
vi.mock('@/components/ui/resizable', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/components/ui/resizable')>();
  const { forwardRef, useImperativeHandle } = await import('react');
  type Props = React.ComponentProps<typeof real.ResizablePanel>;
  const ResizablePanel = forwardRef<unknown, Props>((props, ref) => {
    useImperativeHandle(ref, () => ({ expand: () => props.onExpand?.(), collapse: () => props.onCollapse?.() }));
    return <real.ResizablePanel {...props} />;
  });
  return { ...real, ResizablePanel };
});

/** Stands in for the canvas: counts how often it mounts. */
function Canvas({ onMount }: { onMount: () => void }) {
  useEffect(() => { onMount(); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- counts mounts only
  return <div data-testid="canvas" />;
}

function setup(mode: CadBreakpoint, over: Partial<CadWorkspaceLayoutProps> = {}) {
  const onMount = vi.fn();
  const onPanelsOpenChange = vi.fn();
  const props = (m: CadBreakpoint, extra: Partial<CadWorkspaceLayoutProps> = {}): CadWorkspaceLayoutProps => ({
    mode: m,
    hasModel: true,
    isFullscreen: false,
    left: <div>left panel</div>,
    leftLabel: 'Versions',
    right: (section) => <div>right panel {section ?? 'all'}</div>,
    viewport: <Canvas onMount={onMount} />,
    phoneActions: <button>Download</button>,
    onPanelsOpenChange,
    ...over,
    ...extra,
  });
  const utils = render(<CadWorkspaceLayout {...props(mode)} />);
  const rerender = (m: CadBreakpoint, extra: Partial<CadWorkspaceLayoutProps> = {}) =>
    utils.rerender(<CadWorkspaceLayout {...props(m, extra)} />);
  return { ...utils, rerender, onMount, onPanelsOpenChange };
}

const viewportEl = () => document.querySelector('[data-cad-viewport]') as HTMLElement;

describe('CadWorkspaceLayout', () => {
  it('desktop keeps the three columns with both panel toggles', () => {
    setup('desktop');
    expect(screen.getByText('left panel')).toBeTruthy();
    expect(screen.getByTitle('Hide left panel')).toBeTruthy();
    expect(screen.getByTitle(/right panel/)).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByText('Download')).toBeNull();
  });

  it('desktop opens the right panel when a model arrives', () => {
    const { rerender } = setup('desktop', { hasModel: false });
    expect(screen.queryByText(/right panel/)).toBeNull();
    rerender('desktop', { hasModel: true });
    expect(screen.getByText('right panel all')).toBeTruthy();
  });

  it('entering desktop with a model shows both side panels', () => {
    const { rerender } = setup('tablet');
    rerender('desktop');
    expect(screen.getByText('left panel')).toBeTruthy();
    expect(screen.getByText('right panel all')).toBeTruthy();
  });

  it('never remounts the 3D view when crossing breakpoints', () => {
    const { rerender, onMount } = setup('desktop');
    rerender('tablet');
    rerender('phone');
    rerender('tablet');
    rerender('desktop');
    rerender('phone');
    expect(screen.getByTestId('canvas')).toBeTruthy();
    expect(onMount).toHaveBeenCalledTimes(1);
  });

  describe('tablet', () => {
    it('gives the 3D view the full width, panels closed', () => {
      setup('tablet');
      expect(screen.queryByText('left panel')).toBeNull();
      expect(screen.queryByText(/right panel/)).toBeNull();
    });

    it('slides the left panel in from its toggle', () => {
      const { onPanelsOpenChange } = setup('tablet');
      fireEvent.click(screen.getByTitle('Show left panel'));
      expect(screen.getByRole('dialog').textContent).toContain('left panel');
      expect(onPanelsOpenChange).toHaveBeenLastCalledWith(true);
    });

    it('opens the right drawer over the view and closes it with Esc', () => {
      const { onPanelsOpenChange } = setup('tablet');
      fireEvent.click(screen.getByTitle('Show right panel'));
      expect(viewportEl().querySelector('[data-cad-right-drawer]')?.textContent).toBe('right panel all');
      expect(onPanelsOpenChange).toHaveBeenLastCalledWith(true);
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByText(/right panel/)).toBeNull();
      expect(onPanelsOpenChange).toHaveBeenLastCalledWith(false);
    });

    it('a tap on the view closes the drawer and does not reach the canvas', () => {
      setup('tablet');
      fireEvent.click(screen.getByTitle('Show right panel'));
      const canvasDown = vi.fn();
      screen.getByTestId('canvas').addEventListener('pointerdown', canvasDown);
      act(() => {
        screen.getByTestId('canvas').dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
      });
      expect(screen.queryByText(/right panel/)).toBeNull();
      expect(canvasDown).not.toHaveBeenCalled();
    });

    it('a tap inside the drawer leaves it open', () => {
      setup('tablet');
      fireEvent.click(screen.getByTitle('Show right panel'));
      act(() => {
        screen.getByText(/right panel/).dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
      });
      expect(screen.getByText(/right panel/)).toBeTruthy();
    });

    it('keeps the right drawer reachable in fullscreen', () => {
      setup('tablet', { isFullscreen: true });
      expect(screen.queryByTitle('Show left panel')).toBeNull();
      expect(screen.getByTitle('Show right panel')).toBeTruthy();
    });

    it('has no right toggle before there is a model', () => {
      setup('tablet', { hasModel: false });
      expect(screen.queryByTitle(/right panel/)).toBeNull();
    });
  });

  describe('phone', () => {
    it('shows the view, a peeking sheet with Material / Parts / left, and the dock', () => {
      setup('phone');
      expect(screen.getByTestId('canvas')).toBeTruthy();
      expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Material', 'Parts', 'Versions']);
      expect(screen.queryByRole('tabpanel')).toBeNull();
      expect(screen.getByText('Download')).toBeTruthy();
      expect(screen.queryByTitle(/panel/)).toBeNull();
    });

    it('offers only the left panel before there is a model', () => {
      setup('phone', { hasModel: false });
      expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Versions']);
    });

    it('a tab opens the sheet on that section, and Esc lowers it again', () => {
      const { onPanelsOpenChange } = setup('phone');
      fireEvent.click(screen.getByRole('tab', { name: 'Parts' }));
      expect(screen.getByRole('tabpanel').textContent).toBe('right panel parts');
      expect(onPanelsOpenChange).toHaveBeenLastCalledWith(true);
      fireEvent.click(screen.getByRole('tab', { name: 'Versions' }));
      expect(screen.getByRole('tabpanel').textContent).toBe('left panel');
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByRole('tabpanel')).toBeNull();
      expect(onPanelsOpenChange).toHaveBeenLastCalledWith(false);
    });

    it('closes everything when the breakpoint changes', () => {
      const { rerender, onPanelsOpenChange } = setup('phone');
      fireEvent.click(screen.getByRole('tab', { name: 'Material' }));
      expect(onPanelsOpenChange).toHaveBeenLastCalledWith(true);
      rerender('tablet');
      expect(onPanelsOpenChange).toHaveBeenLastCalledWith(false);
    });
  });
});
