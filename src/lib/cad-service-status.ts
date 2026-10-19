/**
 * CAD service availability. While CAD_SERVICE_DOWN is true, every CAD page shows a notice and any
 * attempt to start a CAD run, a design picture or an improvement opens a popup instead of starting
 * (no request is sent, no credits are reserved).
 *
 * To remove: set CAD_SERVICE_DOWN to false (or revert the PR that added this file).
 */
export const CAD_SERVICE_DOWN = true;

let serviceDown = CAD_SERVICE_DOWN;

export function isCadServiceDown(): boolean {
  return serviceDown;
}

/** Tests only (src/test/setup.ts runs the suite with the service up). */
export function setCadServiceDownForTests(down: boolean): void {
  serviceDown = down;
}

export const CAD_DOWN_TITLE = 'CAD services are temporarily down';
export const CAD_DOWN_MESSAGE =
  "We're working on our CAD service right now, so new CAD generations can't start. Please don't try again for now. Your credits are untouched, and your existing designs and downloads are still available.";

const EVENT = 'formanova:cad-service-down';

/** Open the "CAD services are down" popup (rendered by CadServiceDownPopup inside CADGate). */
export function showCadDownPopup(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

export function onCadDownPopup(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

/** True (and the popup is shown) when CAD is down: callers stop before starting anything. */
export function blockIfCadDown(): boolean {
  if (!serviceDown) return false;
  showCadDownPopup();
  return true;
}

export class CadServiceDownError extends Error {
  constructor() {
    super(CAD_DOWN_MESSAGE);
    this.name = 'CadServiceDownError';
  }
}
