import { useCallback, useEffect, useState } from 'react';
import { invalidate } from '@react-three/fiber';

/**
 * Auto-rotate for the CAD viewport, driven entirely by OrbitControls' own
 * `autoRotate`.
 *
 * Two things are worth knowing before changing this.
 *
 * First, nothing here rotates the model. `autoRotate` orbits the *camera*
 * around the controls' existing target, so framing, zoom, model position and
 * the mesh transform are all untouched. It is presentation only, which is why
 * it needs no undo entry and leaves nothing to clean up in the scene.
 *
 * Second, this hook has to pump frames. `CADCanvas` runs the R3F canvas with
 * `frameloop="demand"`, so a frame renders only when something calls
 * `invalidate()`. OrbitControls advances auto-rotation inside `update()`, and
 * drei calls `update()` from a `useFrame` - which only runs on a rendered
 * frame. Setting `autoRotate = true` on its own therefore animates nothing:
 * no frame, no update, no rotation, no reason to render another frame. The
 * requestAnimationFrame loop below breaks that standstill by supplying the
 * ticks demand mode withholds. It performs no rotation maths of its own.
 *
 * It reaches the controls through the `__orbitControls` handle that
 * `CADCanvas` publishes on the canvas element, the same channel its own zoom
 * and reset actions use. That keeps auto-rotate out of `CADCanvas.tsx`, which
 * CLAUDE.md marks as protected.
 */

/**
 * Degrees of orbit per rendered frame, expressed as OrbitControls' speed unit
 * (2*PI/60/60 radians per update). At 2.0 a full revolution takes about 30
 * seconds on a 60Hz display, which reads as a slow inspection turn rather than
 * an animation. Note the unit is per update, not per second, so a 120Hz
 * display completes a turn in about half the time; that is an OrbitControls
 * characteristic, not something introduced here.
 */
export const AUTO_ROTATE_SPEED = 2.0;

interface AutoRotatableControls {
  enabled: boolean;
  autoRotate: boolean;
  autoRotateSpeed: number;
  update: () => void;
  addEventListener: (type: string, fn: () => void) => void;
  removeEventListener: (type: string, fn: () => void) => void;
}

function getOrbitControls(): AutoRotatableControls | null {
  // Version cards also use a shared canvas. Scope this lookup to the main CAD
  // viewport so adding version previews cannot make auto-rotate drive a tiny
  // card while the workspace camera appears to fight or ignore the user.
  const canvas = document.querySelector<HTMLCanvasElement>('[data-cad-viewport] canvas');
  return (canvas as unknown as { __orbitControls?: AutoRotatableControls })?.__orbitControls ?? null;
}

function getViewportCanvas(): HTMLCanvasElement | null {
  return document.querySelector<HTMLCanvasElement>('[data-cad-viewport] canvas');
}

export interface UseCadAutoRotateReturn {
  isAutoRotating: boolean;
  toggleAutoRotate: () => void;
  /** Explicit stop, for actions that should cancel it (Reset View). */
  stopAutoRotate: () => void;
}

export function useCadAutoRotate(): UseCadAutoRotateReturn {
  const [isAutoRotating, setIsAutoRotating] = useState(false);

  const toggleAutoRotate = useCallback(() => setIsAutoRotating(running => !running), []);
  const stopAutoRotate = useCallback(() => setIsAutoRotating(false), []);

  useEffect(() => {
    const canvas = getViewportCanvas();
    if (!canvas) {
      // Nothing to drive. Fall back to idle rather than leaving the button
      // showing an active state for rotation that cannot happen.
      if (isAutoRotating) setIsAutoRotating(false);
      return;
    }

    let controls: AutoRotatableControls | null = null;
    let frame = 0;
    let attempts = 0;
    let active = true;

    // OrbitControls fires 'start' on pointer down, never for auto-rotation
    // itself, so it is a clean signal that the user has taken over. Yielding
    // immediately stops the camera fighting the drag.
    const yieldToUser = () => {
      // Pointer capture runs before OrbitControls' own bubbling handler. Turn
      // the controls back on synchronously so the same gesture that stops the
      // presentation orbit also starts the user's drag; no second click is
      // required.
      if (controls) {
        controls.autoRotate = false;
        controls.enabled = true;
      }
      setIsAutoRotating(false);
    };

    function attachAndTick() {
      if (!active) return;
      controls = getOrbitControls();
      if (!controls) {
        // CADCanvas publishes its controls after the canvas mounts. Give that
        // effect up to two seconds instead of turning the user's click off.
        if (++attempts < 120) frame = requestAnimationFrame(attachAndTick);
        else setIsAutoRotating(false);
        return;
      }
      controls.autoRotate = isAutoRotating;
      controls.autoRotateSpeed = AUTO_ROTATE_SPEED;
      if (!isAutoRotating) return;

      // Drei normally advances OrbitControls from useFrame. A demand-rendered
      // canvas can miss that first update and leave the active button moving
      // nothing. Drive the live controls here, and temporarily keep Drei from
      // updating them a second time in the same frame. This also removes the
      // uneven double-step that reads as fluttering on slower GPUs.
      controls.enabled = false;
      controls.addEventListener('start', yieldToUser);
      canvas.addEventListener('pointerdown', yieldToUser, true);
      canvas.addEventListener('wheel', yieldToUser, true);
      const tick = () => {
        if (!active) return;
        controls?.update();
        invalidate();
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }

    attachAndTick();

    return () => {
      active = false;
      cancelAnimationFrame(frame);
      controls?.removeEventListener('start', yieldToUser);
      canvas.removeEventListener('pointerdown', yieldToUser, true);
      canvas.removeEventListener('wheel', yieldToUser, true);
      // Always clear it, including on unmount: a viewport left with
      // autoRotate set would resume the moment anything else invalidated.
      if (controls) {
        controls.autoRotate = false;
        controls.enabled = true;
      }
    };
  }, [isAutoRotating]);

  return { isAutoRotating, toggleAutoRotate, stopAutoRotate };
}
