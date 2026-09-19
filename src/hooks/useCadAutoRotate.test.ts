import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockInvalidate = vi.hoisted(() => vi.fn());
vi.mock('@react-three/fiber', () => ({ invalidate: mockInvalidate }));

import { useCadAutoRotate, AUTO_ROTATE_SPEED } from './useCadAutoRotate';

/** Minimal stand-in for the OrbitControls instance CADCanvas publishes. */
function mountCanvasWithControls() {
  const listeners: Record<string, Array<() => void>> = {};
  const controls = {
    enabled: true,
    autoRotate: false,
    autoRotateSpeed: 0,
    update: vi.fn(),
    addEventListener: (type: string, fn: () => void) => {
      (listeners[type] ??= []).push(fn);
    },
    removeEventListener: (type: string, fn: () => void) => {
      listeners[type] = (listeners[type] ?? []).filter(l => l !== fn);
    },
  };
  const canvas = document.createElement('canvas');
  // Same channel CADCanvas itself uses to reach the live controls.
  (canvas as unknown as { __orbitControls: unknown }).__orbitControls = controls;
  const viewport = document.createElement('div');
  viewport.dataset.cadViewport = '';
  viewport.appendChild(canvas);
  document.body.appendChild(viewport);
  return { controls, canvas, fire: (type: string) => (listeners[type] ?? []).forEach(l => l()), listeners };
}

function mountCanvasWithoutControls() {
  const canvas = document.createElement('canvas');
  const viewport = document.createElement('div');
  viewport.dataset.cadViewport = '';
  viewport.appendChild(canvas);
  document.body.appendChild(viewport);
  return canvas;
}

beforeEach(() => {
  vi.useFakeTimers();
  mockInvalidate.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('useCadAutoRotate', () => {
  it('starts idle', () => {
    mountCanvasWithControls();
    const { result } = renderHook(() => useCadAutoRotate());
    expect(result.current.isAutoRotating).toBe(false);
  });

  it('turns on the controls own autoRotate rather than moving the model', () => {
    // Camera-orbit, not mesh rotation: the model transform must never change.
    const { controls } = mountCanvasWithControls();
    const { result } = renderHook(() => useCadAutoRotate());

    act(() => { result.current.toggleAutoRotate(); });

    expect(result.current.isAutoRotating).toBe(true);
    expect(controls.autoRotate).toBe(true);
    expect(controls.autoRotateSpeed).toBe(AUTO_ROTATE_SPEED);
    expect(controls.enabled).toBe(false);
  });

  it('waits for controls that attach just after the canvas mounts', () => {
    const canvas = mountCanvasWithoutControls();
    const { result } = renderHook(() => useCadAutoRotate());

    act(() => { result.current.toggleAutoRotate(); });
    expect(result.current.isAutoRotating).toBe(true);

    const controls = mountCanvasWithControls().controls;
    (canvas as unknown as { __orbitControls: unknown }).__orbitControls = controls;
    act(() => { vi.advanceTimersByTime(20); });

    expect(controls.autoRotate).toBe(true);
  });

  it('ignores the version-thumbnail canvas that appears before the workspace', () => {
    const thumbnail = document.createElement('canvas');
    const thumbnailControls = { autoRotate: false, autoRotateSpeed: 0 };
    (thumbnail as unknown as { __orbitControls: unknown }).__orbitControls = thumbnailControls;
    document.body.appendChild(thumbnail);
    const { controls } = mountCanvasWithControls();
    const { result } = renderHook(() => useCadAutoRotate());

    act(() => { result.current.toggleAutoRotate(); });

    expect(controls.autoRotate).toBe(true);
    expect(thumbnailControls.autoRotate).toBe(false);
  });

  it('stops when toggled a second time', () => {
    const { controls } = mountCanvasWithControls();
    const { result } = renderHook(() => useCadAutoRotate());

    act(() => { result.current.toggleAutoRotate(); });
    act(() => { result.current.toggleAutoRotate(); });

    expect(result.current.isAutoRotating).toBe(false);
    expect(controls.autoRotate).toBe(false);
  });

  it('pumps frames while running, because the canvas is frameloop=demand', () => {
    // Without this the native autoRotate advances nothing: R3F only renders on
    // demand, and OrbitControls only rotates inside a rendered frame.
    const { controls } = mountCanvasWithControls();
    const { result } = renderHook(() => useCadAutoRotate());

    act(() => { result.current.toggleAutoRotate(); });
    const before = mockInvalidate.mock.calls.length;
    act(() => { vi.advanceTimersByTime(100); });

    expect(mockInvalidate.mock.calls.length).toBeGreaterThan(before);
    expect(controls.update).toHaveBeenCalled();
  });

  it('stops pumping frames once switched off', () => {
    mountCanvasWithControls();
    const { result } = renderHook(() => useCadAutoRotate());

    act(() => { result.current.toggleAutoRotate(); });
    act(() => { result.current.toggleAutoRotate(); });
    const after = mockInvalidate.mock.calls.length;
    act(() => { vi.advanceTimersByTime(200); });

    expect(mockInvalidate.mock.calls.length).toBe(after);
  });

  it('yields to the user the moment they start orbiting by hand', () => {
    // Otherwise the camera fights the drag.
    const { controls, fire } = mountCanvasWithControls();
    const { result } = renderHook(() => useCadAutoRotate());

    act(() => { result.current.toggleAutoRotate(); });
    act(() => { fire('start'); });

    expect(result.current.isAutoRotating).toBe(false);
    expect(controls.autoRotate).toBe(false);
    expect(controls.enabled).toBe(true);
  });

  it('lets the first pointer gesture take over from auto-rotate', () => {
    const { controls, canvas } = mountCanvasWithControls();
    const { result } = renderHook(() => useCadAutoRotate());

    act(() => { result.current.toggleAutoRotate(); });
    act(() => { canvas.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); });

    expect(result.current.isAutoRotating).toBe(false);
    expect(controls.autoRotate).toBe(false);
    expect(controls.enabled).toBe(true);
  });

  it('can be stopped explicitly, which is what Reset View needs', () => {
    const { controls } = mountCanvasWithControls();
    const { result } = renderHook(() => useCadAutoRotate());

    act(() => { result.current.toggleAutoRotate(); });
    act(() => { result.current.stopAutoRotate(); });

    expect(result.current.isAutoRotating).toBe(false);
    expect(controls.autoRotate).toBe(false);
  });

  it('stopping while already idle is a no-op', () => {
    const { result } = renderHook(() => useCadAutoRotate());
    act(() => { result.current.stopAutoRotate(); });
    expect(result.current.isAutoRotating).toBe(false);
  });

  it('leaves no loop running and no autoRotate set after unmount', () => {
    const { controls, listeners } = mountCanvasWithControls();
    const { result, unmount } = renderHook(() => useCadAutoRotate());

    act(() => { result.current.toggleAutoRotate(); });
    unmount();
    const after = mockInvalidate.mock.calls.length;
    act(() => { vi.advanceTimersByTime(300); });

    expect(mockInvalidate.mock.calls.length).toBe(after);
    expect(controls.autoRotate).toBe(false);
    expect(listeners.start ?? []).toHaveLength(0);
  });

  it('stays idle when there is no viewport to drive', () => {
    // No canvas means no controls. The button must not sit in an active state
    // advertising rotation that cannot happen.
    const { result } = renderHook(() => useCadAutoRotate());
    expect(() => act(() => { result.current.toggleAutoRotate(); })).not.toThrow();
    expect(result.current.isAutoRotating).toBe(false);
  });
});
