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
  autoRotate: boolean;
  autoRotateSpeed: number;
  addEventListener: (type: string, fn: () => void) => void;
  removeEventListener: (type: string, fn: () => void) => void;
}

function getOrbitControls(): AutoRotatableControls | null {
  // Mirrors CADCanvas's own lookup for zoom and reset.
  const canvas = document.querySelector<HTMLCanvasElement>('canvas');
  return (canvas as unknown as { __orbitControls?: AutoRotatableControls })?.__orbitControls ?? null;
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
    const controls = getOrbitControls();
    if (!controls) {
      // Nothing to drive. Fall back to idle rather than leaving the button
      // showing an active state for rotation that cannot happen.
      if (isAutoRotating) setIsAutoRotating(false);
      return;
    }

    controls.autoRotate = isAutoRotating;
    controls.autoRotateSpeed = AUTO_ROTATE_SPEED;

    if (!isAutoRotating) return;

    // OrbitControls fires 'start' on pointer down, never for auto-rotation
    // itself, so it is a clean signal that the user has taken over. Yielding
    // immediately stops the camera fighting the drag.
    const yieldToUser = () => setIsAutoRotating(false);
    controls.addEventListener('start', yieldToUser);

    // Local, not a ref: the handle is created and cancelled inside this one
    // effect run and never needs to outlive it.
    let frame = requestAnimationFrame(function tick() {
      invalidate();
      frame = requestAnimationFrame(tick);
    });

    return () => {
      cancelAnimationFrame(frame);
      controls.removeEventListener('start', yieldToUser);
      // Always clear it, including on unmount: a viewport left with
      // autoRotate set would resume the moment anything else invalidated.
      controls.autoRotate = false;
    };
  }, [isAutoRotating]);

  return { isAutoRotating, toggleAutoRotate, stopAutoRotate };
}
