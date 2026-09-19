import { useCallback, useEffect, useState } from 'react';
import { invalidate } from '@react-three/fiber';

/**
 * Auto-rotate for the CAD viewport, driven through OrbitControls' public
 * azimuth API.
 *
 * Two things are worth knowing before changing this.
 *
 * First, nothing here rotates the model. `autoRotate` orbits the *camera*
 * around the controls' existing target, so framing, zoom, model position and
 * the mesh transform are all untouched. It is presentation only, which is why
 * it needs no undo entry and leaves nothing to clean up in the scene.
 *
 * Second, `CADCanvas` runs the R3F canvas with `frameloop="demand"`. Relying on
 * OrbitControls' `autoRotate` flag is unstable here because the R3F primitive
 * can reconcile that imperative flag between demanded frames. The loop below
 * advances the same OrbitControls camera target through `setAzimuthalAngle`,
 * based on elapsed time, then asks R3F to paint the result.
 *
 * It reaches the controls through the `__orbitControls` handle that
 * `CADCanvas` publishes on the canvas element, the same channel its own zoom
 * and reset actions use. That keeps auto-rotate out of `CADCanvas.tsx`, which
 * CLAUDE.md marks as protected.
 */

/**
 * OrbitControls' familiar speed scale, converted to elapsed-time movement in
 * the animation loop below. At 2.0 a full revolution takes about 30 seconds,
 * independent of display refresh rate, which reads as a slow inspection turn
 * rather than a distracting animation.
 */
export const AUTO_ROTATE_SPEED = 2.0;

interface AutoRotatableControls {
  enabled: boolean;
  enableDamping: boolean;
  autoRotate: boolean;
  autoRotateSpeed: number;
  getAzimuthalAngle: () => number;
  setAzimuthalAngle: (angle: number) => void;
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
    let previousFrameAt = 0;

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

      // This hook owns camera advancement while presentation rotation is on.
      // Keeping Drei's useFrame update disabled prevents a second native
      // autoRotate step from landing in the same frame.
      controls.enabled = false;
      controls.addEventListener('start', yieldToUser);
      canvas.addEventListener('pointerdown', yieldToUser, true);
      canvas.addEventListener('wheel', yieldToUser, true);
      const tick = (now: number) => {
        if (!active) return;
        if (controls) {
          if (previousFrameAt > 0) {
            // OrbitControls speed 2 is one revolution in ~30 seconds at 60Hz.
            // Cap a resumed/background tab so it cannot jump around the ring.
            const elapsedSeconds = Math.min((now - previousFrameAt) / 1000, 0.05);
            const radiansPerSecond = (Math.PI * 2 / 60) * AUTO_ROTATE_SPEED;
            const hadDamping = controls.enableDamping;
            controls.autoRotate = false;
            controls.enableDamping = false;
            controls.setAzimuthalAngle(
              controls.getAzimuthalAngle() - radiansPerSecond * elapsedSeconds,
            );
            controls.enableDamping = hadDamping;
            // MotionAdaptiveProvider uses this live flag to keep presentation
            // rotation sharp. Movement itself does not depend on the flag.
            controls.autoRotate = true;
          }
          previousFrameAt = now;
        }
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
